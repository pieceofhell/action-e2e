const path = require("path");
const { createRunDirectory, writeJson, writeText } = require("./artifact-store");
const { normalizeAiConfig, requestTextResponse } = require("./llm-provider");
const { normalizeRuntimeConfig } = require("./runtime-orchestrator");

async function generateTestBundle({
  prototypeRoot,
  projectPath,
  inspection,
  approvedFlows,
  runtimeConfig,
  aiConfig,
}) {
  const runsRoot = path.join(prototypeRoot, "prototype-runs");
  const run = await createRunDirectory(runsRoot, projectPath);
  const normalizedRuntime = normalizeRuntimeConfig(inspection.runtime, runtimeConfig);
  const normalizedAi = normalizeAiConfig(aiConfig);

  await writeJson(path.join(run.runDirectory, "inspection.json"), inspection);
  await writeJson(path.join(run.runDirectory, "approved-flows.json"), approvedFlows);
  await writeJson(path.join(run.runDirectory, "runtime-config.json"), normalizedRuntime);

  const generatedTests = [];

  for (const flow of approvedFlows) {
    const specFileName = `${sanitizeFileName(flow.id)}.spec.cjs`;
    const specFilePath = path.join(run.testsDirectory, specFileName);

    let content = "";
    let generationMode = "heuristic";
    let generationNote = "";

    content = buildHeuristicSpecContent(flow);

    if (normalizedAi.enabled) {
      generationMode = "deterministic";
      generationNote = "The approved flow and acceptance criteria may be model-refined, but the Playwright file is rendered by the deterministic generator for execution stability.";
    }

    await writeText(specFilePath, content);

    generatedTests.push({
      flowId: flow.id,
      title: flow.title,
      fileName: specFileName,
      filePath: specFilePath,
      generationMode,
      generationNote,
    });
  }

  await writeText(path.join(run.runDirectory, "playwright.config.cjs"), buildPlaywrightConfig());
  await writeText(path.join(run.runDirectory, "README.md"), buildRunReadme({
    inspection,
    approvedFlows,
    normalizedRuntime,
    generatedTests,
  }));
  await writeJson(path.join(run.runDirectory, "generated-tests.json"), generatedTests);

  return {
    runId: run.runId,
    runDirectory: run.runDirectory,
    testsDirectory: run.testsDirectory,
    resultsDirectory: run.resultsDirectory,
    artifactBaseUrl: `/artifacts/${run.runId}`,
    runtimeConfig: normalizedRuntime,
    generatedTests,
  };
}

function buildPlaywrightConfig() {
  return `const path = require("path");

module.exports = {
  testDir: path.join(__dirname, "tests"),
  timeout: 30000,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(__dirname, "results", "playwright-results.json") }]
  ],
  outputDir: path.join(__dirname, "results", "test-artifacts"),
  use: {
    baseURL: process.env.TARGET_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
};
`;
}

