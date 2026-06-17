const express = require("express");
const path = require("path");
const { openProjectDirectoryDialog } = require("./services/directory-picker");
const { inspectProject } = require("./services/project-inspector");
const {
  exploreLiveProject,
  mergeLiveExplorationIntoInspection,
} = require("./services/live-explorer");
const { generateFlowPlan } = require("./services/flow-planner");
const { generateTestBundle } = require("./services/test-generator");
const { runGeneratedTests } = require("./services/test-runner");
const { buildInsights } = require("./services/insight-builder");
const { writeJson } = require("./services/artifact-store");
const { getAiProviderStatus } = require("./services/llm-provider");
const {
  enhanceInspectionWithAi,
  enhanceFlowPlanWithAi,
  enhanceInsightsWithAi,
} = require("./services/ai-workflows");
const { runAiConsoleTurn } = require("./services/ai-console");

const app = express();
const PORT = process.env.PORT || 4318;
const prototypeRoot = path.resolve(__dirname, "..");

app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(prototypeRoot, "public")));
app.use("/artifacts", express.static(path.join(prototypeRoot, "prototype-runs")));

app.get("/api/health", (request, response) => {
  response.json({
    ok: true,
    app: "action-e2e-prototype",
    now: new Date().toISOString(),
  });
});

app.get("/api/ai/status", async (request, response, next) => {
  try {
    const status = await getAiProviderStatus();
    response.json(status);
  } catch (error) {
    next(error);
  }
});

app.post("/api/project/select", async (request, response, next) => {
  try {
    const selectedPath = await openProjectDirectoryDialog();
    response.json({ selectedPath });
  } catch (error) {
    next(error);
  }
});

app.post("/api/project/load", async (request, response, next) => {
  try {
    const { projectPath, aiConfig } = request.body || {};

    if (!projectPath) {
      response.status(400).json({ error: "The project path is required." });
      return;
    }

    const baseInspection = await inspectProject(projectPath);
    const { inspection } = await enhanceInspectionWithAi({
      inspection: baseInspection,
      aiConfig,
    });

    response.json({ inspection });
  } catch (error) {
    next(error);
  }
});

app.post("/api/project/explore-live", async (request, response, next) => {
  try {
    const {
      projectPath,
      inspection,
      runtimeConfig,
      aiConfig,
    } = request.body || {};

    if (!projectPath || !inspection) {
      response.status(400).json({ error: "Project path and inspection are required for live exploration." });
      return;
    }

    const liveExploration = await exploreLiveProject({
      projectPath,
      inspection,
      runtimeConfig,
    });

    const mergedInspection = mergeLiveExplorationIntoInspection({
      inspection,
      liveExploration,
    });

    const { inspection: enhancedInspection } = await enhanceInspectionWithAi({
      inspection: mergedInspection,
      aiConfig,
    });

    response.json({
      inspection: enhancedInspection,
      liveExploration,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/pipeline/plan", async (request, response, next) => {
  try {
    const { inspection, aiConfig } = request.body || {};

    if (!inspection) {
      response.status(400).json({ error: "Project inspection is required to generate flows." });
      return;
    }

    const basePlan = generateFlowPlan(inspection);
    const { plan } = await enhanceFlowPlanWithAi({
      inspection,
      basePlan,
      aiConfig,
    });

    response.json({ plan });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tests/generate", async (request, response, next) => {
  try {
    const {
      projectPath,
      inspection,
      approvedFlows,
      runtimeConfig,
      aiConfig,
    } = request.body || {};

    if (!projectPath || !inspection || !Array.isArray(approvedFlows) || approvedFlows.length === 0) {
      response.status(400).json({ error: "Project path, inspection, and at least one approved flow are required." });
      return;
    }

    const generated = await generateTestBundle({
      prototypeRoot,
      projectPath,
      inspection,
      approvedFlows,
      runtimeConfig,
      aiConfig,
    });

    response.json({ generated });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tests/run", async (request, response, next) => {
  try {
    const {
      projectPath,
      inspection,
      approvedFlows,
      generated,
      aiConfig,
    } = request.body || {};

    if (!projectPath || !inspection || !generated?.runDirectory || !generated?.resultsDirectory) {
      response.status(400).json({ error: "Artifacts must be generated before running the tests." });
      return;
    }

    const execution = await runGeneratedTests({
      prototypeRoot,
      runDirectory: generated.runDirectory,
      resultsDirectory: generated.resultsDirectory,
      targetProjectPath: projectPath,
      runtimeConfig: generated.runtimeConfig,
    });

    const baseInsights = buildInsights({
      inspection,
      approvedFlows,
      report: execution.report,
      runtime: execution.runtime,
    });

    const { insights } = await enhanceInsightsWithAi({
      inspection,
      approvedFlows,
      report: execution.report,
      baseInsights,
      aiConfig,
    });

    await writeJson(path.join(generated.runDirectory, "results", "insights.json"), insights);

    response.json({
      execution,
      insights,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/chat", async (request, response, next) => {
  try {
    const {
      aiConfig,
      conversation,
      projectPath,
      inspection,
      plan,
      execution,
      insights,
    } = request.body || {};

    const result = await runAiConsoleTurn({
      aiConfig,
      conversation,
      projectPath,
      inspection,
      plan,
      execution,
      insights,
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("*", (request, response) => {
  response.sendFile(path.join(prototypeRoot, "public", "index.html"));
});

app.use((error, request, response, next) => {
  console.error(error);
  response.status(500).json({
    error: error.message || "Internal prototype failure.",
  });
});

app.listen(PORT, () => {
  console.log(`Action E2E Prototype available at http://127.0.0.1:${PORT}`);
});
