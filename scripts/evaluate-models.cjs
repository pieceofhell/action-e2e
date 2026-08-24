const fs = require("fs/promises");
const path = require("path");
const { inspectProject } = require("../src/services/project-inspector");
const { exploreLiveProject, mergeLiveExplorationIntoInspection } = require("../src/services/live-explorer");
const { enhanceInspectionWithAi, enhanceFlowPlanWithAi } = require("../src/services/ai-workflows");
const { generateFlowPlan } = require("../src/services/flow-planner");
const { generateTestBundle } = require("../src/services/test-generator");
const { runGeneratedTests } = require("../src/services/test-runner");

const prototypeRoot = path.resolve(__dirname, "..");
const projectPath = path.resolve(process.argv[2] || "C:\\Users\\henri\\Documents\\dopa");
const models = String(process.argv[3] || "llama3.1:8b,qwen3:8b,qwen2.5-coder:7b,gemma3:12b")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const outputRoot = path.join(prototypeRoot, "evaluation-results");

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  if (process.argv[2] === "--rebuild") {
    await rebuildExistingReport();
    return;
  }
  const baseInspection = await inspectProject(projectPath);
  const results = [];

  for (const model of models) {
    const result = await evaluateModel({ model, baseInspection });
    results.push(result);
    await fs.writeFile(
      path.join(outputRoot, `${safeName(model)}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    );
  }

  const aggregate = {
    protocol: {
      projectPath,
      models,
      access: "guest",
      explorationStepLimit: 8,
      approvedFlowLimit: 4,
      mutationPolicy: "Browser exploration blocks non-GET network requests and high-risk actions such as checkout, payment, deletion, publishing, and final submission.",
    },
    generatedAt: new Date().toISOString(),
    results,
  };

  await fs.writeFile(path.join(outputRoot, "dopa-model-comparison.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(prototypeRoot, "MODEL_EVALUATION_REPORT.md"), buildMarkdownReport(aggregate), "utf8");
}

async function evaluateModel({ model, baseInspection }) {
  const startedAt = Date.now();
  const aiConfig = {
    provider: "ollama",
    endpoint: "http://127.0.0.1:11434",
    model,
  };
  const result = {
    model,
    status: "running",
    startedAt: new Date().toISOString(),
    stages: {},
  };

  try {
    const liveExploration = await exploreLiveProject({
      projectPath,
      inspection: baseInspection,
      runtimeConfig: baseInspection.runtime,
      aiConfig,
      authConfig: { mode: "guest" },
    });
    result.stages.exploration = {
      status: liveExploration.status,
      strategy: liveExploration.agenticExploration?.strategy || "unknown",
      metrics: normalizeExplorationMetrics(
        liveExploration.agenticExploration?.metrics || {},
        liveExploration.agenticExploration?.steps || []
      ),
      steps: liveExploration.agenticExploration?.steps || [],
      stateSummaries: (liveExploration.agenticExploration?.states || []).map((state) => ({
        id: state.id,
        path: state.path,
        headings: state.headings,
        buttons: state.buttons,
        dialogsCount: state.dialogsCount,
      })),
      error: liveExploration.error || "",
    };

    if (liveExploration.status !== "completed") {
      throw new Error(liveExploration.error || "Live exploration did not complete.");
    }

    let inspection = mergeLiveExplorationIntoInspection({ inspection: baseInspection, liveExploration });
    const enhanced = await enhanceInspectionWithAi({ inspection, aiConfig });
    inspection = enhanced.inspection;
    result.stages.understanding = {
      usedModel: enhanced.usedModel,
      synopsis: inspection.projectSynopsis,
      confidence: inspection.detection.confidence,
      capabilities: inspection.ai?.mainCapabilities || [],
      error: inspection.ai?.error || "",
    };

    const basePlan = generateFlowPlan(inspection, { authConfig: { mode: "guest" } });
    const enhancedPlan = await enhanceFlowPlanWithAi({ inspection, basePlan, aiConfig });
    const plan = enhancedPlan.plan;
    const approvedFlows = selectApprovedFlows(plan.flows);
    result.stages.planning = {
      usedModel: enhancedPlan.usedModel,
      mode: plan.mode,
      flowCount: plan.flows?.length || 0,
      approvedFlowCount: approvedFlows.length,
      flows: approvedFlows.map((flow) => ({
        id: flow.id,
        title: flow.title,
        confidence: flow.confidence,
        evidenceStateIds: flow.evidenceStateIds || [],
        criteriaCount: flow.criteria?.length || 0,
        criteria: flow.criteria || [],
      })),
      error: plan.ai?.error || "",
    };

    if (!enhancedPlan.usedModel || !approvedFlows.length) {
      throw new Error(plan.ai?.error || "The model did not produce an admissible flow plan.");
    }

    const generated = await generateTestBundle({
      prototypeRoot,
      projectPath,
      inspection,
      approvedFlows,
      runtimeConfig: baseInspection.runtime,
      aiConfig,
      authConfig: { mode: "guest" },
    });
    result.stages.generation = {
      runId: generated.runId,
      runDirectory: generated.runDirectory,
      testCount: generated.generatedTests.length,
      modes: generated.generatedTests.map((test) => ({
        title: test.title,
        generationMode: test.generationMode,
        generationNote: test.generationNote,
      })),
      modelAuthoredCount: generated.generatedTests.filter((test) => test.generationMode === "model-assisted").length,
      modelJourneyCompiledCount: generated.generatedTests.filter((test) => test.generationMode === "model-journey-compiled").length,
      fallbackCount: generated.generatedTests.filter((test) => !["model-assisted", "model-journey-compiled"].includes(test.generationMode)).length,
    };

    const execution = await runGeneratedTests({
      prototypeRoot,
      runDirectory: generated.runDirectory,
      resultsDirectory: generated.resultsDirectory,
      targetProjectPath: projectPath,
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
      reportPath: execution.reportPath,
    };
    result.status = execution.report.summary.failed === 0 ? "completed" : "completed-with-test-failures";
  } catch (error) {
    result.status = "failed";
    result.error = error.message;
  }

  result.durationMs = Date.now() - startedAt;
  result.completedAt = new Date().toISOString();
  return result;
}

function selectApprovedFlows(flows) {
  const confidenceScore = { high: 3, medium: 2, low: 1 };
  return [...(flows || [])]
    .sort((left, right) => (confidenceScore[right.confidence] || 0) - (confidenceScore[left.confidence] || 0))
    .slice(0, 4);
}

function buildMarkdownReport(aggregate) {
  const rows = aggregate.results.map((result) => {
    const exploration = result.stages.exploration?.metrics || {};
    const planning = result.stages.planning || {};
    const generation = result.stages.generation || {};
    const execution = result.stages.execution?.summary || {};
    const modelFlowCount = planning.usedModel ? planning.approvedFlowCount || 0 : 0;
    return `| ${result.model} | ${result.status} | ${exploration.completedActions || 0} | ${exploration.uniqueStates || 0} | ${(exploration.coverageAreas || []).join(", ") || "none"} | ${modelFlowCount} | ${generation.modelAuthoredCount || 0}/${generation.modelJourneyCompiledCount || 0}/${generation.testCount || 0} | ${countPassingAiDerivedTests(result)} | ${execution.passed || 0}/${execution.total || 0} |`;
  });

  const details = aggregate.results.map((result) => {
    const exploration = result.stages.exploration || {};
    const planning = result.stages.planning || {};
    const generation = result.stages.generation || {};
    const execution = result.stages.execution || {};
    const planningDescription = planning.usedModel
      ? `${planning.approvedFlowCount || 0} approved AI-generated flows.`
      : `No admissible AI plan; ${planning.approvedFlowCount || 0} baseline flows were retained${planning.error ? ` (${planning.error})` : ""}.`;
    return `## ${result.model}\n\n- **Outcome:** ${result.status}${result.error ? ` - ${result.error}` : ""}\n- **Exploration:** ${exploration.metrics?.completedActions || 0} completed actions, ${exploration.metrics?.uniqueStates || 0} unique states, exercised coverage in ${(exploration.metrics?.coverageAreas || []).join(", ") || "no inferred functional area"}. The page exposed opportunities in ${(exploration.metrics?.observedOpportunities || []).join(", ") || "no classified area"}.\n- **Planning:** ${planningDescription}\n- **Generation:** ${generation.modelAuthoredCount || 0} free-form model test(s), ${generation.modelJourneyCompiledCount || 0} compiled model-journey test(s), and ${generation.fallbackCount || 0} explicitly reported baseline fallback(s).\n- **Execution:** ${countPassingAiDerivedTests(result)} AI-derived test(s) passed; ${execution.summary?.passed || 0}/${execution.summary?.total || 0} tests passed overall.\n\n### Selected flows\n\n${(planning.flows || []).map((flow) => `- ${flow.title} (${flow.criteriaCount} criteria; evidence: ${(flow.evidenceStateIds || []).join(", ") || "baseline context"})`).join("\n") || "No admissible flow was produced."}\n`;
  }).join("\n");

  return `# Local Model Evaluation on Dopa\n\nGenerated: ${aggregate.generatedAt}\n\n## Purpose\n\nThis controlled experiment evaluates how different local models support E2P's complete AI-centered pipeline: project understanding, stateful live exploration, evidence-grounded flow and acceptance-criteria generation, Playwright authoring, and test execution. The deterministic path is treated only as a baseline or explicitly reported fallback.\n\n## Safety and comparability\n\nEvery model receives the same Dopa project, guest access, eight-action exploration limit, and four-flow execution limit. The browser blocks non-read network methods and high-risk controls such as checkout, payment, deletion, publishing, and final submission. Client-local interactions such as opening details, search, favorites, and cart state are allowed because they provide useful QA evidence without mutating server data.\n\n## Comparison\n\n| Model | Run outcome | Actions | States | Exercised coverage | AI flows | Free-form / compiled / total | Passing AI-derived | Overall passing |\n| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |\n${rows.join("\n")}\n\n${details}\n## Interpretation limits\n\nThis is a repeatable exploratory benchmark on one compact commerce application, not a general model ranking. A passing generated test demonstrates executable evidence for the observed Dopa state; it does not prove complete application correctness. Overall passing counts can include explicit deterministic fallbacks and must not be interpreted as model success. Repeated runs and additional candidate projects are required to estimate stability and transferability.\n`;
}

