const fs = require("fs/promises");
const path = require("path");
const { inspectProject } = require("../src/services/project-inspector");
const { exploreLiveProject, mergeLiveExplorationIntoInspection } = require("../src/services/live-explorer");
const { enhanceInspectionWithAi, enhanceFlowPlanWithAi, enhanceInsightsWithAi } = require("../src/services/ai-workflows");
const { generateTestBundle } = require("../src/services/test-generator");
const { runGeneratedTests } = require("../src/services/test-runner");
const { buildInsights } = require("../src/services/insight-builder");

const prototypeRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(prototypeRoot, "evaluation-results", "ai-first-candidates");
const model = process.argv[3] || "qwen3:8b";
const aiConfig = { provider: "ollama", endpoint: "http://127.0.0.1:11434", model };
const candidates = [
  { id: "janvas", name: "Janvas", projectPath: "C:\\Users\\henri\\Documents\\GitHub\\canvas-wrapper-test" },
  { id: "dopa", name: "Dopa", projectPath: "C:\\Users\\henri\\Documents\\dopa" },
  { id: "mdn-todo", name: "MDN To-do Notifications", projectPath: "C:\\Users\\henri\\Documents\\action-e2e-validation-targets\\mdn-to-do-notifications\\to-do-notifications" },
  { id: "todomvc-react", name: "TodoMVC React", projectPath: "C:\\Users\\henri\\Documents\\action-e2e-validation-targets\\todomvc\\examples\\react" },
  { id: "form-validator", name: "Form Validator", projectPath: "C:\\Users\\henri\\Documents\\action-e2e-validation-targets\\vanillawebprojects\\form-validator" },
  { id: "movie-seat-booking", name: "Movie Seat Booking", projectPath: "C:\\Users\\henri\\Documents\\action-e2e-validation-targets\\vanillawebprojects\\movie-seat-booking" },
];

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const requested = String(process.argv[2] || "all").toLowerCase();
  if (requested === "--rebuild") {
    await rebuildReport();
    return;
  }
  const selected = requested === "all" ? candidates : candidates.filter((candidate) => candidate.id === requested);
  if (!selected.length) throw new Error(`Unknown candidate: ${requested}`);

  for (const candidate of selected) {
    process.stdout.write(`[${candidate.id}] starting AI-first evaluation with ${model}\n`);
    const result = await evaluateCandidate(candidate);
    await fs.writeFile(path.join(outputRoot, `${candidate.id}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await fs.writeFile(path.join(outputRoot, `${candidate.id}-${safeName(model)}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`[${candidate.id}] ${result.status}${result.error ? `: ${result.error}` : ""}\n`);
  }

  await rebuildReport();
}

async function evaluateCandidate(candidate) {
  const startedAt = Date.now();
  const result = {
    ...candidate,
    model,
    protocol: "ai-first-adaptive-v2",
    status: "running",
    startedAt: new Date().toISOString(),
    stages: {},
  };
  let stage = "static inspection";

  try {
    const staticInspection = await inspectProject(candidate.projectPath);
    result.stages.staticInspection = {
      framework: staticInspection.detection.framework,
      appType: staticInspection.detection.appType,
      runtime: staticInspection.runtime,
    };

    stage = "AI project understanding";
    let { inspection } = await enhanceInspectionWithAi({ inspection: staticInspection, aiConfig });
    result.stages.understanding = {
      synopsis: inspection.projectSynopsis,
      capabilities: inspection.ai?.mainCapabilities || [],
      provider: inspection.ai?.label || model,
    };

    stage = "model-guided live exploration";
    const liveExploration = await exploreLiveProject({
      projectPath: candidate.projectPath,
      inspection,
      runtimeConfig: inspection.runtime,
      aiConfig,
      authConfig: { mode: "guest" },
    });
    result.stages.exploration = {
      status: liveExploration.status,
      terminationReason: liveExploration.agenticExploration?.terminationReason || "",
      metrics: liveExploration.agenticExploration?.metrics || {},
      steps: liveExploration.agenticExploration?.steps || [],
      states: (liveExploration.agenticExploration?.states || []).map((state) => ({
        id: state.id,
        path: state.path,
        headings: state.headings,
        buttons: state.buttons,
        inputs: state.inputs,
      })),
    };
    if (liveExploration.status !== "completed") {
      throw new Error(liveExploration.error || "Live exploration did not complete.");
    }

    inspection = mergeLiveExplorationIntoInspection({ inspection, liveExploration });

    stage = "AI flow and criteria planning";
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
    if (!approvedFlows.length) throw new Error("The model produced no approvable evidence-grounded flow.");
    result.stages.planning = {
      mode: plan.mode,
      flowCount: approvedFlows.length,
      flows: approvedFlows.map((flow) => ({
        id: flow.id,
        title: flow.title,
        confidence: flow.confidence,
        evidenceStateIds: flow.evidenceStateIds,
        criteria: flow.criteria,
      })),
    };

    stage = "AI test generation";
    const generated = await generateTestBundle({
      prototypeRoot,
      projectPath: candidate.projectPath,
      inspection,
      approvedFlows,
      runtimeConfig: inspection.runtime,
      aiConfig,
      authConfig: { mode: "guest" },
    });
    result.stages.generation = {
      runId: generated.runId,
      runDirectory: generated.runDirectory,
      tests: generated.generatedTests.map((test) => ({
        title: test.title,
        generationMode: test.generationMode,
        generationNote: test.generationNote,
      })),
    };

    stage = "Playwright execution";
    const execution = await runGeneratedTests({
      prototypeRoot,
      runDirectory: generated.runDirectory,
      resultsDirectory: generated.resultsDirectory,
      targetProjectPath: candidate.projectPath,
      runtimeConfig: generated.runtimeConfig,
      authConfig: { mode: "guest" },
    });
    result.stages.execution = {
      summary: execution.report.summary,
      tests: execution.report.tests.map((test) => ({
        title: test.title,
        status: test.status,
        durationMs: test.durationMs,
        error: test.error || "",
        evidence: test.evidence || [],
      })),
    };

    stage = "AI result interpretation";
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
      generatedTests: generated.generatedTests || [],
      aiConfig,
    });
    result.stages.insights = insights;
    result.status = execution.report.summary.failed ? "completed-with-test-failures" : "completed";
  } catch (error) {
    result.status = "stopped";
    result.failedStage = stage;
    result.error = error.message;
    result.diagnostics = error.diagnostics || null;
  }

  result.durationMs = Date.now() - startedAt;
  result.completedAt = new Date().toISOString();
  return result;
}

