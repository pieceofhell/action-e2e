const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const cheerio = require("cheerio");
const { chromium } = require("playwright");
const { normalizeAiConfig, requestStructuredJson, supportsVisionInput } = require("../src/services/llm-provider");
const { classifyTestFailure, parsePlaywrightReport, validateRunPaths } = require("../src/services/test-runner");
const { buildObservedJourneySpecContent, compiledClickLocator, compiledInputLocator, hasLiveEvidence, validateAiTestBody, validateObservedJourneyLocators } = require("../src/services/test-generator");
const { detectAppType, detectPackageManager, recommendRuntime } = require("../src/services/project-inspector");
const { generateFlowPlan } = require("../src/services/flow-planner");
const {
  buildRestrictedChildEnvironment,
  getAuthConfigurationStatus,
  normalizeAuthConfig,
  redactSecrets,
  resolveAuthSecrets,
  toPublicAuthMetadata,
} = require("../src/services/auth-config");
const { validateAuthenticatedActionPlan } = require("../src/services/read-only-policy");
const {
  buildLoopbackUrlCandidates,
  buildTargetEnvironment,
  extractAnnouncedLoopbackUrls,
  startTargetRuntime,
} = require("../src/services/runtime-orchestrator");
const { createOperationTracker } = require("../src/services/operation-tracker");
const {
  buildBaselineResult,
  classifyExplorationAction,
  estimateAdaptiveExplorationBudget,
  executeDecision,
  validateAgentDecision,
} = require("../src/services/agentic-explorer");

test("refreshes exploration when a newly appeared overlay intercepts an observed action", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<button data-e2p-action-id="underlay">Open search</button><div id="overlay" style="display:none;position:fixed;inset:0;background:white;z-index:10"></div>');
    await page.evaluate(() => { document.getElementById("overlay").style.display = "block"; });
    await assert.rejects(
      executeDecision(page, { action: "click" }, { id: "underlay", locatorId: "underlay" }),
      (error) => error.code === "E2P_ACTION_UNAVAILABLE",
    );
  } finally {
    await browser.close();
  }
});

test("refreshes exploration when an observed control becomes hidden", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent('<button data-e2p-action-id="stale" style="display:none">Stale action</button>');
    await assert.rejects(
      executeDecision(page, { action: "click" }, { id: "stale", locatorId: "stale" }),
      (error) => error.code === "E2P_ACTION_UNAVAILABLE",
    );
  } finally {
    await browser.close();
  }
});
const { calibrateFlowConfidence, deriveCoverageTargets, mergeAiFlows, measureFlowCoverage, validateInsightPayload } = require("../src/services/ai-workflows");
const { buildInsights } = require("../src/services/insight-builder");
const { requireAiForStage, requireCompletedAiExploration } = require("../src/services/pipeline-policy");

test("constrains model-guided exploration to safe evidence-grounded actions", () => {
  const product = classifyExplorationAction({ kind: "click", role: "button", name: "View Aurora product details" });
  const search = classifyExplorationAction({ kind: "fill", role: "input", name: "Search products", inputType: "search" });
  const checkout = classifyExplorationAction({ kind: "click", role: "button", name: "Proceed to checkout" });
  const clearCart = classifyExplorationAction({ kind: "click", role: "button", name: "Clear cart" });
  const apiKey = classifyExplorationAction({ kind: "fill", role: "input", name: "Paste your Canvas API key", inputType: "text" });

  assert.equal(product.safe, true);
  assert.equal(search.safe, true);
  assert.equal(checkout.safe, false);
  assert.equal(clearCart.safe, false);
  assert.equal(apiKey.safe, false);

  const allowed = [{ id: "e2p-3", kind: "click", role: "button", name: "View Aurora product details", safe: true }];
  assert.equal(validateAgentDecision({ decision: "act", actionId: "e2p-3", rationale: "Inspect product details" }, allowed).actionId, "e2p-3");
  const legacyMismatch = validateAgentDecision({ action: "fill", actionId: "e2p-3", rationale: "Inspect product details" }, allowed);
  assert.equal(legacyMismatch.action, "click");
  assert.match(legacyMismatch.protocolCorrection, /executed the catalog kind click/);
  const inventedVerb = validateAgentDecision({ decision: "explore", actionId: "e2p-3", rationale: "Inspect product details" }, allowed);
  assert.equal(inventedVerb.action, "click");
  assert.match(inventedVerb.protocolCorrection, /executed the catalog kind click/);
  assert.throws(
    () => validateAgentDecision({ action: "click", actionId: "invented" }, allowed),
    /not present in the current safe action set/
  );

  const boundaryInput = [{
    id: "e2p-boundary",
    kind: "fill",
    role: "input",
    name: "New task",
    safe: true,
    boundaryProbe: true,
  }];
  assert.throws(
    () => validateAgentDecision({ decision: "act", actionId: "e2p-boundary", value: "Learn React" }, boundaryInput),
    /single-character boundary probe/
  );
  assert.equal(
    validateAgentDecision({ decision: "act", actionId: "e2p-boundary", value: "g" }, boundaryInput).value,
    "g"
  );
});