async function rebuildExistingReport() {
  const files = await fs.readdir(outputRoot);
  const modelFiles = files.filter((file) => file.endsWith(".json") && file !== "dopa-model-comparison.json");
  const results = [];

  for (const file of modelFiles) {
    const filePath = path.join(outputRoot, file);
    const result = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (result.stages?.exploration) {
      result.stages.exploration.metrics = normalizeExplorationMetrics(
        result.stages.exploration.metrics || {},
        result.stages.exploration.steps || []
      );
    }
    if (result.stages?.execution?.tests) {
      const tests = result.stages.execution.tests;
      result.stages.execution.summary.total = tests.length;
      result.stages.execution.summary.passed = tests.filter((test) => test.status === "passed").length;
      result.stages.execution.summary.failed = tests.filter((test) => !["passed", "skipped"].includes(test.status)).length;
      result.stages.execution.summary.skipped = tests.filter((test) => test.status === "skipped").length;
      if (result.status !== "failed") {
        result.status = result.stages.execution.summary.failed > 0 ? "completed-with-test-failures" : "completed";
      }
    }
    results.push(result);
    await fs.writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  results.sort((left, right) => models.indexOf(left.model) - models.indexOf(right.model));
  const aggregate = {
    protocol: {
      projectPath: "C:\\Users\\henri\\Documents\\dopa",
      models: results.map((result) => result.model),
      access: "guest",
      explorationStepLimit: 8,
      approvedFlowLimit: 4,
      mutationPolicy: "Browser exploration blocks non-GET network requests and high-risk actions such as checkout, payment, deletion, publishing, and final submission.",
    },
    generatedAt: new Date().toISOString(),
    results,
  };
  await fs.writeFile(path.join(outputRoot, "dopa-model-comparison.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(prototypeRoot, "MODEL_EVALUATION_REPORT.md"), buildMarkdownReport(aggregate), "utf8");
}

function normalizeExplorationMetrics(metrics, steps) {
  return {
    ...metrics,
    coverageAreas: deriveExercisedCoverage(steps),
  };
}

function deriveExercisedCoverage(steps) {
  const covered = new Set();
  for (const step of (steps || []).filter((candidate) => candidate.status === "completed")) {
    const name = String(step.action?.name || "").trim();
    const reasoning = `${step.rationale || ""} ${step.expectedOutcome || ""}`;
    if (/favorit|wishlist|desejos/i.test(name)) covered.add("favorites");
    if (/cart|carrinho|basket|sacola|adicionar ao carrinho|adicionar uma unidade|remover uma unidade/i.test(name)) covered.add("cart");
    if (step.action?.kind === "fill" || /^[✦⌘◉◎◇]|^(tudo|tecnologia|anime|importados|moda)$/i.test(name)) covered.add("search-filter");
    if (step.changed && /product|produto|details|detalhes|specifics|item/i.test(reasoning)) covered.add("product-details");
    if (/explor|menu|home|in[ií]cio|back|voltar|next|pr[oó]xim/i.test(name)) covered.add("navigation");
  }
  return ["product-details", "search-filter", "favorites", "cart", "navigation"].filter((id) => covered.has(id));
}

function countPassingAiDerivedTests(result) {
  const modelTitles = new Set((result.stages.generation?.modes || [])
    .filter((test) => ["model-assisted", "model-journey-compiled"].includes(test.generationMode))
    .map((test) => test.title));
  return (result.stages.execution?.tests || [])
    .filter((test) => modelTitles.has(test.title) && test.status === "passed")
    .length;
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