function selectFlows(flows) {
  const score = { high: 3, medium: 2, low: 1 };
  return [...(flows || [])]
    .filter((flow) => Array.isArray(flow.evidenceStateIds) && flow.evidenceStateIds.length)
    .sort((left, right) => (score[right.confidence] || 0) - (score[left.confidence] || 0))
    .slice(0, 4);
}

async function rebuildReport() {
  const results = [];
  for (const candidate of candidates) {
    try {
      results.push(JSON.parse(await fs.readFile(path.join(outputRoot, `${candidate.id}.json`), "utf8")));
    } catch {}
  }
  const rows = results.map((result) => {
    const exploration = result.stages?.exploration?.metrics || {};
    const execution = result.stages?.execution?.summary || {};
    const generated = result.stages?.generation?.tests || result.stages?.generation?.modes || [];
    return `| ${result.name} | ${result.protocol || "legacy"} | ${result.model} | ${result.status} | ${result.failedStage || "-"} | ${exploration.completedActions || 0} | ${exploration.uniqueStates || 0} | ${exploration.adaptiveStepLimit || "-"}/${exploration.hardStepLimit || 20} | ${result.stages?.exploration?.terminationReason || "-"} | ${result.stages?.planning?.flowCount || 0} | ${generated.length} | ${execution.passed || 0}/${execution.total || 0} |`;
  });
  const details = results.map((result) => {
    const actions = (result.stages?.exploration?.steps || []).filter((step) => step.status === "completed").map((step) => step.action?.name).filter(Boolean);
    const tests = result.stages?.execution?.tests || [];
    const generated = result.stages?.generation?.tests || result.stages?.generation?.modes || [];
    return `## ${result.name}\n\n- Model: ${result.model}.\n- Status: **${result.status}**${result.failedStage ? ` at **${result.failedStage}**` : ""}.\n- Exploration end: ${result.stages?.exploration?.terminationReason || "not recorded"}; adaptive budget ${result.stages?.exploration?.metrics?.adaptiveStepLimit || "n/a"} of hard ceiling ${result.stages?.exploration?.metrics?.hardStepLimit || 20}.\n- Model actions: ${actions.join("; ") || "none completed"}.\n- Generated tests: ${generated.map((test) => `${test.title} (${test.generationMode})`).join("; ") || "none"}.\n- Execution: ${tests.map((test) => `${test.title}: ${test.status}`).join("; ") || "not reached"}.\n${result.error ? `- Stop reason: ${summarizeError(result.error)}\n` : ""}`;
  }).join("\n");
  const report = `# AI-first Candidate Evaluation\n\nGenerated: ${new Date().toISOString()}\n\nAll runs use guest access, model-guided exploration, model-authored evidence-grounded planning, validated Playwright generation, and fail-fast stage semantics. The model and protocol used by each latest stored run are shown explicitly. Version \`ai-first-adaptive-v2\` includes authoritative action-ID normalization and adaptive budgets; version \`ai-first-fail-fast-v1\` rows are retained as historical comparison and may show action-kind failures fixed in v2. No heuristic flow or test fallback is permitted.\n\n| Candidate | Protocol | Model | Status | Stopped at | Actions | States | Budget | Exploration end | AI flows | Tests | Passed |\n| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |\n${rows.join("\n")}\n\n${details}\n`;
  await fs.writeFile(path.join(prototypeRoot, "AI_FIRST_CANDIDATE_REPORT.md"), report, "utf8");
}

function summarizeError(value) {
  return String(value || "")
    .replace(/\s*Returned shape:[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
