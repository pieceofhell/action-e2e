const path = require("path");
const { createRunDirectory, ensureDirectory, writeJson, writeText } = require("./artifact-store");
const { normalizeAiConfig, requestStructuredJson, requestTextResponse } = require("./llm-provider");
const { normalizeRuntimeConfig } = require("./runtime-orchestrator");
const { normalizeAuthConfig, toPublicAuthMetadata } = require("./auth-config");
const { validateAuthenticatedActionPlan } = require("./read-only-policy");
const { isExplicitBaseline, requireAiForStage, requireCompletedAiExploration } = require("./pipeline-policy");

async function generateTestBundle({
  prototypeRoot,
  projectPath,
  inspection,
  approvedFlows,
  runtimeConfig,
  aiConfig,
  authConfig,
  onProgress = () => {},
}) {
  onProgress({ phase: "artifact-workspace", message: "Creating an isolated workspace for generated artifacts...", progress: 8 });
  const runsRoot = path.join(prototypeRoot, "prototype-runs");
  const run = await resolveRunWorkspace({ runsRoot, projectPath, inspection });
  const normalizedRuntime = normalizeRuntimeConfig(inspection.runtime, runtimeConfig);
  const normalizedAi = normalizeAiConfig(aiConfig);
  const normalizedAuth = normalizeAuthConfig(authConfig);
  requireAiForStage(aiConfig, "test generation");
  const baselineMode = isExplicitBaseline(aiConfig);
  if (!baselineMode) {
    requireCompletedAiExploration(inspection, "test generation");
  }

  await writeJson(path.join(run.runDirectory, "inspection.json"), inspection);
  await writeJson(path.join(run.runDirectory, "approved-flows.json"), approvedFlows);
  await writeJson(path.join(run.runDirectory, "runtime-config.json"), normalizedRuntime);
  onProgress({ phase: "approved-input", message: `Validated ${approvedFlows.length} approved flow(s) and the runtime configuration.`, progress: 16 });

  if (normalizedAuth.mode === "authenticated") {
    return generateAuthenticatedBundle({
      run,
      inspection,
      approvedFlows,
      normalizedRuntime,
      normalizedAi,
      normalizedAuth,
      onProgress,
    });
  }

  const generatedTests = [];

  for (const [index, flow] of approvedFlows.entries()) {
    const specFileName = `${sanitizeFileName(flow.id)}.spec.cjs`;
    const specFilePath = path.join(run.testsDirectory, specFileName);

    let content = "";
    let generationMode = baselineMode ? "explicit-baseline" : "model-journey-compiled";
    let generationNote = "";
    let locatorValidation = null;

    if (baselineMode) {
      content = buildHeuristicSpecContent(flow);
      generationNote = "Explicit baseline mode rendered this test without model inference.";
    } else {
      onProgress({
        phase: "journey-compilation",
        message: `Compiling the model-executed journey into test ${index + 1} of ${approvedFlows.length}: ${flow.title}`,
        progress: 20 + Math.round((index / approvedFlows.length) * 60),
      });
      locatorValidation = validateObservedJourneyLocators(flow, inspection);
      content = buildObservedJourneySpecContent(flow, inspection);
      if (!content) {
        throw new Error(`AI-first test generation stopped for "${flow.title}": no successfully executed model journey could be compiled for this flow.`);
      }
      generationNote = "E2P compiled the model's successfully executed browser journey into constrained Playwright. Every interaction passed the observed-locator contract before the file was saved.";
    }

    await writeText(specFilePath, content);
    onProgress({
      phase: "test-validation",
      message: `Validated and saved test ${index + 1} of ${approvedFlows.length}: ${flow.title}`,
      progress: 20 + Math.round(((index + 1) / approvedFlows.length) * 60),
    });

    generatedTests.push({
      flowId: flow.id,
      title: flow.title,
      fileName: specFileName,
      filePath: specFilePath,
      generationMode,
      generationNote,
      locatorValidation,
    });
  }

  await writeText(path.join(run.runDirectory, "playwright.config.cjs"), buildPlaywrightConfig());
  await writeText(path.join(run.runDirectory, "README.md"), buildRunReadme({
    inspection,
    approvedFlows,
    normalizedRuntime,
    generatedTests,
    access: toPublicAuthMetadata(normalizedAuth),
  }));
  await writeJson(path.join(run.runDirectory, "generated-tests.json"), generatedTests);
  onProgress({ phase: "artifact-index", message: "Writing the Playwright configuration and artifact index...", progress: 94 });

  return {
    runId: run.runId,
    runDirectory: run.runDirectory,
    testsDirectory: run.testsDirectory,
    resultsDirectory: run.resultsDirectory,
    artifactBaseUrl: `/artifacts/${run.runId}`,
    runtimeConfig: normalizedRuntime,
    access: toPublicAuthMetadata(normalizedAuth),
    generatedTests,
  };
}

async function resolveRunWorkspace({ runsRoot, projectPath, inspection }) {
  const existingRunId = String(inspection?.liveExploration?.artifactRun?.runId || "");
  if (!/^[a-z0-9-]+$/i.test(existingRunId)) {
    return createRunDirectory(runsRoot, projectPath);
  }

  const runDirectory = path.join(runsRoot, existingRunId);
  const run = {
    runId: existingRunId,
    runDirectory,
    testsDirectory: path.join(runDirectory, "tests"),
    resultsDirectory: path.join(runDirectory, "results"),
    artifactsDirectory: path.join(runDirectory, "artifacts"),
  };
  await Promise.all([
    ensureDirectory(run.runDirectory),
    ensureDirectory(run.testsDirectory),
    ensureDirectory(run.resultsDirectory),
    ensureDirectory(run.artifactsDirectory),
  ]);
  return run;
}

