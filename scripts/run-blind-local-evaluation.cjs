const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { inspectProject } = require("../src/services/project-inspector");
const { exploreLiveProject, mergeLiveExplorationIntoInspection } = require("../src/services/live-explorer");
const { enhanceInspectionWithAi, enhanceFlowPlanWithAi, enhanceInsightsWithAi } = require("../src/services/ai-workflows");
const { generateTestBundle } = require("../src/services/test-generator");
const { runGeneratedTests } = require("../src/services/test-runner");
const { buildInsights } = require("../src/services/insight-builder");
const { createRunDirectory, ensureDirectory, writeJson } = require("../src/services/artifact-store");

const prototypeRoot = path.resolve(__dirname, "..");
const targetPath = path.resolve(process.argv[2] || "");
const model = process.argv[3] || "qwen2.5vl:7b";
const criticModel = process.argv[4] || "";
const aiConfig = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model,
  criticModel,
};

async function main() {
  if (!process.argv[2]) {
    throw new Error("Usage: npm run evaluate:blind-local -- <project-path> [ollama-model]");
  }
  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) throw new Error("The target path must be a local directory.");

  const run = await createRunDirectory(path.join(prototypeRoot, "prototype-runs"), targetPath);
  const evidenceDirectory = path.join(run.artifactsDirectory, "exploration");
  await ensureDirectory(evidenceDirectory);
  const artifactRun = {
    ...run,
    evidenceDirectory,
    artifactBaseUrl: `/artifacts/${run.runId}`,
  };
  const result = {
    protocol: "blind-local-functional-qa-v1",
    target: {
      path: targetPath,
      name: path.basename(targetPath),
      repository: readGitValue(targetPath, ["remote", "get-url", "origin"]),
      commit: readGitValue(targetPath, ["rev-parse", "HEAD"]),
    },
    constraints: {
      execution: "localhost-only",
      access: "guest",
      knownBugInput: false,
      issueMining: false,
      networkTrafficCollection: false,
      destructiveActions: false,
      screenshotProvider: "local-model-only",
    },
    model,
    criticModel: criticModel || model,
    runId: run.runId,
    runDirectory: run.runDirectory,
    status: "running",
    startedAt: new Date().toISOString(),
    stages: {},
  };
  let stage = "project inspection";

  try {
    announce(stage);
    const staticInspection = await inspectProject(targetPath, { onProgress: announceProgress });
    const enhanced = await enhanceInspectionWithAi({ inspection: staticInspection, aiConfig });
    let inspection = enhanced.inspection;
    result.stages.inspection = {
      detection: inspection.detection,
      synopsis: inspection.projectSynopsis,
      capabilities: inspection.ai?.mainCapabilities || [],
      runtime: inspection.runtime,
    };

    stage = "model-guided live exploration and defect discovery";
    announce(stage);
    const runtimeConfig = {
      ...inspection.runtime,
      runInstallBeforeExecution: false,
    };
    const liveExploration = await exploreLiveProject({
      projectPath: targetPath,
      inspection,
      runtimeConfig,
      aiConfig,
      authConfig: { mode: "guest" },
      artifactRun,
      onProgress: announceProgress,
    });
    await writeJson(path.join(run.runDirectory, "exploration.json"), liveExploration);
    await writeJson(path.join(run.resultsDirectory, "potential-bugs.json"), liveExploration.bugDiscovery || {});
    result.stages.exploration = {
      status: liveExploration.status,
      baseUrl: liveExploration.baseUrl,
      visionEnabled: liveExploration.visionEnabled,
      metrics: liveExploration.agenticExploration?.metrics || {},
      steps: liveExploration.agenticExploration?.steps || [],
      states: liveExploration.agenticExploration?.states || [],
      diagnostics: liveExploration.diagnostics || {},
      bugDiscovery: liveExploration.bugDiscovery || null,
    };
    if (liveExploration.status !== "completed") {
      throw new Error(liveExploration.error || "Live exploration did not complete.");
    }
    inspection = mergeLiveExplorationIntoInspection({ inspection, liveExploration });

    stage = "flow and acceptance-criteria planning";
    announce(stage);
    const { plan } = await enhanceFlowPlanWithAi({
      inspection,
      aiConfig,
      authConfig: { mode: "guest" },
      basePlan: {
        mode: "ai-first",
        access: { mode: "guest" },
        summary: "Every flow must be authored from completed live exploration evidence.",
        flows: [],
      },
    });
    const approvedFlows = selectFlows(plan.flows);
    if (!approvedFlows.length) throw new Error("The model produced no admissible evidence-grounded flow.");
    result.stages.planning = { plan, approvedFlowIds: approvedFlows.map((flow) => flow.id) };

    stage = "Playwright test generation";
    announce(stage);
    const generated = await generateTestBundle({
      prototypeRoot,
      projectPath: targetPath,
      inspection,
      approvedFlows,
      runtimeConfig,
      aiConfig,
      authConfig: { mode: "guest" },
      onProgress: announceProgress,
    });
    result.stages.generation = {
      runId: generated.runId,
      tests: generated.generatedTests,
    };

    stage = "Playwright execution";
    announce(stage);
    const execution = await runGeneratedTests({
      prototypeRoot,
      runDirectory: generated.runDirectory,
      resultsDirectory: generated.resultsDirectory,
      targetProjectPath: targetPath,
      runtimeConfig: generated.runtimeConfig,
      authConfig: { mode: "guest" },
      onProgress: announceProgress,
    });
    result.stages.execution = {
      report: execution.report,
      runtime: execution.runtime,
    };

    stage = "result interpretation";
    announce(stage);
    const baseInsights = buildInsights({
      inspection,
      approvedFlows,
      report: execution.report,
      runtime: execution.runtime,
      auth: execution.auth,
      policy: execution.policy,
    });
    const { insights } = await enhanceInsightsWithAi({
      inspection,
      approvedFlows,
      report: execution.report,
      baseInsights,
      generatedTests: generated.generatedTests,
      aiConfig,
    });
    result.stages.insights = insights;
    result.status = execution.report.summary.failed ? "completed-with-test-failures" : "completed";
  } catch (error) {
    result.status = "stopped";
    result.failedStage = stage;
    result.error = String(error.message || error);
  }

  result.completedAt = new Date().toISOString();
  await writeJson(path.join(run.resultsDirectory, "blind-evaluation.json"), result);
  process.stdout.write(`\nEvaluation ${result.status}. Artifacts: ${run.runDirectory}\n`);
  if (result.error) process.stdout.write(`Stopped at ${result.failedStage}: ${result.error}\n`);
  if (result.status === "stopped") process.exitCode = 1;
}

function selectFlows(flows) {
  const confidenceScore = { high: 3, medium: 2, low: 1 };
  return [...(flows || [])]
    .filter((flow) => Array.isArray(flow.evidenceStateIds) && flow.evidenceStateIds.length)
    .sort((left, right) => (confidenceScore[right.confidence] || 0) - (confidenceScore[left.confidence] || 0))
    .slice(0, 3);
}

function readGitValue(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function announce(stage) {
  process.stdout.write(`\n[stage] ${stage}\n`);
}

function announceProgress(event) {
  if (event?.message) process.stdout.write(`[${event.progress || 0}%] ${event.message}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