test("adapts exploration budgets to observed interface complexity", () => {
  const action = (id, kind = "click") => ({ id, kind, role: "button", name: `Action ${id}`, safe: true });
  const simple = estimateAdaptiveExplorationBudget({
    current: { actions: [action("one")] },
    states: [{ actions: [action("one")] }],
    hardMaxSteps: 20,
    hardMaxDurationMs: 180000,
  });
  const richActions = Array.from({ length: 24 }, (_, index) => action(`rich-${index + 1}`));
  const rich = estimateAdaptiveExplorationBudget({
    current: { actions: richActions },
    states: [{ actions: richActions }, { actions: richActions.slice(10) }, { actions: richActions.slice(15) }],
    hardMaxSteps: 20,
    hardMaxDurationMs: 180000,
  });

  assert.equal(simple.stepLimit, 2);
  assert.ok(rich.stepLimit > simple.stepLimit);
  assert.equal(rich.stepLimit, 20);
  assert.ok(rich.durationMs > simple.durationMs);
});

test("keeps general text-boundary probing in the model exploration contract", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "agentic-explorer.js"), "utf8");
  assert.match(source, /ordinary QA boundary probing/);
  assert.match(source, /declares no minimum length/);
  assert.match(source, /expected visible outcome/);
});

test("labels non-model live inspection as a baseline instead of AI exploration", () => {
  const baseline = buildBaselineResult({
    path: "/",
    title: "Shop",
    headings: ["Products"],
    buttons: [{ text: "Open cart" }],
    inputs: [],
    actions: [],
    visibleTextExcerpt: "Products and cart",
  });

  assert.equal(baseline.strategy, "baseline-dom-scan");
  assert.equal(baseline.usedModel, false);
  assert.equal(baseline.metrics.completedActions, 0);
});

test("accepts novel model-authored flows only with traceable live state evidence", () => {
  const merged = mergeAiFlows([], [{
    id: "product-favorite-journey",
    title: "Review and favorite a product",
    summary: "Open a product and preserve it in the favorites view.",
    confidence: "high",
    evidenceStateIds: ["state-1", "unknown-state"],
    sourceSignals: ["Product modal and favorite control observed"],
    criteria: [{
      title: "Favorite from details",
      given: "the product catalog is visible",
      when: "the user opens a product and marks it as favorite",
      then: "the product appears in the favorites view",
    }],
  }], {
    agenticExploration: {
      states: [{ id: "state-1", fingerprint: "favorite-state" }],
      steps: [{
        status: "completed",
        afterFingerprint: "favorite-state",
        action: { name: "Favorite Aurora product" },
        rationale: "Preserve the product in favorites",
      }],
    },
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].blueprint.kind, "model-observed-journey");
  assert.deepEqual(merged[0].evidenceStateIds, ["state-1"]);
});

test("preserves distinct executed actions even when they share a terminal state", () => {
  const states = [{ id: "state-2", fingerprint: "catalog-state", visibleTextExcerpt: "Catalog Cart Favorites", buttons: ["Cart", "Favorites"] }];
  const steps = [
    { status: "completed", afterStateId: "state-2", afterFingerprint: "catalog-state", changed: true, action: { kind: "click", name: "Open Cart" }, rationale: "Review cart" },
    { status: "completed", afterStateId: "state-2", afterFingerprint: "catalog-state", changed: true, action: { kind: "click", name: "Open Favorites" }, rationale: "Review favorites" },
  ];
  const flows = mergeAiFlows([], [
    { id: "cart", title: "Open Cart", confidence: "high", evidenceStateIds: ["state-2"], criteria: [{ title: "Cart", given: "the catalog", when: "Open Cart is selected", then: "Cart is displayed" }] },
    { id: "favorites", title: "Open Favorites", confidence: "high", evidenceStateIds: ["state-2"], criteria: [{ title: "Favorites", given: "the catalog", when: "Open Favorites is selected", then: "Favorites is displayed" }] },
  ], { agenticExploration: { states, steps } });
  assert.equal(flows.length, 2);
  const targets = deriveCoverageTargets(states, steps);
  const coverage = measureFlowCoverage(flows, targets, steps, states);
  assert.equal(coverage.ratio, 1);
  assert.equal(coverage.uncoveredTargetIds.length, 0);
});

test("keeps distinct grounded flows even when a model repeats a placeholder id", () => {
  const states = [
    { id: "state-2", fingerprint: "filled", visibleTextExcerpt: "New task field contains Test", inputs: ["New task"] },
    { id: "state-3", fingerprint: "added", visibleTextExcerpt: "Test task added", buttons: ["Add"] },
  ];
  const steps = [
    { status: "completed", afterFingerprint: "filled", action: { kind: "fill", name: "New task" }, changed: true },
    { status: "completed", afterFingerprint: "added", action: { kind: "click", name: "Add" }, changed: true },
  ];
  const flows = mergeAiFlows([], [
    { id: "new-task-state-2", title: "Fill New task", observedAction: { kind: "fill", name: "New task", resultingStateId: "state-2" }, evidenceStateIds: ["state-2"], criteria: [{ title: "Fill", given: "New task is visible", when: "New task is filled", then: "New task contains text" }] },
    { id: "add-state-3", title: "Add Test task", observedAction: { kind: "click", name: "Add", resultingStateId: "state-3" }, evidenceStateIds: ["state-3"], criteria: [{ title: "Add", given: "Test task is entered", when: "Add is clicked", then: "Test task is added" }] },
  ], { agenticExploration: { states, steps } });
  assert.equal(flows.length, 2);
});