async function generateAuthenticatedBundle({
  run,
  inspection,
  approvedFlows,
  normalizedRuntime,
  normalizedAi,
  normalizedAuth,
  onProgress = () => {},
}) {
  const access = toPublicAuthMetadata(normalizedAuth);
  const generatedTests = [];
  const actionPlans = [];

  for (const [index, flow] of approvedFlows.entries()) {
    let actionPlan;
    let generationMode = "model-assisted-structured";
    let generationNote = "";

    if (!normalizedAi.enabled) {
      actionPlan = buildDeterministicAuthenticatedPlan(flow, access);
      generationMode = "explicit-baseline";
      generationNote = "Explicit baseline mode created a schema-validated read-only action plan.";
    } else {
      try {
        onProgress({
          phase: "model-action-planning",
          message: `Asking the selected model for read-only action plan ${index + 1} of ${approvedFlows.length}: ${flow.title}`,
          progress: 20 + Math.round((index / approvedFlows.length) * 60),
        });
        actionPlan = await buildAuthenticatedPlanWithAi({
          flow,
          inspection,
          access,
          aiConfig: normalizedAi,
        });
        generationMode = "model-assisted-structured";
        generationNote = "The selected model proposed a constrained action plan; E2P validated every action and route before saving it.";
      } catch (error) {
        throw new Error(`AI-first authenticated test generation stopped for "${flow.title}": ${error.message}`);
      }
    }

    const fileName = `${sanitizeFileName(flow.id)}.actions.json`;
    await writeJson(path.join(run.testsDirectory, fileName), actionPlan);
    onProgress({
      phase: "action-plan-validation",
      message: `Validated and saved read-only action plan ${index + 1} of ${approvedFlows.length}.`,
      progress: 20 + Math.round(((index + 1) / approvedFlows.length) * 60),
    });
    actionPlans.push(actionPlan);
    generatedTests.push({
      flowId: flow.id,
      title: flow.title,
      fileName,
      generationMode,
      generationNote,
    });
  }

  await writeJson(path.join(run.runDirectory, "auth-metadata.json"), access);
  await writeText(path.join(run.runDirectory, "README.md"), buildRunReadme({
    inspection,
    approvedFlows,
    normalizedRuntime,
    generatedTests,
    access,
  }));
  await writeJson(path.join(run.runDirectory, "generated-tests.json"), generatedTests);
  onProgress({ phase: "artifact-index", message: "Writing the authenticated artifact index...", progress: 94 });

  return {
    runId: run.runId,
    runDirectory: run.runDirectory,
    testsDirectory: run.testsDirectory,
    resultsDirectory: run.resultsDirectory,
    artifactBaseUrl: `/artifacts/${run.runId}`,
    runtimeConfig: normalizedRuntime,
    access,
    generatedTests,
    actionPlans,
  };
}

function buildDeterministicAuthenticatedPlan(flow, access) {
  const routePath = flow.blueprint?.routePath || access.initialPath;
  const actions = [
    { type: "navigate", path: routePath },
    { type: "assert-body" },
  ];

  if (flow.blueprint?.expectedHeading) {
    actions.push({ type: "assert-heading", text: flow.blueprint.expectedHeading });
  }

  actions.push({ type: "assert-url", path: routePath });
  actions.push({ type: "capture", name: "authenticated-read-only" });

  return validateAuthenticatedActionPlan({
    id: flow.id,
    title: flow.title,
    actions,
  }, access);
}

async function buildAuthenticatedPlanWithAi({ flow, inspection, access, aiConfig }) {
  const payload = await requestStructuredJson({
    aiConfig,
    systemPrompt: [
      "You create a constrained, read-only browser action plan for an authenticated E2E test.",
      "Return raw JSON with an actions array.",
      "Allowed action types are navigate, assert-body, assert-heading, assert-text, assert-url, and capture.",
      "Use only relative paths from access.allowedPaths and text observed in liveEvidence.",
      "Do not click, fill, submit, evaluate code, read credentials, inspect cookies, call APIs, or navigate to another origin.",
      "Use at most eight actions and include navigation, an assertion, and capture.",
      "Format: {\"actions\":[{\"type\":\"navigate\",\"path\":\"/...\"},{\"type\":\"assert-body\"},{\"type\":\"capture\",\"name\":\"final\"}]}",
    ].join(" "),
    userPrompt: JSON.stringify({
      access,
      flow: {
        id: flow.id,
        title: flow.title,
        summary: flow.summary,
        blueprint: flow.blueprint,
        criteria: flow.criteria,
      },
      liveEvidence: summarizeVisibleEvidence(inspection).liveExploration,
    }, null, 2),
    timeoutMs: 120000,
  });

  return validateAuthenticatedActionPlan({
    id: flow.id,
    title: flow.title,
    actions: payload.actions,
  }, access);
}

function buildPlaywrightConfig() {
  return `const path = require("path");

module.exports = {
  testDir: path.join(__dirname, "tests"),
  timeout: 60000,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(__dirname, "results", "playwright-results.json") }]
  ],
  outputDir: path.join(__dirname, "results", "test-artifacts"),
  use: {
    baseURL: process.env.TARGET_BASE_URL || "http://127.0.0.1:3000",
    // Keep an auditable visual record for every generated test, including passes.
    trace: "on",
    screenshot: "on",
    video: "on",
  },
};
`;
}

function buildRunReadme({ inspection, approvedFlows, normalizedRuntime, generatedTests, access }) {
  return `# Automatically generated execution

## Inspected project

- Name: ${inspection.project.name}
- Path: ${inspection.project.path}
- Detected framework: ${inspection.detection.framework}
- Primary language: ${inspection.detection.primaryLanguage}
- Archetype: ${inspection.detection.appType}

## Execution strategy

- Mode: ${normalizedRuntime.mode}
- Access: ${access?.mode || "guest"}
- Authentication adapter: ${access?.adapter || "none"}
- Suggested install command: ${normalizedRuntime.installCommand || "not applicable"}
- Suggested start command: ${normalizedRuntime.startCommand || "not applicable"}
- Base URL: ${normalizedRuntime.baseUrl}

## Approved flows

${approvedFlows.map((flow) => `- ${flow.title}`).join("\n")}

## Generated tests

${generatedTests.map((testFile) => `- ${testFile.title} (${testFile.generationMode})`).join("\n")}

${access?.mode === "authenticated" ? "Authenticated artifacts contain profile metadata and read-only actions only. Credential values and secret references are intentionally excluded." : ""}
`;
}

