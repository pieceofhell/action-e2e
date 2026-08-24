const express = require("express");
const path = require("path");
const crypto = require("crypto");
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
const {
  createRunDirectory,
  ensureDirectory,
  isArtifactRunQuarantined,
  writeJson,
} = require("./services/artifact-store");
const { getAuthConfigurationStatus, redactSecrets } = require("./services/auth-config");
const { getAiProviderStatus } = require("./services/llm-provider");
const {
  enhanceInspectionWithAi,
  enhanceFlowPlanWithAi,
  enhanceInsightsWithAi,
} = require("./services/ai-workflows");
const { runAiConsoleTurn } = require("./services/ai-console");
const { operationTracker } = require("./services/operation-tracker");
const {
  isBaselineModeEnabled,
  isExplicitBaseline,
  requireAiForStage,
  requireCompletedAiExploration,
} = require("./services/pipeline-policy");

const app = express();
const PORT = process.env.PORT || 4318;
const prototypeRoot = path.resolve(__dirname, "..");
const requestToken = crypto.randomBytes(24).toString("hex");

app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(prototypeRoot, "public")));
app.use("/artifacts", async (request, response, next) => {
  try {
    const runId = String(request.path || "").split("/").filter(Boolean)[0] || "";
    if (!/^[a-z0-9-]+$/i.test(runId)) {
      response.status(400).json({ error: "Invalid artifact run identifier." });
      return;
    }

    const runDirectory = path.join(prototypeRoot, "prototype-runs", runId);
    if (await isArtifactRunQuarantined(runDirectory)) {
      response.status(423).json({ error: "Authenticated artifacts are quarantined until secret validation completes." });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}, express.static(path.join(prototypeRoot, "prototype-runs")));

app.get("/api/health", (request, response) => {
  response.json({
    ok: true,
    app: "action-e2e-prototype",
    now: new Date().toISOString(),
    requestToken,
  });
});

app.get("/api/operations/:operationId", (request, response) => {
  try {
    const operation = operationTracker.get(request.params.operationId);
    if (!operation) {
      response.status(404).json({ error: "Operation not found." });
      return;
    }
    response.json({ operation });
  } catch (error) {
    response.status(400).json({ error: "Invalid operation identifier." });
  }
});

app.post("/api/auth/status", requireLocalRequestToken, (request, response) => {
  response.json(getAuthConfigurationStatus(request.body?.authConfig));
});

app.get("/api/ai/status", async (request, response, next) => {
  try {
    const status = await getAiProviderStatus({ includeBaseline: isBaselineModeEnabled() });
    response.json(status);
  } catch (error) {
    next(error);
  }
});

app.post("/api/project/select", async (request, response, next) => {
  const operation = beginRequestOperation(request.body, "selection", "Choosing a project folder");
  try {
    operation.update({ phase: "folder-picker", message: "Waiting for the Windows folder dialog...", progress: 20 });
    const selectedPath = await openProjectDirectoryDialog();
    operation.complete(selectedPath ? "Project folder selected." : "Folder selection was canceled.");
    response.json({ selectedPath });
  } catch (error) {
    operation.fail(redactSecrets(error?.message || error));
    next(error);
  }
});

app.post("/api/project/load", async (request, response, next) => {
  const operation = beginRequestOperation(request.body, "inspection", "Inspecting the selected project");
  try {
    const { projectPath, aiConfig } = request.body || {};

    if (!projectPath) {
      response.status(400).json({ error: "The project path is required." });
      return;
    }

    requireAiForStage(aiConfig, "project understanding");

    operation.update({ phase: "validation", message: "Validating the selected directory...", progress: 4 });
    const baseInspection = await inspectProject(projectPath, {
      onProgress: operation.update,
    });
    operation.update({ phase: "semantic-analysis", message: "Applying the selected semantic analysis strategy...", progress: 72 });
    const { inspection } = await enhanceInspectionWithAi({
      inspection: baseInspection,
      aiConfig,
    });

    operation.update({ phase: "runtime-inference", message: "Consolidating framework and runtime recommendations...", progress: 94 });
    operation.complete("Project inspection completed.");
    response.json({ inspection });
  } catch (error) {
    operation.fail(redactSecrets(error?.message || error));
    next(error);
  }
});

app.post("/api/project/explore-live", requireLocalRequestToken, async (request, response, next) => {
  const operation = beginRequestOperation(request.body, "exploration", "Exploring the live application");
  try {
    const {
      projectPath,
      inspection,
      runtimeConfig,
      aiConfig,
      authConfig,
    } = request.body || {};

    if (!projectPath || !inspection) {
      response.status(400).json({ error: "Project path and inspection are required for live exploration." });
      return;
    }


    requireAiForStage(aiConfig, "live interface exploration");

    operation.update({ phase: "evidence-workspace", message: "Preparing an isolated evidence workspace for this exploration...", progress: 5 });
    const run = await createRunDirectory(path.join(prototypeRoot, "prototype-runs"), projectPath);
    const evidenceDirectory = path.join(run.artifactsDirectory, "exploration");
    await ensureDirectory(evidenceDirectory);
    const artifactRun = {
      ...run,
      evidenceDirectory,
      artifactBaseUrl: `/artifacts/${run.runId}`,
    };

    const liveExploration = await exploreLiveProject({
      projectPath,
      inspection,
      runtimeConfig,
      aiConfig,
      authConfig,
      artifactRun,
      onProgress: operation.update,
    });

    await writeJson(path.join(run.runDirectory, "exploration.json"), liveExploration);
    if (liveExploration.bugDiscovery) {
      await writeJson(path.join(run.resultsDirectory, "potential-bugs.json"), liveExploration.bugDiscovery);
    }

    if (liveExploration.status !== "completed") {
      throw new Error(liveExploration.error || "AI-first pipeline stopped: live interface exploration did not complete.");
    }

    operation.update({ phase: "evidence-merge", message: "Merging rendered interface and defect evidence into the project model...", progress: 97 });
    const mergedInspection = mergeLiveExplorationIntoInspection({
      inspection,
      liveExploration,
    });

    // Planning receives the full live evidence directly, so repeating semantic
    // inspection here would add latency without adding a distinct evaluation stage.
    const enhancedInspection = mergedInspection;

    if (!isExplicitBaseline(aiConfig)) {
      requireCompletedAiExploration(enhancedInspection, "flow planning");
    }
    operation.complete(`Live exploration completed across ${liveExploration.routes?.length || 0} route(s).`);

    response.json({
      inspection: enhancedInspection,
      liveExploration,
    });
  } catch (error) {
    operation.fail(redactSecrets(error?.message || error));
    next(error);
  }
});

app.post("/api/pipeline/plan", async (request, response, next) => {
  const operation = beginRequestOperation(request.body, "planning", "Generating user flows and acceptance criteria");
  try {
    const { inspection, aiConfig, authConfig } = request.body || {};

    if (!inspection) {
      response.status(400).json({ error: "Project inspection is required to generate flows." });
      return;
    }


    requireAiForStage(aiConfig, "flow and acceptance-criteria planning");
    if (!isExplicitBaseline(aiConfig)) {
      requireCompletedAiExploration(inspection, "flow planning");
    }

    operation.update({ phase: "flow-discovery", message: "Preparing completed exploration states for the selected model...", progress: 18 });
    const basePlan = isExplicitBaseline(aiConfig)
      ? generateFlowPlan(inspection, { authConfig })
      : {
          mode: "ai-first",
          access: inspection.liveExploration?.access || { mode: "guest" },
          summary: "The selected model must author every proposed flow from completed live exploration evidence.",
          flows: [],
        };
    operation.update({ phase: "criteria-drafting", message: "Asking the selected model to author flows and criteria from observed states...", progress: 42 });
    operation.update({ phase: "model-refinement", message: "Validating model-authored evidence references and acceptance criteria...", progress: 72 });
    const { plan } = await enhanceFlowPlanWithAi({
      inspection,
      basePlan,
      aiConfig,
      authConfig,
    });

    operation.update({ phase: "human-review", message: "Preparing criteria for human review and approval...", progress: 94 });
    operation.complete(`Prepared ${plan.flows?.length || 0} flow(s) for review.`);
    response.json({ plan });
  } catch (error) {
    operation.fail(redactSecrets(error?.message || error));
    next(error);
  }
});

app.post("/api/tests/generate", async (request, response, next) => {
  const operation = beginRequestOperation(request.body, "generation", "Generating E2E test artifacts");
  try {
    const {
      projectPath,
      inspection,
      approvedFlows,
      runtimeConfig,
      aiConfig,
      authConfig,
    } = request.body || {};

    if (!projectPath || !inspection || !Array.isArray(approvedFlows) || approvedFlows.length === 0) {
      response.status(400).json({ error: "Project path, inspection, and at least one approved flow are required." });
      return;
    }


    requireAiForStage(aiConfig, "test generation");
    if (!isExplicitBaseline(aiConfig)) {
      requireCompletedAiExploration(inspection, "test generation");
    }

    const generated = await generateTestBundle({
      prototypeRoot,
      projectPath,
      inspection,
      approvedFlows,
      runtimeConfig,
      aiConfig,
      authConfig,
      onProgress: operation.update,
    });

    operation.complete(`Generated ${generated.generatedTests?.length || 0} test artifact(s).`);
    response.json({ generated });
  } catch (error) {
    operation.fail(redactSecrets(error?.message || error));
    next(error);
  }
});

app.post("/api/tests/run", requireLocalRequestToken, async (request, response, next) => {
  const operation = beginRequestOperation(request.body, "execution", "Running generated E2E tests");
  try {
    const {
      projectPath,
      inspection,
      approvedFlows,
      generated,
      aiConfig,
      authConfig,
    } = request.body || {};

    if (!projectPath || !inspection || !generated?.runDirectory || !generated?.resultsDirectory) {
      response.status(400).json({ error: "Artifacts must be generated before running the tests." });
      return;
    }

    requireAiForStage(aiConfig, "test execution and result interpretation");
    if (!isExplicitBaseline(aiConfig)) {
      requireCompletedAiExploration(inspection, "test execution");
      const invalidOrigin = (generated.generatedTests || []).find((test) => !["model-assisted", "model-journey-compiled", "model-assisted-structured"].includes(test.generationMode));
      if (invalidOrigin) {
        throw new Error(`AI-first pipeline stopped before execution: ${invalidOrigin.title} was not generated from model output or a model-executed journey.`);
      }
    }

    const execution = await runGeneratedTests({
      prototypeRoot,
      runDirectory: generated.runDirectory,
      resultsDirectory: generated.resultsDirectory,
      targetProjectPath: projectPath,
      runtimeConfig: generated.runtimeConfig,
      authConfig,
      actionPlans: generated.actionPlans,
      onProgress: operation.update,
    });

    operation.update({ phase: "insight-consolidation", message: "Consolidating outcomes, limitations, and visual evidence...", progress: 88 });
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

    operation.update({ phase: "artifact-index", message: "Writing the final insight report and evidence index...", progress: 96 });
    await writeJson(path.join(generated.runDirectory, "results", "insights.json"), insights);

    const summary = execution.report?.summary || {};
    operation.complete(`Execution completed: ${summary.passed || 0} passed, ${summary.failed || 0} failed.`);
    response.json({
      execution,
      insights,
    });
  } catch (error) {
    operation.fail(redactSecrets(error?.message || error));
    next(error);
  }
});

app.post("/api/ai/chat", async (request, response, next) => {
  const operation = beginRequestOperation(request.body, "model-console", "Querying the selected model");
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

    operation.update({ phase: "context-building", message: "Building a safe summary of the current pipeline context...", progress: 20 });
    operation.update({ phase: "model-request", message: "Waiting for the selected model to respond...", progress: 42 });
    const result = await runAiConsoleTurn({
      aiConfig,
      conversation,
      projectPath,
      inspection,
      plan,
      execution,
      insights,
    });

    operation.complete("Model response received.");
    response.json(result);
  } catch (error) {
    operation.fail(redactSecrets(error?.message || error));
    next(error);
  }
});

app.get("*", (request, response) => {
  response.sendFile(path.join(prototypeRoot, "public", "index.html"));
});

app.use((error, request, response, next) => {
  const safeMessage = redactSecrets(error?.message || error);
  console.error(`[server] ${safeMessage}`);
  response.status(500).json({
    error: safeMessage || "Internal prototype failure.",
  });
});

function requireLocalRequestToken(request, response, next) {
  const remoteAddress = request.socket?.remoteAddress || "";
  const isLoopback = remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1";

  if (!isLoopback || request.get("X-E2P-Request-Token") !== requestToken) {
    response.status(403).json({ error: "Sensitive local operation was rejected." });
    return;
  }

  next();
}

function beginRequestOperation(body, kind, label) {
  const noOperation = {
    update: () => {},
    complete: () => {},
    fail: () => {},
  };

  if (!body?.operationId) {
    return noOperation;
  }

  try {
    return operationTracker.begin({
      id: body.operationId,
      kind,
      label,
    });
  } catch {
    // Progress reporting is optional and must never prevent the requested pipeline work.
    return noOperation;
  }
}

app.listen(PORT, () => {
  console.log(`Action E2E Prototype available at http://127.0.0.1:${PORT}`);
});