test("calibrates model confidence against observed evidence quality", () => {
  assert.equal(calibrateFlowConfidence({ requested: "high", assumptions: ["Maybe signed in", "Maybe data exists"], criteria: [{}, {}], enteringStep: { changed: true } }), "low");
  assert.equal(calibrateFlowConfidence({ requested: "high", assumptions: [], criteria: [{}], enteringStep: { changed: true } }), "medium");
  assert.equal(calibrateFlowConfidence({ requested: "high", assumptions: [], criteria: [{}, {}], enteringStep: { changed: true } }), "high");
});

test("rejects a model flow whose cited state was produced by an unrelated action", () => {
  const merged = mergeAiFlows([], [{
    id: "remove-cart-item",
    title: "Remove item from cart",
    evidenceStateIds: ["state-2"],
    sourceSignals: ["Cart"],
    criteria: [{ title: "Remove", given: "the cart is open", when: "the user removes an item", then: "the item disappears" }],
  }], {
    agenticExploration: {
      states: [{ id: "state-2", fingerprint: "details-state" }],
      steps: [{
        status: "completed",
        afterFingerprint: "details-state",
        action: { name: "Open Nebula product details" },
        rationale: "Inspect product information",
      }],
    },
  });

  assert.equal(merged.length, 0);
});

test("rejects cross-project commerce flows from Janvas interface evidence", () => {
  const merged = mergeAiFlows([], [{
    id: "product-details-view",
    title: "View Product Details",
    evidenceStateIds: ["state-2"],
    sourceSignals: ["product-details-page-loaded"],
    criteria: [
      { title: "Product title", given: "a product page", when: "the page loads", then: "the product title is displayed" },
      { title: "Product price", given: "a product page", when: "the page loads", then: "the product price is displayed" },
    ],
  }], {
    agenticExploration: {
      states: [{
        id: "state-2",
        fingerprint: "janvas-connected-form",
        title: "Janvas",
        headings: ["Connect your Canvas account"],
        buttons: ["Show", "Save key and connect"],
        visibleTextExcerpt: "Canvas URL Privacy policy",
      }],
      steps: [{
        status: "completed",
        afterFingerprint: "janvas-connected-form",
        action: { name: "Start with Janvas" },
        rationale: "Open the Canvas connection form",
      }],
    },
  }, {
    project: { name: "canvas-wrapper-test" },
    projectSynopsis: "A Canvas learning platform wrapper named Janvas.",
    uiHints: { headings: [{ text: "Welcome to Janvas" }] },
  });

  assert.equal(merged.length, 0);
});

test("stops the default pipeline when no AI model is configured", () => {
  assert.throws(
    () => requireAiForStage({ provider: "heuristic" }, "flow planning"),
    /AI-first pipeline stopped during flow planning/
  );
});

test("stops after incomplete or faulty model-guided exploration", () => {
  assert.throws(
    () => requireCompletedAiExploration({ liveExploration: { status: "failed" } }, "flow planning"),
    /live interface exploration must complete/
  );
  assert.throws(
    () => requireCompletedAiExploration({
      liveExploration: {
        status: "completed",
        agenticExploration: {
          usedModel: true,
          status: "completed",
          metrics: { completedActions: 2, invalidDecisions: 1, failedActions: 0 },
        },
      },
    }, "flow planning"),
    /invalid model decision/
  );
});

test("rejects insight text that contradicts AI-derived provenance or completed exploration", () => {
  const context = {
    generationModes: ["model-journey-compiled"],
    exploration: { status: "completed", modelGuided: true },
  };

  assert.throws(
    () => validateInsightPayload({ insights: ["The deterministic smoke test passed."] }, context),
    /contradicted test provenance/
  );
  assert.equal(validateInsightPayload({ insights: ["The model-authored smoke journey passed."] }, context), true);
  assert.throws(
    () => validateInsightPayload({ limitations: ["Live exploration is unavailable."] }, context),
    /contradicted the recorded completed live exploration/
  );
  assert.equal(validateInsightPayload({
    limitations: ["Exploration completed, but coverage beyond the observed routes cannot be confirmed."],
  }, context), true);
  assert.equal(validateInsightPayload({ insights: ["Three model-derived journeys passed."] }, context), true);
});

test("keeps objective result context aligned with AI-first provenance", () => {
  const insights = buildInsights({
    inspection: {
      ai: { label: "Local Ollama / qwen3:8b" },
      warnings: [],
      detection: { confidence: "high", appType: "web-app" },
    },
    approvedFlows: [{ id: "flow-1" }],
    report: { summary: { total: 1, passed: 1, failed: 0, skipped: 0 } },
    runtime: { mode: "static" },
    auth: { mode: "guest" },
  });
  const text = JSON.stringify(insights);

  assert.doesNotMatch(text, /heuristic|fallback|deterministic/i);
  assert.match(text, /model-authored tests/);
  assert.match(text, /recorded live-interface journey/);
});