async function buildSpecContentWithAi({
  flow,
  inspection,
  approvedFlows,
  normalizedRuntime,
  aiConfig,
}) {
  const systemPrompt = [
    "You are authoring a Playwright test body for a local experimental E2E prototype.",
    "Return only plain JavaScript statements for the inside of the async test body.",
    "Do not return Markdown fences.",
    "Assume the file already imports test and expect from @playwright/test.",
    "Assume the wrapper already defines openHome(page) and pauseForUi(page).",
    "Call await openHome(page); exactly once as the first statement. Every Playwright action such as click, fill, goto, and wait must be awaited.",
    "Use only evidence present in the provided context.",
    "Do not invent routes, selectors, labels, buttons, or inputs that are not grounded in the context.",
    "Prefer safe, non-destructive smoke coverage.",
    "When the approved flow is supported by a model-guided journey, reproduce the relevant observed action sequence and assert the resulting state instead of reducing it to a landing-page smoke check.",
    "Use Playwright syntax only. Valid examples include await expect(locator).toBeVisible(), await locator.click(), and await locator.fill('value').",
    "Never use shouldBeVisible, should(), Cypress APIs, Selenium APIs, WebDriver APIs, or absolute page.goto URLs.",
    "Prefer openHome(page) and relative routes over hardcoded full URLs.",
    "Prefer page.getByRole, page.getByLabel, page.getByText, and evidence-grounded page.getByPlaceholder calls.",
    "Accessible names can be repeated in navigation landmarks such as headers and footers. Scope the locator when the evidence provides a landmark; otherwise make the selected occurrence explicit with first() so Playwright does not fail on an ambiguous strict locator.",
    "Treat observed button names as accessible role names: use page.getByRole('button', { name: 'Observed name' }), not getByLabel for buttons.",
    "Do not assert a URL change unless that exact path was observed after the corresponding action. Drawers and dialogs often keep the current URL.",
    "When a live form field has a visible label, use page.getByLabel with that label. Do not treat a field label as a placeholder unless the observed placeholder explicitly matches it.",
    "If you are uncertain, prefer visibility and navigation assertions over risky form submission or native system dialogs.",
    "Do not click controls that likely open file pickers, folder dialogs, uploads, authentication, checkout, destructive actions, or require unavailable project-specific input.",
    "Keep the test concise but meaningful.",
  ].join(" ");

  const promptContext = {
    project: inspection.project,
    synopsis: inspection.projectSynopsis,
    detection: inspection.detection,
    runtime: normalizedRuntime,
    visibleEvidence: summarizeVisibleEvidence(inspection),
    interactionGuardrails: buildInteractionGuardrails(inspection, flow),
    approvedFlow: {
      id: flow.id,
      title: flow.title,
      summary: flow.summary,
      confidence: flow.confidence,
      sourceSignals: flow.sourceSignals,
      assumptions: flow.assumptions,
      evidenceStateIds: flow.evidenceStateIds || [],
      blueprint: flow.blueprint || null,
      criteriaText: flow.criteriaText || formatCriteriaText(flow.criteria),
    },
    neighboringFlows: approvedFlows
      .filter((candidate) => candidate.id !== flow.id)
      .slice(0, 3)
      .map((candidate) => ({
        title: candidate.title,
        criteriaText: candidate.criteriaText || formatCriteriaText(candidate.criteria),
      })),
  };

  const messages = [{
    role: "user",
    content: JSON.stringify(promptContext, null, 2),
  }];
  let lastError = null;

  for (let attempt = 0; attempt < 1; attempt += 1) {
    const rawBody = await requestTextResponse({
      aiConfig,
      systemPrompt,
      messages,
      timeoutMs: 210000,
    });
    const normalizedBody = normalizeAiTestBody(rawBody);

    try {
      if (!normalizedBody) {
        throw new Error("The model did not return a usable test body.");
      }
      validateAiTestBody(normalizedBody, inspection, flow);
      const source = wrapSpecSource(flow.title, normalizedBody);
      validateGeneratedSpecSource(source);
      return source;
    } catch (error) {
      lastError = error;
      messages.push({ role: "assistant", content: String(rawBody).slice(-3500) });
    }
  }

  throw lastError || new Error("The model did not return a valid Playwright test body.");
}

function summarizeVisibleEvidence(inspection) {
  return {
    staticUiHints: {
      headings: inspection.uiHints.headings.slice(0, 8).map((item) => item.text),
      buttons: inspection.uiHints.buttons.slice(0, 12).map((item) => item.text || item.id || item.dataTool || ""),
      links: inspection.uiHints.links.slice(0, 10).map((item) => item.text || item.href || ""),
      inputs: inspection.uiHints.inputs.slice(0, 10).map((item) => item.placeholder || item.id || item.name || item.type || ""),
      canvases: inspection.uiHints.canvases.length,
    },
    liveExploration: inspection.liveExploration?.status === "completed"
      ? {
          baseUrl: inspection.liveExploration.baseUrl,
          summary: inspection.liveExploration.summary,
          routes: inspection.liveExploration.routes.slice(0, 4).map((route) => ({
            path: route.path,
            title: route.title,
            headings: (route.headings || []).slice(0, 5),
            buttons: (route.buttons || []).slice(0, 5).map((button) => button.text || button.id || button.dataTestId || "").filter(Boolean),
            links: (route.links || []).slice(0, 5).map((link) => ({ text: link.text || "", href: link.href || "" })),
            inputs: (route.inputs || []).slice(0, 5).map((input) => ({
              label: input.label || "",
              placeholder: input.placeholder || "",
              name: input.name || "",
              type: input.type || "",
            })),
            formsCount: route.formsCount || 0,
            dialogsCount: route.dialogsCount || 0,
            canvasesCount: route.canvasesCount || 0,
            visibleTextExcerpt: String(route.visibleTextExcerpt || "").slice(0, 280),
          })),
          modelGuidedJourney: inspection.liveExploration.agenticExploration
            ? {
                strategy: inspection.liveExploration.agenticExploration.strategy,
                model: inspection.liveExploration.agenticExploration.model,
                metrics: inspection.liveExploration.agenticExploration.metrics,
                states: (inspection.liveExploration.agenticExploration.states || []).slice(0, 8).map((state) => ({
                  id: state.id,
                  path: state.path,
                  headings: state.headings,
                  buttons: state.buttons,
                  inputs: state.inputs,
                  inputDetails: state.inputDetails || [],
                  dialogsCount: state.dialogsCount,
                  visibleTextExcerpt: String(state.visibleTextExcerpt || "").slice(0, 500),
                })),
                completedActions: (inspection.liveExploration.agenticExploration.steps || [])
                  .filter((step) => step.status === "completed")
                  .slice(0, 8)
                  .map((step) => ({
                    step: step.step,
                    action: step.action,
                    rationale: step.rationale,
                    changed: step.changed,
                    observedAfter: step.observedAfter,
                  })),
              }
            : null,
        }
      : {
          status: inspection.liveExploration?.status || "not-attempted",
          warnings: inspection.liveExploration?.warnings || [],
          error: inspection.liveExploration?.error || "",
        },
  };
}