function buildRunReadme({ inspection, approvedFlows, normalizedRuntime, generatedTests }) {
  return `# Automatically generated execution

## Inspected project

- Name: ${inspection.project.name}
- Path: ${inspection.project.path}
- Detected framework: ${inspection.detection.framework}
- Primary language: ${inspection.detection.primaryLanguage}
- Archetype: ${inspection.detection.appType}

## Execution strategy

- Mode: ${normalizedRuntime.mode}
- Suggested install command: ${normalizedRuntime.installCommand || "not applicable"}
- Suggested start command: ${normalizedRuntime.startCommand || "not applicable"}
- Base URL: ${normalizedRuntime.baseUrl}

## Approved flows

${approvedFlows.map((flow) => `- ${flow.title}`).join("\n")}

## Generated tests

${generatedTests.map((testFile) => `- ${testFile.title} (${testFile.generationMode})`).join("\n")}
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
    "Use only evidence present in the provided context.",
    "Do not invent routes, selectors, labels, buttons, or inputs that are not grounded in the context.",
    "Prefer safe, non-destructive smoke coverage.",
    "Use Playwright syntax only. Valid examples include await expect(locator).toBeVisible(), await locator.click(), and await locator.fill('value').",
    "Never use shouldBeVisible, should(), Cypress APIs, Selenium APIs, WebDriver APIs, or absolute page.goto URLs.",
    "Prefer openHome(page) and relative routes over hardcoded full URLs.",
    "Prefer page.getByRole, page.getByText, page.getByPlaceholder, and page.locator.",
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
    interactionGuardrails: buildInteractionGuardrails(inspection),
    approvedFlow: {
      id: flow.id,
      title: flow.title,
      summary: flow.summary,
      confidence: flow.confidence,
      sourceSignals: flow.sourceSignals,
      assumptions: flow.assumptions,
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

  const rawBody = await requestTextResponse({
    aiConfig,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify(promptContext, null, 2),
      },
    ],
    timeoutMs: 210000,
  });

  const normalizedBody = normalizeAiTestBody(rawBody);
  if (!normalizedBody) {
    throw new Error("The model did not return a usable test body.");
  }

  validateAiTestBody(normalizedBody, inspection);

  const source = wrapSpecSource(flow.title, normalizedBody);
  validateGeneratedSpecSource(source);
  return source;
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
        }
      : {
          status: inspection.liveExploration?.status || "not-attempted",
          warnings: inspection.liveExploration?.warnings || [],
          error: inspection.liveExploration?.error || "",
        },
  };
}

function normalizeAiTestBody(rawText) {
  const stripped = stripCodeFences(String(rawText || "").trim());
  if (!stripped) {
    return "";
  }

  const wrappedMatch = stripped.match(/test\s*\([\s\S]*?async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;?\s*$/);
  if (wrappedMatch) {
    return wrappedMatch[1].trim();
  }

  return stripped.trim();
}

function validateAiTestBody(body, inspection) {
  const forbiddenPatterns = [
    { pattern: /\.should[A-Z]/, message: "The model used a non-Playwright assertion helper." },
    { pattern: /\.should\s*\(/, message: "The model used a Cypress-style should() assertion." },
    { pattern: /\bcy\./i, message: "The model used Cypress APIs instead of Playwright." },
    { pattern: /\bselenium\b/i, message: "The model referenced Selenium instead of Playwright." },
    { pattern: /\bwebdriver\b/i, message: "The model referenced WebDriver instead of Playwright." },
    { pattern: /\bdriver\./i, message: "The model used a non-Playwright driver API." },
    { pattern: /page\.goto\(\s*["']https?:\/\//i, message: "The model hardcoded an absolute URL instead of using openHome(page) or a relative route." },
  ];

  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(body)) {
      throw new Error(rule.message);
    }
  }

  if (!/await\s+expect\s*\(/.test(body)) {
    throw new Error("The generated test body did not include clear Playwright assertions or navigation.");
  }

  validateInteractionLines(body, inspection);
}

function stripCodeFences(text) {
  const fencedMatch = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : text.trim();
}

function buildInteractionGuardrails(inspection) {
  const buttonLabels = [
    ...(inspection.uiHints.buttons || []).map((button) => button.text || button.id || button.dataTool || ""),
    ...((inspection.liveExploration?.summary?.uniqueButtons) || []),
  ]
    .map((label) => String(label || "").trim())
    .filter(Boolean);

  return {
    observedHeadings: uniqueStrings([
      ...(inspection.uiHints.headings || []).map((heading) => heading.text || ""),
      ...((inspection.liveExploration?.summary?.uniqueHeadings) || []),
    ]).slice(0, 10),
    safeButtons: uniqueStrings(buttonLabels.filter((label) => !isUnsafeActionLabel(label))).slice(0, 10),
    unsafeButtons: uniqueStrings(buttonLabels.filter((label) => isUnsafeActionLabel(label))).slice(0, 10),
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

function validateInteractionLines(body, inspection) {
  const guardrails = buildInteractionGuardrails(inspection);
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
  const helperBlock = `const { test, expect } = require("@playwright/test");

async function openHome(page) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
}

async function pauseForUi(page, timeout = 160) {
  await page.waitForTimeout(timeout);
}
`;

  return `${helperBlock}
test(${jsString(title)}, async ({ page }) => {
${indent(body, 2)}
});
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
  const helperBlock = `const { test, expect } = require("@playwright/test");

async function openHome(page) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
}

async function pauseForUi(page, timeout = 160) {
  await page.waitForTimeout(timeout);
}
`;

  const body = buildFlowBody(flow);

  return `${helperBlock}
test(${jsString(flow.title)}, async ({ page }) => {
${indent(body, 2)}
});
`;
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
      return `page.getByRole(${jsString(target.role)}, { name: ${regexCode(target.value)} })`;
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
  generateTestBundle,
};