test("tracks operation milestones with monotonic progress", () => {
  const tracker = createOperationTracker({ maxEvents: 4 });
  const reporter = tracker.begin({
    id: "operation-feedback-001",
    kind: "exploration",
    label: "Exploring a sample project",
  });

  reporter.update({ phase: "target-startup", message: "Starting target runtime...", progress: 35 });
  reporter.update({ phase: "browser-startup", message: "Launching browser...", progress: 20 });
  reporter.update({
    phase: "route-observation",
    message: "Observing the first route...",
    progress: 72,
    detail: {
      type: "exploration",
      status: "observed",
      step: 1,
      maxSteps: 20,
      visualPreviewAllowed: true,
      screenshotDataUrl: "data:image/jpeg;base64,YWJj",
      action: { id: "safe-action", kind: "click", name: "Open details", rationale: "Inspect details" },
      state: { path: "/products", headings: ["Products"], buttons: ["Open details"] },
    },
  });
  reporter.update({ phase: "exploration-summary", message: "Summarizing observed states...", progress: 80 });
  reporter.complete("Exploration completed.");

  const operation = tracker.get(reporter.id);
  assert.equal(operation.status, "completed");
  assert.equal(operation.progress, 100);
  assert.equal(operation.events.length, 4);
  assert.equal(operation.events.at(-3).progress, 72);
  assert.equal(operation.detail.action.name, "Open details");
  assert.equal(operation.detail.screenshotDataUrl, "data:image/jpeg;base64,YWJj");
  assert.equal(operation.events.at(-3).detail.screenshotDataUrl, "");
  assert.equal(operation.events.at(-2).detail, null);
  assert.equal(operation.events.at(-1).message, "Exploration completed.");
});

test("rejects malformed operation identifiers", () => {
  const tracker = createOperationTracker();
  assert.throws(
    () => tracker.begin({ id: "../unsafe", kind: "test", label: "Unsafe" }),
    /Invalid operation identifier/
  );
});

test("exposes an accessible live activity monitor wired to server progress", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../public/index.html"), "utf8");
  const appSource = fs.readFileSync(path.resolve(__dirname, "../public/app.js"), "utf8");

  assert.match(html, /id="activityMonitor"[^>]+aria-live="polite"/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /id="explorationViewer"[^>]+aria-label="Live interface exploration viewer"/);
  assert.match(html, /id="explorationToggleButton"[^>]+hidden/);
  assert.match(appSource, /function renderExplorationViewer\(activity\)/);
  assert.match(appSource, /adaptive budget \$\{detail\.maxSteps \|\| 1\}/);
  assert.doesNotMatch(appSource, /Decision \$\{detail\.step \|\| 1\} of \$\{detail\.maxSteps/);
  assert.match(appSource, /\/api\/operations\/\$\{encodeURIComponent\(operationId\)\}/);
  assert.match(appSource, /setInterval\(\(\) => \{\s*void pollActivity\(operationId\)/s);
});

test("keeps project guidance inside the modal and exploration activity sticky", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../public/index.html"), "utf8");
  const css = fs.readFileSync(path.resolve(__dirname, "../public/styles.css"), "utf8");
  const appSource = fs.readFileSync(path.resolve(__dirname, "../public/app.js"), "utf8");
  const $ = cheerio.load(html);

  assert.equal($(".pipeline-band").length, 0);
  assert.equal($(".hero__meta").length, 0);
  assert.equal($("main #aiUsagePanel").length, 0);
  assert.equal($("#howItWorksDialog #aiUsagePanel").length, 1);
  assert.equal($("#activityMonitor").parent().hasClass("activity-dock"), true);
  assert.equal($("#howItWorksDialog").attr("aria-labelledby"), "howItWorksTitle");
  assert.equal($("#howItWorksDialog .workflow-guide > li").length, 8);
  assert.equal($("#bugDiscoveryPanel").length, 1);
  assert.equal($("button").filter((index, element) => !/\b(button|icon-button)\b/.test($(element).attr("class") || "")).length, 0);

  assert.match(css, /\.activity-dock\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.exploration-viewer\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*46px[^}]*padding:\s*12px 20px/s);
  assert.match(appSource, /howItWorksDialog\.showModal\(\)/);
  assert.match(appSource, /howItWorksDialog\.close\(\)/);
  assert.match(appSource, /function renderBugDiscovery\(\)/);
  assert.match(appSource, /Observed facts/);
  assert.match(appSource, /Expected behavior &mdash; inference/);
});

test("normalizes local and hosted provider configurations", () => {
  const ollama = normalizeAiConfig({
    provider: "ollama",
    model: "openllama:8b",
  });
  const groqWithoutKey = normalizeAiConfig({
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  });
  const lmStudio = normalizeAiConfig({
    provider: "lm-studio",
    model: "local-model",
  });

  assert.equal(ollama.enabled, true);
  assert.equal(groqWithoutKey.enabled, false);
  assert.equal(lmStudio.endpoint, "http://127.0.0.1:1234/v1");
});