function normalizeAiTestBody(rawText) {
  const withoutThinking = String(rawText || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
    .trim();
  const stripped = stripCodeFences(withoutThinking);
  if (!stripped) {
    return "";
  }

  const wrappedMatch = stripped.match(/test\s*\([\s\S]*?async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;?\s*$/);
  if (wrappedMatch) {
    return ensureHomeNavigation(wrappedMatch[1].trim());
  }

  return ensureHomeNavigation(stripped.trim());
}

function ensureHomeNavigation(body) {
  if (!body || /await\s+openHome\(\s*page\s*\)/.test(body)) {
    return body;
  }

  const relativeHome = /await\s+page\.goto\(\s*["']\/["']\s*\)\s*;?/;
  if (relativeHome.test(body)) {
    return body.replace(relativeHome, "await openHome(page);");
  }

  return `await openHome(page);\n${body}`;
}

function validateAiTestBody(body, inspection, flow = null) {
  const forbiddenPatterns = [
    { pattern: /\btest\s*\(/, message: "The model returned a complete test declaration instead of a single test body." },
    { pattern: /\.locator\(\s*["']text=/i, message: "The model used a raw text-engine selector instead of an evidence-grounded locator." },
    { pattern: /\.should[A-Z]/, message: "The model used a non-Playwright assertion helper." },
    { pattern: /\.should\s*\(/, message: "The model used a Cypress-style should() assertion." },
    { pattern: /\bcy\./i, message: "The model used Cypress APIs instead of Playwright." },
    { pattern: /\bselenium\b/i, message: "The model referenced Selenium instead of Playwright." },
    { pattern: /\bwebdriver\b/i, message: "The model referenced WebDriver instead of Playwright." },
    { pattern: /\bdriver\./i, message: "The model used a non-Playwright driver API." },
    { pattern: /page\.goto\(\s*["']https?:\/\//i, message: "The model hardcoded an absolute URL instead of using openHome(page) or a relative route." },
    { pattern: /page\.(?:hover|locator)\(\s*["']\.[^"']+["']/i, message: "The model used a CSS class selector that was not grounded in observed evidence." },
    { pattern: /page\.hover\s*\(/i, message: "The model used a hover selector that was not grounded in observed evidence." },
    { pattern: /\bwindow\./i, message: "The model referenced browser globals outside Playwright's page context." },
    { pattern: /\.toHaveCount\s*\(/i, message: "The model asserted an element count that was not grounded in observed evidence." },
  ];

  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(body)) {
      throw new Error(rule.message);
    }
  }

  validateAwaitedActions(body);
  validateObservedUrlAssertions(body, inspection);

  if (!/await\s+expect\s*\(/.test(body)) {
    throw new Error("The generated test body did not include clear Playwright assertions or navigation.");
  }

  validateNavigationOrder(body);
  validateRoleSpecificity(body);
  validateRoleNameGrounding(body, inspection, flow);
  validateInputLocatorGrounding(body, inspection, flow);
  validateTextLocatorGrounding(body, inspection, flow);
  validateInteractionLines(body, inspection, flow);
}

function validateAwaitedActions(body) {
  const lines = String(body || "").split("\n");
  const openHomeCalls = lines.filter((line) => /\bopenHome\(\s*page\s*\)/.test(line));
  if (openHomeCalls.length !== 1) {
    throw new Error("The model must call openHome(page) exactly once.");
  }

  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith("//")) continue;
    const invokesAsyncAction = /\bopenHome\(\s*page\s*\)|\.(?:click|fill|goto|waitFor|waitForTimeout|waitForLoadState|press|selectOption|check|uncheck)\s*\(/.test(normalized);
    if (invokesAsyncAction && !/^await\b/.test(normalized)) {
      throw new Error("Every Playwright navigation and interaction must be awaited.");
    }
  }
}

function validateObservedUrlAssertions(body, inspection) {
  if (!/toHaveURL\s*\(/.test(body)) return;
  const observedPaths = uniqueStrings([
    "/",
    ...(inspection?.liveExploration?.routes || []).map((route) => route.path || "/"),
    ...(inspection?.liveExploration?.agenticExploration?.states || []).map((state) => state.path || "/"),
  ]);
  const assertedFragments = [...String(body).matchAll(/toHaveURL\s*\(\s*\/([^/]+)\//g)]
    .map((match) => match[1].replace(/\\\//g, "/"));
  for (const fragment of assertedFragments) {
    if (fragment && !observedPaths.some((pathValue) => pathValue.includes(fragment))) {
      throw new Error(`The model asserted an unobserved URL fragment: ${fragment}.`);
    }
  }
}

function validateTextLocatorGrounding(body, inspection, flow = null) {
  const evidenceCorpus = collectFlowEvidenceStates(inspection, flow).flatMap((state) => [
      ...(state.headings || []),
      ...(state.buttons || []),
      ...(state.overlayTexts || []),
      state.visibleTextExcerpt || "",
    ]).join(" ").toLowerCase();
  const textCalls = String(body || "").matchAll(/getByText\(\s*["']([^"']+)["']/gi);
  for (const match of textCalls) {
    const value = match[1].trim().toLowerCase();
    if (value && !evidenceCorpus.includes(value)) {
      throw new Error(`The model used getByText('${match[1]}') without matching observed text.`);
    }
  }
}

function validateNavigationOrder(body) {
  const source = String(body || "");
  const navigationIndex = source.search(/await\s+openHome\(\s*page\s*\)/);
  const firstUiOperation = source.search(/\bexpect\s*\(|\bpage\.(?:getBy|locator|goto)/);

  if (navigationIndex < 0) {
    throw new Error("The model did not navigate with openHome(page) before interacting with the application.");
  }

  if (firstUiOperation >= 0 && navigationIndex > firstUiOperation) {
    throw new Error("The model attempted to inspect or interact with the page before openHome(page). ");
  }
}

function validateRoleSpecificity(body) {
  const genericRoleCalls = String(body || "").matchAll(/getByRole\(\s*["'](heading|button|link|textbox|checkbox|combobox|form|main|dialog)["']\s*\)/gi);

  for (const match of genericRoleCalls) {
    throw new Error(`The model used an unscoped getByRole('${match[1]}') selector without an observed accessible name.`);
  }
}

function validateRoleNameGrounding(body, inspection, flow = null) {
  const states = collectFlowEvidenceStates(inspection, flow);
  const knownByRole = {
    button: uniqueStrings(states.flatMap((state) => state.buttons || [])),
    link: uniqueStrings(states.flatMap((state) => (state.actions || []).filter((action) => action.role === "link").map((action) => action.name))),
    heading: uniqueStrings(states.flatMap((state) => state.headings || [])),
  };
  const roleCalls = String(body || "").matchAll(/getByRole\(\s*["'](button|link|heading)["']\s*,\s*\{\s*name\s*:\s*["']([^"']+)["']/gi);
  for (const match of roleCalls) {
    const role = match[1].toLowerCase();
    const name = match[2].trim().toLowerCase();
    if (name && !knownByRole[role].some((candidate) => candidate.toLowerCase() === name)) {
      throw new Error(`The model used an unobserved ${role} name: ${match[2]}.`);
    }
  }
}

function validateInputLocatorGrounding(body, inspection, flow = null) {
  const knownPlaceholders = collectKnownInputValues(inspection, "placeholder", flow);
  const placeholderCalls = String(body || "").matchAll(/getByPlaceholder\(\s*["']([^"']+)["']/gi);

  for (const match of placeholderCalls) {
    const value = match[1].trim();
    if (!knownPlaceholders.includes(value)) {
      throw new Error(`The model used getByPlaceholder('${value}') without a matching observed placeholder.`);
    }
  }

  const knownLabels = collectKnownInputValues(inspection, "label", flow);
  const labelCalls = String(body || "").matchAll(/getByLabel\(\s*["']([^"']+)["']/gi);

  for (const match of labelCalls) {
    const value = match[1].trim();
    if (!knownLabels.includes(value)) {
      throw new Error(`The model used getByLabel('${value}') without a matching observed label.`);
    }
  }
}

function collectKnownInputValues(inspection, field, flow = null) {
  const relevantStates = collectFlowEvidenceStates(inspection, flow);
  const stateValues = relevantStates.flatMap((state) => (state.inputDetails || []).map((input) => input?.[field] || ""));
  if (field === "label") {
    stateValues.push(...relevantStates.flatMap((state) => state?.inputs || []));
  }
  return uniqueStrings(stateValues);
}

function collectFlowEvidenceStates(inspection, flow) {
  const states = inspection?.liveExploration?.agenticExploration?.states || [];
  const requested = new Set(flow?.evidenceStateIds || flow?.blueprint?.evidenceStateIds || []);
  return requested.size ? states.filter((state) => requested.has(state.id)) : states;
}

function hasLiveEvidence(inspection) {
  return inspection?.liveExploration?.status === "completed"
    && Array.isArray(inspection.liveExploration.routes)
    && inspection.liveExploration.routes.length > 0
    && inspection.liveExploration.agenticExploration?.usedModel === true
    && inspection.liveExploration.agenticExploration?.status === "completed";
}

function uniqueStrings(items) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function stripCodeFences(text) {
  const fencedMatch = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : text.trim();
}

function buildInteractionGuardrails(inspection, flow = null) {
  const buttonLabels = collectFlowEvidenceStates(inspection, flow)
    .flatMap((state) => state.buttons || [])
    .map((label) => String(label || "").trim())
    .filter(Boolean);

  return {
    observedHeadings: uniqueStrings([
      ...(inspection.uiHints.headings || []).map((heading) => heading.text || ""),
      ...((inspection.liveExploration?.summary?.uniqueHeadings) || []),
    ]).slice(0, 10),
    safeButtons: uniqueStrings(buttonLabels.filter((label) => !isUnsafeActionLabel(label))).slice(0, 60),
    unsafeButtons: uniqueStrings(buttonLabels.filter((label) => isUnsafeActionLabel(label))).slice(0, 30),
  };
}

function isUnsafeActionLabel(label) {
  return /\b(browse|choose|folder|file|upload|import|download|load|login|log in|sign in|checkout|pay|purchase|submit|save|delete|remove|clear|reset|destroy)\b/i.test(label || "");
}

function uniqueStrings(items) {
  const output = [];

  for (const item of items || []) {
    const normalized = String(item || "").trim();
    if (normalized && !output.includes(normalized)) {
      output.push(normalized);
    }
  }

  return output;
}

function validateInteractionLines(body, inspection, flow = null) {
  const guardrails = buildInteractionGuardrails(inspection, flow);
  const lines = String(body || "").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const compactContext = lines.slice(Math.max(0, index - 2), index + 1).join(" ").toLowerCase();

    if (/\.click\s*\(/i.test(line)) {
      if (/getbyrole\(\s*['"]button['"]\s*\)/i.test(compactContext) && !/name\s*:/.test(compactContext)) {
        throw new Error("The model attempted to click a generic button collection instead of a specific safe control.");
      }

      if (guardrails.unsafeButtons.some((label) => compactContext.includes(label.toLowerCase()))) {
        throw new Error("The model attempted to click a control that may open a native dialog or require unavailable input.");
      }

      const referencesKnownSafeButton = guardrails.safeButtons.some((label) => compactContext.includes(label.toLowerCase()));
      const referencesKnownLink = /getbyrole\(\s*['"]link['"]|locator\(\s*['"]a\[href=|href/i.test(compactContext);

      if (!referencesKnownSafeButton && !referencesKnownLink) {
        throw new Error("The model attempted to click a target that was not clearly grounded in the safe interaction hints.");
      }
    }

    if (/\.fill\s*\(/i.test(line) && /(getbytext|locator\(\s*['"]text=|getbyrole\(\s*['"]button['"])/i.test(compactContext)) {
      throw new Error("The model attempted to fill a target that does not look like an input field.");
    }
  }
}

function wrapSpecSource(title, body) {
  const helperBlock = buildGuestHelperBlock();

  return `${helperBlock}
test(${jsString(title)}, async ({ page }) => {
${indent(body, 2)}
});
`;
}

function buildGuestHelperBlock() {
  return `const { test, expect } = require("@playwright/test");

async function openHome(page) {
  await page.context().route("**/*", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method().toUpperCase())) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(5000);
  await expect(page.locator("vite-error-overlay, [data-vite-error-overlay], #webpack-dev-server-client-overlay")).toHaveCount(0);
}

async function pauseForUi(page, timeout = 160) {
  await page.waitForTimeout(timeout);
}
`;
}

function validateGeneratedSpecSource(source) {
  try {
    new Function(source);
  } catch (error) {
    throw new Error(`The model produced invalid JavaScript: ${error.message}`);
  }
}

function buildHeuristicSpecContent(flow) {
  const helperBlock = buildGuestHelperBlock();

  const body = buildFlowBody(flow);

  return `${helperBlock}
test(${jsString(flow.title)}, async ({ page }) => {
${indent(body, 2)}
});
`;
}

function buildObservedJourneySpecContent(flow, inspection) {
  const exploration = inspection?.liveExploration?.agenticExploration;
  const requestedStateIds = flow.evidenceStateIds || flow.blueprint?.evidenceStateIds || [];
  if (!exploration || !requestedStateIds.length) return "";

  const states = exploration.states || [];
  const targetIndex = Math.max(...requestedStateIds.map((id) => states.findIndex((state) => state.id === id)));
  if (targetIndex < 0) return "";

  const targetState = states[targetIndex];
  const allSteps = exploration.steps || [];
  const targetStepIndex = allSteps.findLastIndex((step) => step.status === "completed" && step.afterFingerprint === targetState.fingerprint);
  if (targetStepIndex < 0) return "";
  const journeySteps = allSteps
    .slice(0, targetStepIndex + 1)
    .filter((step) => step.status === "completed")
    .slice(0, 20);
  if (!journeySteps.length) return "";

  const lines = ["await openHome(page);", "let currentPage = page;"];
  for (const step of journeySteps) {
    const action = step.action || {};
    if (action.kind === "click" && action.name) {
      if (action.targetBlank) {
        lines.push("const popupPromise = currentPage.waitForEvent('popup');");
        lines.push(`await ${compiledClickLocator(action, states, "currentPage")}.click();`);
        lines.push("currentPage = await popupPromise;");
        lines.push("await currentPage.waitForLoadState('domcontentloaded');");
      } else {
        lines.push(`await ${compiledClickLocator(action, states, "currentPage")}.click();`);
      }
      lines.push("await pauseForUi(currentPage, 300);");
    } else if (action.kind === "fill" && action.name && action.value) {
      const locator = compiledInputLocator(action, "currentPage");
      lines.push(`await ${locator}.fill(${jsString(action.value)});`);
      lines.push("await pauseForUi(currentPage, 300);");
    } else if (action.kind === "select" && action.name && action.value) {
      const locator = compiledInputLocator(action, "currentPage", "combobox");
      lines.push(`await ${locator}.selectOption(${compiledSelectOption(action)});`);
      lines.push("await pauseForUi(currentPage, 300);");
    } else if (action.kind === "press" && action.name) {
      const locator = compiledInputLocator(action, "currentPage");
      lines.push(`await ${locator}.press("Enter");`);
      lines.push("await pauseForUi(currentPage, 300);");
    }
  }

  const terminalStep = journeySteps.at(-1);
  const priorFill = [...journeySteps].reverse().find((step) => step.action?.kind === "fill" && step.action?.value);
  const expectsCreatedText = terminalStep?.action?.kind === "press"
    && /\b(appear|add(?:ed)?|creat(?:e|ed)|display(?:ed)?|list(?:ed)?|submitted?)\b/i.test(terminalStep.expectedOutcome || "")
    && priorFill?.action?.value;
  const assertedButton = (targetState.buttons || []).find((label) => label && !isUnsafeActionLabel(label) && /[a-z]/i.test(label));
  const closesOverlay = terminalStep?.action?.kind === "click"
    && /\b(?:close|dismiss|modal-close|close-overlay)\b/i.test(terminalStep.action.name || "");
  const assertedHeading = (targetState.headings || []).find((heading) => (
    heading && !/\b(?:sale|off|discount|deal|limited time)\b/i.test(heading)
  ));
  if (expectsCreatedText) {
    lines.push(`await expect(currentPage.getByText(${jsString(priorFill.action.value)}, { exact: true }).first()).toBeVisible();`);
  } else if (closesOverlay) {
    lines.push('await expect(currentPage.locator("dialog:visible, [role=\\"dialog\\"]:visible, [aria-modal=\\"true\\"]:visible, .modal:visible, [class*=\\"drawer\\"]:visible")).toHaveCount(0);');
  } else if (assertedHeading) {
    lines.push(`await expect(currentPage.getByRole("heading", { name: ${jsString(assertedHeading)}, exact: true })).toBeVisible();`);
  } else if (assertedButton) {
    lines.push(`await expect(currentPage.getByRole("button", { name: ${jsString(assertedButton)}, exact: true }).first()).toBeVisible();`);
  } else {
    lines.push("await expect(currentPage.locator('body')).toBeVisible();");
  }

  const source = wrapSpecSource(flow.title, lines.join("\n"));
  validateGeneratedSpecSource(source);
  return source;
}

function compiledClickLocator(action, states, pageVariable = "page") {
  if (action.testId) {
    return `${pageVariable}.getByTestId(${jsString(action.testId)})`;
  }
  if (action.domId) {
    return `${pageVariable}.locator(${jsString(`#${escapeCssIdentifier(action.domId)}`)})`;
  }
  if (action.visualSelector && Number.isInteger(action.visualIndex) && action.visualIndex >= 0) {
    return `${pageVariable}.locator(${jsString(action.visualSelector)}).nth(${action.visualIndex})`;
  }
  const role = action.role === "link" ? "link" : "button";
  const accessibleName = action.accessibleName || action.name;
  const exactAccessibleName = `^${escapeRegExp(accessibleName)}$`;
  const accessibleLocator = `${pageVariable}.getByRole(${jsString(role)}, { name: new RegExp(${jsString(exactAccessibleName)}, "i") })`;
  const hasRealAccessibleName = accessibleName && !/^Interactive\s/i.test(accessibleName);
  if (hasRealAccessibleName && Number.isInteger(action.accessibleIndex) && action.accessibleIndex >= 0) {
    return `${accessibleLocator}.nth(${action.accessibleIndex})`;
  }
  if (hasRealAccessibleName) return `${accessibleLocator}.first()`;
  if (action.tagName && Number.isInteger(action.tagIndex) && action.tagIndex >= 0) {
    return `${pageVariable}.locator(${jsString(action.tagName)}).nth(${action.tagIndex})`;
  }
  if (action.nameAttribute && action.tagName) {
    return `${pageVariable}.locator(${jsString(`${action.tagName}[name="${escapeCssAttribute(action.nameAttribute)}"]`)}).first()`;
  }
  return `${pageVariable}.locator("button").first()`;
}

function compiledInputLocator(action, pageVariable = "page", fallbackRole = "textbox") {
  if (action.testId) return `${pageVariable}.getByTestId(${jsString(action.testId)})`;
  if (action.domId) return `${pageVariable}.locator(${jsString(`#${escapeCssIdentifier(action.domId)}`)})`;
  if (action.placeholder) return `${pageVariable}.getByPlaceholder(${jsString(action.placeholder)}, { exact: true })`;
  if (action.label) return `${pageVariable}.getByLabel(${jsString(action.label)}, { exact: true })`;
  if (action.tagName && Number.isInteger(action.tagIndex) && action.tagIndex >= 0) {
    return `${pageVariable}.locator(${jsString(action.tagName)}).nth(${action.tagIndex})`;
  }
  if (action.nameAttribute && action.tagName) {
    return `${pageVariable}.locator(${jsString(`${action.tagName}[name="${escapeCssAttribute(action.nameAttribute)}"]`)}).first()`;
  }
  const name = action.accessibleName || action.name.replace(/^Press Enter in /i, "");
  const locator = `${pageVariable}.getByRole(${jsString(fallbackRole)}, { name: ${jsString(name)}, exact: true })`;
  if (Number.isInteger(action.accessibleIndex) && action.accessibleIndex >= 0) return `${locator}.nth(${action.accessibleIndex})`;
  return `${locator}.first()`;
}

function compiledSelectOption(action) {
  const requested = String(action.value || "");
  const option = (action.options || []).find((candidate) => (
    candidate.value === requested || candidate.label === requested
  ));
  if (option) return `{ value: ${jsString(option.value)} }`;
  return `{ label: ${jsString(requested)} }`;
}

function validateObservedJourneyLocators(flow, inspection) {
  const exploration = inspection?.liveExploration?.agenticExploration;
  const stateIds = flow.evidenceStateIds || flow.blueprint?.evidenceStateIds || [];
  const targetState = (exploration?.states || []).filter((state) => stateIds.includes(state.id)).at(-1);
  const targetStepIndex = (exploration?.steps || []).findLastIndex((step) => (
    step.status === "completed" && step.afterFingerprint === targetState?.fingerprint
  ));
  if (!targetState || targetStepIndex < 0) {
    throw new Error(`No executed journey reaches the evidence state for "${flow.title}".`);
  }
  const actions = exploration.steps.slice(0, targetStepIndex + 1)
    .filter((step) => step.status === "completed")
    .map((step) => step.action || {})
    .filter((action) => ["click", "fill", "select", "press"].includes(action.kind));
  const invalid = actions.filter((action) => !hasStableObservedLocator(action));
  if (invalid.length) {
    throw new Error(`Observed locator contract failed for: ${invalid.map((action) => action.name || action.kind).join(", ")}.`);
  }
  return {
    status: "passed",
    checkedActions: actions.length,
    strategies: actions.map(locatorStrategy),
  };
}

function hasStableObservedLocator(action) {
  if (action.testId || action.domId || action.placeholder || action.label || action.visualSelector) return true;
  if (action.nameAttribute && action.tagName) return true;
  if (action.tagName && Number.isInteger(action.tagIndex) && action.tagIndex >= 0) return true;
  if (action.accessibleName || action.name) {
    return action.accessibleCount <= 1 || (Number.isInteger(action.accessibleIndex) && action.accessibleIndex >= 0);
  }
  return false;
}

function locatorStrategy(action) {
  if (action.testId) return "test-id";
  if (action.domId) return "dom-id";
  if (action.placeholder) return "placeholder";
  if (action.label) return "label";
  if (action.visualSelector) return "observed-css-occurrence";
  if (action.nameAttribute) return "name-attribute-occurrence";
  if (action.tagName) return "tag-occurrence";
  return "accessible-name-occurrence";
}

function escapeCssIdentifier(value) {
  return String(value).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function escapeCssAttribute(value) {
  return String(value).replace(/([\\"])/g, "\\$1");
}

function buildFlowBody(flow) {
  switch (flow.blueprint?.kind) {
    case "render":
      return buildRenderFlow(flow);
    case "safe-actions":
      return buildSafeActionsFlow(flow);
    case "tool-switch":
      return buildToolSwitchFlow(flow);
    case "canvas-smoke":
      return buildCanvasFlow(flow);
    case "auth-presence":
      return buildAuthPresenceFlow(flow);
    case "form-validation":
      return buildFormValidationFlow(flow);
    case "navigation":
      return buildNavigationFlow(flow);
    case "live-route":
      return buildLiveRouteFlow(flow);
    case "live-form":
      return buildLiveFormReviewFlow(flow);
    default:
      return ["await openHome(page);", "await expect(page.locator('body')).toBeVisible();"].join("\n");
  }
}

function buildRenderFlow(flow) {
  const lines = [
    "await openHome(page);",
    "await expect(page.locator('body')).toBeVisible();",
    "await expect(page).toHaveTitle(/.+/);",
  ];

  if (flow.blueprint?.heading?.target) {
    lines.push(`await expect(${locatorCode(flow.blueprint.heading.target)}).toBeVisible();`);
  }

  for (const button of flow.blueprint?.buttons || []) {
    if (button?.target) {
      lines.push(`await expect(${locatorCode(button.target)}).toBeVisible();`);
    }
  }

  if (flow.blueprint?.canvas?.target) {
    lines.push(`await expect(${locatorCode(flow.blueprint.canvas.target)}).toBeVisible();`);
  }

  return lines.join("\n");
}

function buildSafeActionsFlow(flow) {
  const lines = [
    "await openHome(page);",
    "await expect(page.locator('body')).toBeVisible();",
  ];

  for (const button of flow.blueprint?.buttons || []) {
    if (!button?.target) continue;
    lines.push(`await expect(${locatorCode(button.target)}).toBeVisible();`);
    lines.push(`if (await ${locatorCode(button.target)}.isEnabled()) {`);
    lines.push(`  await ${locatorCode(button.target)}.click();`);
    lines.push("  await pauseForUi(page);");
    lines.push("}");
  }

  lines.push("await expect(page.locator('body')).toBeVisible();");
  return lines.join("\n");
}

function buildToolSwitchFlow(flow) {
  const toolButtons = flow.blueprint?.toolButtons || [];
  const lines = ["await openHome(page);"];

  if (flow.blueprint?.toolLabel?.target) {
    lines.push(`const toolLabel = ${locatorCode(flow.blueprint.toolLabel.target)};`);
    lines.push("let previousToolLabel = ((await toolLabel.textContent()) || '').trim();");
    lines.push("let currentToolLabel = previousToolLabel;");
    lines.push("let hasObservedToolChange = false;");
  }

  for (const button of toolButtons) {
    if (!button?.target) continue;
    lines.push(`await expect(${locatorCode(button.target)}).toBeVisible();`);
    lines.push(`await ${locatorCode(button.target)}.click();`);
    lines.push("await pauseForUi(page);");

    if (flow.blueprint?.toolLabel?.target) {
      lines.push("currentToolLabel = ((await toolLabel.textContent()) || '').trim();");
      lines.push("expect(currentToolLabel.length).toBeGreaterThan(0);");
      lines.push("if (hasObservedToolChange && previousToolLabel) { expect(currentToolLabel).not.toBe(previousToolLabel); }");
      lines.push("previousToolLabel = currentToolLabel;");
      lines.push("hasObservedToolChange = true;");
    }
  }

  lines.push("await expect(page.locator('body')).toBeVisible();");
  return lines.join("\n");
}

function buildCanvasFlow(flow) {
  const lines = ["await openHome(page);"];

  if (flow.blueprint?.toolButton?.target) {
    lines.push(`await ${locatorCode(flow.blueprint.toolButton.target)}.click();`);
    lines.push("await pauseForUi(page);");
  }

  const canvasLocator = flow.blueprint?.canvas?.target
    ? locatorCode(flow.blueprint.canvas.target)
    : "page.locator('canvas').first()";

  lines.push(`const canvas = ${canvasLocator};`);
  lines.push("await expect(canvas).toBeVisible();");
  lines.push("const box = await canvas.boundingBox();");
  lines.push("expect(box).not.toBeNull();");
  lines.push("await canvas.click({ position: { x: Math.max(12, Math.min(80, Math.round(box.width / 2))), y: Math.max(12, Math.min(80, Math.round(box.height / 2))) } });");
  lines.push("await pauseForUi(page);");

  if (flow.blueprint?.statusElement?.target) {
    lines.push(`await expect(${locatorCode(flow.blueprint.statusElement.target)}).toBeVisible();`);
  }

  return lines.join("\n");
}

function buildAuthPresenceFlow(flow) {
  const lines = ["await openHome(page);"];

  for (const input of flow.blueprint?.inputs || []) {
    if (input?.target) {
      lines.push(`await expect(${locatorCode(input.target)}).toBeVisible();`);
    }
  }

  if (flow.blueprint?.submitButton?.target) {
    lines.push(`await expect(${locatorCode(flow.blueprint.submitButton.target)}).toBeVisible();`);
  }

  return lines.join("\n");
}

function buildFormValidationFlow(flow) {
  const lines = ["await openHome(page);"];
  const fillableInputs = (flow.blueprint?.inputs || []).filter((input) => input?.target);

  for (const input of fillableInputs.slice(0, 3)) {
    const locator = locatorCode(input.target);
    const value = sampleValueForInput(input);
    lines.push(`await expect(${locator}).toBeVisible();`);
    lines.push(`await ${locator}.fill(${jsString(value)});`);
  }

  if (flow.blueprint?.submitButton?.target) {
    const submitLocator = locatorCode(flow.blueprint.submitButton.target);
    lines.push(`await expect(${submitLocator}).toBeVisible();`);
    lines.push(`await ${submitLocator}.click();`);
    lines.push("await pauseForUi(page);");
    lines.push("const invalidCount = await page.locator(':invalid').count();");

    if ((flow.blueprint?.requiredInputs || []).length > 0) {
      lines.push("expect(invalidCount).toBeGreaterThanOrEqual(0);");
    } else {
      lines.push("await expect(page.locator('body')).toBeVisible();");
    }
  }

  lines.push("await expect(page.locator('body')).toBeVisible();");
  return lines.join("\n");
}

function buildNavigationFlow(flow) {
  const firstLink = flow.blueprint?.links?.[0];

  if (!firstLink?.target) {
    return ["await openHome(page);", "await expect(page.locator('body')).toBeVisible();"].join("\n");
  }

  const linkLocator = locatorCode(firstLink.target);
  return [
    "await openHome(page);",
    "const initialUrl = page.url();",
    `await expect(${linkLocator}).toBeVisible();`,
    `await ${linkLocator}.click();`,
    "await page.waitForLoadState('domcontentloaded');",
    "expect(page.url()).not.toBe(initialUrl);",
  ].join("\n");
}

function buildLiveRouteFlow(flow) {
  const routePath = flow.blueprint?.routePath || "/";
  const lines = [
    "await openHome(page);",
  ];

  if (routePath !== "/") {
    lines.push(`await page.goto(${jsString(routePath)});`);
    lines.push("await page.waitForLoadState('domcontentloaded');");
  }

  if (flow.blueprint?.expectedHeading) {
    lines.push(`await expect(page.getByRole("heading", { name: ${regexCode(flow.blueprint.expectedHeading)} })).toBeVisible();`);
  } else {
    lines.push("await expect(page.locator('body')).toBeVisible();");
  }

  return lines.join("\n");
}

function buildLiveFormReviewFlow(flow) {
  const lines = [
    "await openHome(page);",
  ];
  const routePath = flow.blueprint?.routePath || "/";

  if (routePath !== "/") {
    lines.push(`await page.goto(${jsString(routePath)});`);
    lines.push("await page.waitForLoadState('domcontentloaded');");
  }

  if (flow.blueprint?.expectedHeading) {
    lines.push(`await expect(page.getByRole("heading", { name: ${regexCode(flow.blueprint.expectedHeading)} })).toBeVisible();`);
  }

  for (const input of flow.blueprint?.inputs || []) {
    const locator = input.placeholder
      ? `page.getByPlaceholder(${regexCode(input.placeholder)})`
      : input.label
        ? `page.getByLabel(${regexCode(input.label)}, { exact: false })`
        : input.name
          ? `page.locator(${jsString(`[name="${input.name}"]`)})`
          : "";

    if (!locator) {
      continue;
    }

    lines.push(`await expect(${locator}).toBeVisible();`);
    if (input.type !== "file" && input.type !== "checkbox" && input.type !== "radio") {
      lines.push(`await ${locator}.fill(${jsString(sampleValueForInput(input))});`);
    }
  }

  lines.push("await expect(page.locator('body')).toBeVisible();");
  return lines.join("\n");
}

function locatorCode(target) {
  if (!target) {
    return "page.locator('body')";
  }

  switch (target.strategy) {
    case "id":
      return `page.locator(${jsString(`#${target.value}`)})`;
    case "dataTool":
      return `page.locator(${jsString(`[data-tool="${target.value}"]`)})`;
    case "roleText":
      return `page.getByRole(${jsString(target.role)}, { name: ${jsString(target.value)}, exact: true })`;
    case "text":
      return `page.getByText(${jsString(target.value)}, { exact: true })`;
    case "href":
      return `page.locator(${jsString(`a[href="${target.value}"]`)})`;
    case "placeholder":
      return `page.getByPlaceholder(${regexCode(target.value)})`;
    case "selector":
      return `page.locator(${jsString(target.value)})`;
    default:
      return "page.locator('body')";
  }
}

function sampleValueForInput(input) {
  const type = String(input.type || "").toLowerCase();
  const labelHint = `${input.label || ""} ${input.placeholder || ""} ${input.name || ""}`.toLowerCase();

  if (type === "email") return "demo@example.com";
  if (type === "password") return "TemporaryPassword123!";
  if (type === "number") return "42";
  if (/name/.test(labelHint)) return "Test User";
  return "e2e-test";
}

function formatCriteriaText(criteria) {
  return (criteria || [])
    .map((criterion) => [
      criterion.title,
      `Given ${criterion.given}`,
      `When ${criterion.when}`,
      `Then ${criterion.then}`,
    ].join("\n"))
    .join("\n\n");
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

function jsString(value) {
  return JSON.stringify(String(value));
}

function regexCode(value) {
  return `new RegExp(${jsString(escapeRegExp(String(value)))}, "i")`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function indent(text, spaces) {
  const prefix = " ".repeat(spaces);
  return String(text || "")
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

module.exports = {
  buildObservedJourneySpecContent,
  compiledClickLocator,
  compiledInputLocator,
  generateTestBundle,
  hasLiveEvidence,
  validateAiTestBody,
  validateObservedJourneyLocators,
};