test("enables screenshot input only for a vision model served on loopback", async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ capabilities: ["completion", "vision"] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.equal(await supportsVisionInput({
      provider: "ollama",
      endpoint: `http://127.0.0.1:${address.port}`,
      model: "qwen2.5vl:7b",
    }), true);
    assert.equal(await supportsVisionInput({
      provider: "openai-compatible",
      endpoint: "https://models.example.test/v1",
      model: "vision-model",
    }), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("sends vision evidence to Ollama without exposing a local file path", async () => {
  let requestBody;
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requestBody = JSON.parse(body);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: { content: '{"accepted":true}' } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const result = await requestStructuredJson({
      aiConfig: { provider: "ollama", endpoint: `http://127.0.0.1:${address.port}`, model: "vision-test" },
      systemPrompt: "Inspect the image.",
      userPrompt: "Return JSON.",
      images: [`data:image/png;base64,${image}`],
    });

    assert.deepEqual(result, { accepted: true });
    assert.equal(requestBody.messages[1].images[0], image);
    assert.equal(requestBody.options.num_ctx, 16384);
    assert.equal(requestBody.options.num_predict, 3200);
    assert.doesNotMatch(JSON.stringify(requestBody), /[A-Z]:\\/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("formats vision evidence for OpenAI-compatible multimodal providers", async () => {
  let requestBody;
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requestBody = JSON.parse(body);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: '{"accepted":true}' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const result = await requestStructuredJson({
      aiConfig: { provider: "openai-compatible", endpoint: `http://127.0.0.1:${address.port}`, model: "vision-test" },
      systemPrompt: "Inspect the image.",
      userPrompt: "Return JSON.",
      images: [image],
    });

    assert.deepEqual(result, { accepted: true });
    assert.equal(requestBody.messages[1].content[0].type, "text");
    assert.match(requestBody.messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("keeps Playwright evidence and multi-error failures in the parsed report", () => {
  const runDirectory = "C:\\prototype-runs\\sample-run";
  const report = {
    suites: [{
      specs: [{
        title: "Visible login flow",
        file: "login.spec.cjs",
        tests: [{
          results: [{
            status: "failed",
            duration: 42,
            errors: [{ message: "Expected heading was not visible" }],
            attachments: [
              { name: "screenshot", contentType: "image/png", path: `${runDirectory}\\results\\test-artifacts\\login.png` },
              { name: "video", contentType: "video/webm", path: `${runDirectory}\\results\\test-artifacts\\login.webm` },
              { name: "trace", contentType: "application/zip", path: `${runDirectory}\\results\\test-artifacts\\trace.zip` },
            ],
          }],
        }],
      }],
      suites: [],
    }],
    stats: { duration: 42 },
  };

  const parsed = parsePlaywrightReport(report, { runDirectory });
  assert.equal(parsed.summary.failed, 1);
  assert.match(parsed.tests[0].error, /heading/);
  assert.deepEqual(parsed.tests[0].evidence.map((item) => item.kind), ["screenshot", "video", "trace"]);
  assert.equal(parsed.tests[0].evidence[0].relativePath, "results/test-artifacts/login.png");
});

test("counts Playwright timeouts as execution failures", () => {
  const parsed = parsePlaywrightReport({
    suites: [{
      specs: [{
        title: "Slow model-authored journey",
        file: "slow.spec.cjs",
        tests: [{ results: [{ status: "timedOut", duration: 30000, errors: [{ message: "Test timeout" }] }] }],
      }],
      suites: [],
    }],
    stats: { duration: 30000 },
  }, { runDirectory: "C:\\prototype-runs\\sample-run" });

  assert.equal(parsed.summary.failed, 1);
  assert.equal(parsed.tests[0].status, "timedOut");
});

test("requires live exploration before model-authored tests and rejects generic role selectors", () => {
  assert.equal(hasLiveEvidence({ liveExploration: { status: "completed", routes: [{ path: "/" }], agenticExploration: { usedModel: true, status: "completed" } } }), true);
  assert.equal(hasLiveEvidence({ liveExploration: { status: "not-attempted", routes: [] } }), false);

  assert.throws(
    () => validateAiTestBody("await openHome(page);\nawait expect(page.getByRole('heading')).toBeVisible();", { uiHints: { buttons: [], headings: [] } }),
    /unscoped getByRole\('heading'\)/
  );

  assert.throws(
    () => validateAiTestBody("await openHome(page);\nawait expect(page.getByRole('form')).toBeVisible();", { uiHints: { buttons: [], headings: [] } }),
    /unscoped getByRole\('form'\)/
  );

  assert.throws(
    () => validateAiTestBody("test('unexpected extra test', async ({ page }) => { await expect(page.locator('body')).toBeVisible(); });", { uiHints: { buttons: [], headings: [] } }),
    /complete test declaration/
  );

  assert.throws(
    () => validateAiTestBody("await expect(page.getByText('Welcome')).toBeVisible();", { uiHints: { buttons: [], headings: [] } }),
    /call openHome\(page\) exactly once/
  );

  assert.throws(
    () => validateAiTestBody(
      "await openHome(page);\nawait expect(page.getByPlaceholder('Task title:')).toBeVisible();",
      { uiHints: { buttons: [], headings: [], inputs: [] }, liveExploration: { routes: [{ inputs: [{ label: 'Task title:', placeholder: '' }] }] } }
    ),
    /without a matching observed placeholder/
  );

  assert.throws(
    () => validateAiTestBody(
      "await openHome(page);\npage.getByRole('button', { name: 'Cart' }).click();\nawait expect(page.locator('body')).toBeVisible();",
      { uiHints: { buttons: [{ text: "Cart" }], headings: [], inputs: [] }, liveExploration: { routes: [{ path: "/", inputs: [] }] } }
    ),
    /must be awaited/
  );

  assert.throws(
    () => validateAiTestBody(
      "await openHome(page);\nawait expect(page).toHaveURL(/\\/cart/);",
      { uiHints: { buttons: [], headings: [], inputs: [] }, liveExploration: { routes: [{ path: "/", inputs: [] }] } }
    ),
    /unobserved URL fragment/
  );

  assert.throws(
    () => validateAiTestBody(
      "await openHome(page);\nawait expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();",
      {
        uiHints: { buttons: [{ text: "Submit" }], headings: [], inputs: [] },
        liveExploration: {
          agenticExploration: {
            states: [{ id: "state-1", buttons: ["Start with Janvas"], headings: ["Welcome to Janvas"], inputs: [] }],
          },
        },
      },
      { evidenceStateIds: ["state-1"] }
    ),
    /unobserved button name: Submit/
  );
});

test("infers a safe command runtime from the selected application manifest", () => {
  const runtime = recommendRuntime({
    files: [{ relativePath: "bun.lock" }],
    manifestCandidate: {
      entry: { relativePath: "apps/web/package.json" },
      manifest: { scripts: { dev: "next dev --port 3105" } },
    },
    framework: "Next.js",
    readmeExcerpt: "",
  });

  assert.equal(runtime.mode, "command");
  assert.equal(runtime.startCommand, "bun run dev");
  assert.equal(runtime.baseUrl, "http://127.0.0.1:3105");
  assert.equal(runtime.workingDirectory, "apps/web");
  assert.equal(runtime.source, "package-manifest");
});

test("falls back to npm when a lockfile package manager is unavailable", () => {
  assert.equal(detectPackageManager([{ relativePath: "yarn.lock" }], {}, () => false), "npm");
  assert.equal(detectPackageManager([{ relativePath: "pnpm-lock.yaml" }], {}, (command) => command === "pnpm"), "pnpm");
});

test("derives the base URL from the selected start script only", () => {
  const runtime = recommendRuntime({
    files: [{ relativePath: "package-lock.json" }],
    manifestCandidate: {
      entry: { relativePath: "package.json" },
      manifest: {
        scripts: {
          dev: "webpack serve --open --config webpack.dev.js",
          serve: "http-server ./dist -p 7002",
        },
      },
    },
    framework: "React",
    readmeExcerpt: "",
  });

  assert.equal(runtime.startCommand, "npm run dev");
  assert.equal(runtime.baseUrl, "http://127.0.0.1:8080");
});

test("recognizes Vinext and recommends its localhost development endpoint", () => {
  const runtime = recommendRuntime({
    files: [{ relativePath: "package-lock.json" }],
    manifestCandidate: {
      entry: { relativePath: "package.json" },
      manifest: {
        scripts: { dev: "vinext dev" },
        devDependencies: { vinext: "0.0.50" },
      },
    },
    framework: "Vinext",
    readmeExcerpt: "npm install\nnpm run dev",
  });

  assert.equal(runtime.startCommand, "npm run dev");
  assert.equal(runtime.baseUrl, "http://localhost:3000");
  assert.equal(runtime.workingDirectory, ".");
});

test("prioritizes the documented commerce domain over incidental authentication helpers", () => {
  const appType = detectAppType({
    readmeExcerpt: "A mobile-first shopping showcase where users browse products and build a cart.",
    packageManifest: { private: true, scripts: { dev: "vinext dev" } },
    relevantFiles: [{ relativePath: "app/chatgpt-auth.ts", excerpt: "export function auth() {}" }],
    uiHints: { canvases: [], headings: [], buttons: [], forms: [], inputs: [], links: [] },
  });

  assert.equal(appType, "commerce");
});

test("uses the observed accessible name for live button locators", () => {
  const plan = generateFlowPlan({
    detection: { confidence: "high", appType: "commerce" },
    uiHints: { headings: [], buttons: [], links: [], inputs: [], forms: [], canvases: [], statusElements: [] },
    liveExploration: {
      status: "completed",
      routes: [{
        path: "/",
        headings: ["Store"],
        buttons: [{ text: "Cart", ariaLabel: "Open cart with 0 items", id: "", dataTestId: "" }],
        links: [],
        inputs: [],
        formsCount: 0,
      }],
    },
  });

  assert.equal(plan.flows[0].blueprint.buttons[0].target.value, "Open cart with 0 items");
});

test("compiles repeated accessible links to an explicit observed occurrence", () => {
  const secondCartLink = compiledClickLocator({
    kind: "click",
    role: "link",
    name: "Cart",
    accessibleIndex: 1,
    accessibleCount: 2,
  }, [], "currentPage");
  const legacyCartLink = compiledClickLocator({
    kind: "click",
    role: "link",
    name: "Cart",
  }, [], "currentPage");

  assert.equal(secondCartLink, 'currentPage.getByRole("link", { name: new RegExp("^Cart$", "i") }).nth(1)');
  assert.equal(legacyCartLink, 'currentPage.getByRole("link", { name: new RegExp("^Cart$", "i") }).first()');
});

test("prefers a unique accessible link name over a global tag position", () => {
  const locator = compiledClickLocator({
    kind: "click",
    role: "link",
    name: "Querying",
    accessibleName: "Querying",
    accessibleIndex: 0,
    accessibleCount: 1,
    tagName: "a",
    tagIndex: 7,
  }, [], "currentPage");
  assert.equal(locator, 'currentPage.getByRole("link", { name: new RegExp("^Querying$", "i") }).nth(0)');
});

test("compiles observed selects by stable tag occurrence and actual option value", () => {
  const locator = compiledInputLocator({
    kind: "select",
    tagName: "select",
    tagIndex: 1,
    accessibleName: "Choose an airport",
  }, "currentPage", "combobox");
  assert.equal(locator, 'currentPage.locator("select").nth(1)');

  const fingerprint = "selected-airport";
  const inspection = {
    liveExploration: {
      agenticExploration: {
        states: [{ id: "state-1", fingerprint: "initial", headings: [], buttons: [] }, { id: "state-2", fingerprint, headings: [], buttons: [] }],
        steps: [{
          status: "completed",
          afterFingerprint: fingerprint,
          action: {
            kind: "select",
            name: "Choose an airport",
            accessibleName: "Choose an airport",
            value: "London Heathrow",
            options: [{ label: "London Heathrow", value: "LHR" }],
            tagName: "select",
            tagIndex: 0,
          },
        }],
      },
    },
  };
  const flow = { title: "Choose airport", evidenceStateIds: ["state-2"] };
  assert.deepEqual(validateObservedJourneyLocators(flow, inspection), {
    status: "passed",
    checkedActions: 1,
    strategies: ["tag-occurrence"],
  });
  assert.match(buildObservedJourneySpecContent(flow, inspection), /locator\("select"\)\.nth\(0\)\.selectOption\(\{ value: "LHR" \}\)/);
});

test("classifies generated locator failures separately from behavior assertions", () => {
  assert.equal(classifyTestFailure("failed", "locator.click: strict mode violation: getByRole('button') resolved to 8 elements"), "automation-locator");
  assert.equal(classifyTestFailure("failed", "expect(locator).toHaveText failed"), "behavior-assertion");
  assert.equal(classifyTestFailure("failed", "expect(received).toEqual(expected) assertion failed"), "behavior-assertion");
});

test("compiles a failed text submission through its terminal action and expected outcome", () => {
  const fingerprint = "same-after-submit";
  const source = buildObservedJourneySpecContent({
    id: "flow-boundary",
    title: "Create a one-character item",
    evidenceStateIds: ["state-2"],
  }, {
    liveExploration: {
      agenticExploration: {
        states: [{ id: "state-1", fingerprint: "initial", headings: ["todos"], buttons: [] }, { id: "state-2", fingerprint, headings: ["todos"], buttons: [] }],
        steps: [
          { status: "completed", afterFingerprint: fingerprint, action: { kind: "fill", name: "New task", value: "a", testId: "text-input" } },
          { status: "completed", afterFingerprint: fingerprint, expectedOutcome: "A new item labeled a should appear", action: { kind: "press", name: "Press Enter in New task", testId: "text-input" } },
        ],
      },
    },
  });

  assert.match(source, /getByTestId\("text-input"\)\.fill\("a"\)/);
  assert.match(source, /getByTestId\("text-input"\)\.press\("Enter"\)/);
  assert.match(source, /getByText\("a", \{ exact: true \}\)\.first\(\)/);
});

test("asserts a closed overlay instead of a rotating promotional heading", () => {
  const fingerprint = "overlay-closed";
  const source = buildObservedJourneySpecContent({ title: "Close promotion", evidenceStateIds: ["state-2"] }, {
    liveExploration: { agenticExploration: {
      states: [{ id: "state-1", fingerprint: "initial" }, { id: "state-2", fingerprint, headings: ["WOMEN'S LATEST FASHION SALE"], buttons: ["0"] }],
      steps: [{ status: "completed", afterFingerprint: fingerprint, action: { kind: "click", name: "Interactive modal-close-btn 0", tagName: "button", tagIndex: 0 } }],
    } },
  });
  assert.match(source, /\.modal:visible/);
  assert.doesNotMatch(source, /WOMEN'S LATEST FASHION SALE/);
});

test("builds loopback fallbacks and reads the URL announced by a dev server", () => {
  const candidates = buildLoopbackUrlCandidates("http://127.0.0.1:3000");
  const announced = extractAnnouncedLoopbackUrls("\u001b[32mLocal:\u001b[0m http://localhost:3001/");

  assert.deepEqual(candidates, [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ]);
  assert.deepEqual(announced, ["http://localhost:3001"]);
});

test("reports an early command exit with sanitized startup diagnostics", { timeout: 10000 }, async () => {
  await assert.rejects(
    startTargetRuntime({
      targetProjectPath: path.resolve(__dirname, ".."),
      runtimeConfig: {
        mode: "command",
        startCommand: "node -e \"console.error('vinext startup failed token=do-not-print'); process.exit(3)\"",
        baseUrl: "http://127.0.0.1:65530",
        workingDirectory: ".",
      },
    }),
    (error) => {
      assert.match(error.message, /exited before its URL became available/);
      assert.match(error.message, /vinext startup failed/);
      assert.doesNotMatch(error.message, /do-not-print/);
      assert.match(error.message, /token=\[REDACTED\]/);
      return true;
    }
  );
});

test("keeps long UI surfaces friendly to Firefox compositing", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../public/styles.css"), "utf8");
  const appSource = fs.readFileSync(path.resolve(__dirname, "../public/app.js"), "utf8");

  assert.doesNotMatch(css, /backdrop-filter\s*:/);
  assert.match(css, /\.background-grid\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /content-visibility:\s*auto/);
  assert.match(css, /contain-intrinsic-size:\s*auto\s+680px/);
  assert.match(appSource, /provider:\s*"ollama"/);
  assert.match(appSource, /qwen3:8b/);
  assert.doesNotMatch(appSource, /heuristic reading was preserved/);
});

test("resolves authenticated profiles from environment references without exposing values", () => {
  const environment = {
    E2P_AUTH_SAMPLE_SECRET: "runtime-only-value",
  };
  const config = normalizeAuthConfig({
    mode: "authenticated",
    adapter: "cookie-session",
    profileId: "sample",
    secretEnvVar: "E2P_AUTH_SAMPLE_SECRET",
    cookieName: "sample-session",
    initialPath: "/private",
    allowedPaths: ["/private"],
  });

  const status = getAuthConfigurationStatus(config, environment);
  const resolved = resolveAuthSecrets(config, environment);
  const metadata = toPublicAuthMetadata(config);

  assert.equal(status.configured, true);
  assert.equal(resolved.values.secret, "runtime-only-value");
  assert.equal(JSON.stringify(status).includes("runtime-only-value"), false);
  assert.equal(JSON.stringify(metadata).includes("E2P_AUTH_SAMPLE_SECRET"), false);
  assert.equal(JSON.stringify(metadata).includes("runtime-only-value"), false);
  resolved.dispose();
  assert.equal(resolved.values.secret, "");
});

test("rejects unsafe secret references and redacts credential material", () => {
  assert.throws(
    () => normalizeAuthConfig({
      mode: "authenticated",
      secretEnvVar: "UNRELATED_TOKEN",
    }),
    /E2P_AUTH_/
  );

  const redacted = redactSecrets(
    "Authorization: Bearer sensitive-value password=sensitive-value",
    ["sensitive-value"]
  );
  assert.equal(redacted.includes("sensitive-value"), false);
  assert.match(redacted, /\[REDACTED\]/);
});

test("keeps authentication secrets out of target and Playwright child environments", () => {
  const environment = {
    PATH: "C:\\tools",
    SYSTEMROOT: "C:\\Windows",
    E2P_AUTH_SAMPLE_SECRET: "do-not-forward",
    JANVAS_ACCEPTANCE_TEST_MODE: "1",
    UNRELATED_VALUE: "not-for-playwright",
  };

  const targetEnvironment = buildTargetEnvironment(environment);
  const playwrightEnvironment = buildRestrictedChildEnvironment({ TARGET_BASE_URL: "http://127.0.0.1:3000" }, environment);

  assert.equal(targetEnvironment.E2P_AUTH_SAMPLE_SECRET, undefined);
  assert.equal(targetEnvironment.JANVAS_ACCEPTANCE_TEST_MODE, "1");
  assert.equal(playwrightEnvironment.E2P_AUTH_SAMPLE_SECRET, undefined);
  assert.equal(playwrightEnvironment.UNRELATED_VALUE, undefined);
  assert.equal(playwrightEnvironment.TARGET_BASE_URL, "http://127.0.0.1:3000");
});

test("accepts only constrained authenticated read-only actions", () => {
  const access = {
    allowedPaths: ["/profile", "/inbox/*"],
  };
  const plan = validateAuthenticatedActionPlan({
    id: "profile-read",
    title: "Read profile",
    actions: [
      { type: "navigate", path: "/profile" },
      { type: "assert-heading", text: "Profile" },
      { type: "capture", name: "final" },
    ],
  }, access);

  assert.equal(plan.actions.length, 3);
  assert.throws(
    () => validateAuthenticatedActionPlan({
      id: "unsafe",
      title: "Unsafe",
      actions: [{ type: "click", text: "Delete" }],
    }, access),
    /not allowed/
  );
  assert.throws(
    () => validateAuthenticatedActionPlan({
      id: "external",
      title: "External",
      actions: [{ type: "navigate", path: "/admin" }],
    }, access),
    /outside the read-only allowlist/
  );
});

test("builds authenticated plans only from approved read-only routes", () => {
  const inspection = {
    detection: { confidence: "high", appType: "dashboard" },
    uiHints: { headings: [], buttons: [], links: [], inputs: [], canvases: [], statusElements: [] },
    liveExploration: {
      status: "completed",
      routes: [
        { path: "/profile", headings: ["Profile"], buttons: [], inputs: [] },
        { path: "/inbox", headings: ["Inbox"], buttons: [], inputs: [] },
      ],
    },
  };
  const plan = generateFlowPlan(inspection, {
    authConfig: {
      mode: "authenticated",
      adapter: "cookie-session",
      secretEnvVar: "E2P_AUTH_SAMPLE_SECRET",
      initialPath: "/profile",
      allowedPaths: ["/profile", "/inbox"],
    },
  });

  assert.equal(plan.mode, "authenticated-read-only");
  assert.equal(plan.flows.length, 2);
  assert.equal(plan.flows.every((flow) => flow.blueprint.kind === "authenticated-read-only"), true);
  assert.equal(plan.flows.every((flow) => flow.prohibitedEffects.includes("delete")), true);
});

test("rejects execution paths outside the generated run root", () => {
  const prototypeRoot = "C:\\prototype";
  validateRunPaths({
    prototypeRoot,
    runDirectory: "C:\\prototype\\prototype-runs\\safe-run",
    resultsDirectory: "C:\\prototype\\prototype-runs\\safe-run\\results",
  });

  assert.throws(
    () => validateRunPaths({
      prototypeRoot,
      runDirectory: "C:\\outside\\unsafe-run",
      resultsDirectory: "C:\\outside\\unsafe-run\\results",
    }),
    /child of the prototype-runs directory/
  );
});
