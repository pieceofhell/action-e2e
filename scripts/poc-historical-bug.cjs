const fs = require("fs/promises");
const path = require("path");
const { chromium } = require("playwright");
const { startTargetRuntime } = require("../src/services/runtime-orchestrator");
const { requestStructuredJson } = require("../src/services/llm-provider");
const {
  classifyHistoricalBugPair,
  compileObservedJourneyWithOracle,
  matchesDopaFavoritesGroundTruth,
  validateDopaFavoritesOraclePlan,
} = require("../src/services/bug-evaluator");

const prototypeRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(prototypeRoot, "evaluation-results", "bug-discovery");
const evidenceRoot = path.join(outputRoot, "evidence");
const model = process.env.E2P_POC_MODEL || "qwen3:8b";
const aiConfig = {
  enabled: true,
  provider: "ollama",
  endpoint: process.env.E2P_POC_OLLAMA_ENDPOINT || "http://127.0.0.1:11434",
  model,
};
const visionEnabled = process.env.E2P_POC_VISION !== "false";
const blindOnly = process.env.E2P_POC_BLIND_ONLY === "true";
const campaignObjective = process.env.E2P_POC_OBJECTIVE === "navigation-consistency"
  ? "navigation-consistency"
  : "general";
const evidenceMode = process.env.E2P_POC_EVIDENCE_MODE === "vision-only"
  ? "vision-only"
  : (visionEnabled ? "screenshot+structured-state" : "structured-state");

const revisions = [
  {
    role: "buggy",
    commit: "a0e881f",
    projectPath: process.env.E2P_POC_BUGGY_PATH || "C:\\Users\\henri\\Documents\\action-e2e-bug-poc\\dopa-before-93105f8",
    port: 4391,
  },
  {
    role: "fixed",
    commit: "93105f8",
    projectPath: process.env.E2P_POC_FIXED_PATH || "C:\\Users\\henri\\Documents\\action-e2e-bug-poc\\dopa-after-93105f8",
    port: 4392,
  },
];

async function main() {
  await fs.mkdir(evidenceRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  const observations = {};

  for (const revision of revisions) {
    process.stdout.write(`[${revision.role}] starting Dopa ${revision.commit}\n`);
    observations[revision.role] = await inspectRevision(revision);
    process.stdout.write(`[${revision.role}] oracle ${observations[revision.role].oracle.status}\n`);
  }

  const modelAssessment = await runBlindModelAssessment(observations.buggy).catch((error) => ({
    mode: "blind",
    model,
    hypotheses: [],
    reviews: [],
    error: sanitize(error.message),
  }));
  const blindOracleAssessment = await runBlindOracleAssessment(modelAssessment, observations.buggy).catch((error) => ({
    mode: "blind-hypothesis-to-oracle",
    model,
    plan: null,
    validation: { valid: false, steps: [], errors: [sanitize(error.message)] },
    error: sanitize(error.message),
  }));
  const issueInformedAssessment = blindOnly ? null : await runIssueInformedAssessment(observations.buggy).catch((error) => ({
    mode: "issue-informed",
    model,
    plan: null,
    validation: { valid: false, steps: [], errors: [sanitize(error.message)] },
    error: sanitize(error.message),
  }));
  const pair = classifyHistoricalBugPair({
    buggy: observations.buggy.oracle,
    fixed: observations.fixed.oracle,
  });

  const result = {
    experiment: "dopa-favorites-historical-bug",
    protocol: "historical-paired-multimodal-poc-v2",
    startedAt,
    completedAt: new Date().toISOString(),
    model,
    campaign: {
      objective: campaignObjective,
      visionEnabled,
      evidenceMode,
      blindOnly,
    },
    groundTruth: {
      fixCommit: "93105f8",
      parentCommit: "a0e881f",
      description: "The Favorites view must not recommend opening the Favorites view itself.",
      disclosureToBlindModel: false,
    },
    blindModelAssessment: {
      ...modelAssessment,
      matchedGroundTruth: matchesDopaFavoritesGroundTruth(modelAssessment.hypotheses),
    },
    blindOracleAssessment,
    issueInformedAssessment,
    pairedExecution: pair,
    revisions: observations,
    interpretation: buildInterpretation(pair, modelAssessment),
  };

  const modeName = safeName(evidenceMode);
  const outputPath = path.join(outputRoot, `dopa-favorites-blind-${modeName}-${campaignObjective}-${safeName(model)}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    outputPath,
    pairedClassification: pair.classification,
    confirmed: pair.confirmed,
    blindModelMatchedGroundTruth: result.blindModelAssessment.matchedGroundTruth,
    blindOraclePlanValid: result.blindOracleAssessment.validation?.valid || false,
    issueInformedPlanValid: result.issueInformedAssessment?.validation?.valid || false,
    blindHypotheses: result.blindModelAssessment.hypotheses.map((item) => item.title),
  }, null, 2)}\n`);
}

async function inspectRevision(revision) {
  const baseUrl = `http://127.0.0.1:${revision.port}`;
  const runtime = await startTargetRuntime({
    targetProjectPath: revision.projectPath,
    runtimeConfig: {
      mode: "command",
      workingDirectory: ".",
      startCommand: `node node_modules/vinext/dist/cli.js dev --host 127.0.0.1 --port ${revision.port}`,
      baseUrl,
    },
  });
  let browser;
  let context;
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(sanitize(message.text()));
    });
    page.on("pageerror", (error) => pageErrors.push(sanitize(error.message)));
    page.on("requestfailed", (request) => failedRequests.push({
      url: sanitize(request.url()),
      error: sanitize(request.failure()?.errorText || "request failed"),
    }));
    await openTargetWithRetry(page, runtime.baseUrl);
    await page.getByRole("button", { name: /^Abrir favoritos$/i }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => (
      button.textContent?.trim() === "Favoritos" && button.classList.contains("active")
    )), null, { timeout: 10000 });
    await page.waitForTimeout(500);

    const observation = await observePage(page);
    const selfReferentialCta = page.getByRole("button", { name: /Abrir meus favoritos/i });
    const ctaVisible = await selfReferentialCta.isVisible().catch(() => false);
    const screenshotPath = path.join(evidenceRoot, `${revision.role}-favorites.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
    const visualEvidence = await captureViewportTiles(page, revision.role);

    return {
      role: revision.role,
      commit: revision.commit,
      runtime: { mode: runtime.mode, baseUrl: runtime.baseUrl },
      action: "Clicked the top-level Favoritos control.",
      observation,
      oracle: {
        id: "favorites-view-does-not-link-to-itself",
        expected: "Abrir meus favoritos is absent while the Favorites view is active.",
        actual: ctaVisible
          ? "Abrir meus favoritos remained visible inside the Favorites view."
          : "Abrir meus favoritos was absent inside the Favorites view.",
        status: ctaVisible ? "failed" : "passed",
        passed: !ctaVisible,
      },
      diagnostics: {
        consoleErrors: consoleErrors.slice(0, 10),
        pageErrors: pageErrors.slice(0, 10),
        failedRequests: failedRequests.slice(0, 10),
      },
      evidence: path.relative(prototypeRoot, screenshotPath).split(path.sep).join("/"),
      visualEvidence,
    };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await runtime.stop().catch(() => {});
  }
}

async function openTargetWithRetry(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(1000 * attempt);
    }
  }
  throw lastError;
}

async function captureViewportTiles(page, role) {
  const dimensions = await page.evaluate(() => ({
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    viewportHeight: window.innerHeight,
  }));
  const maxScroll = Math.max(0, dimensions.height - dimensions.viewportHeight);
  const tileCount = Math.min(4, Math.max(1, Math.ceil(dimensions.height / dimensions.viewportHeight)));
  const positions = [...new Set(Array.from({ length: tileCount }, (_, index) => (
    tileCount === 1 ? 0 : Math.round((maxScroll * index) / (tileCount - 1))
  )))];
  const evidence = [];

  for (let index = 0; index < positions.length; index += 1) {
    await page.evaluate((position) => window.scrollTo(0, position), positions[index]);
    await page.waitForTimeout(120);
    const screenshotPath = path.join(evidenceRoot, `${role}-favorites-viewport-${index + 1}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled" });
    evidence.push(path.relative(prototypeRoot, screenshotPath).split(path.sep).join("/"));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return evidence;
}

async function observePage(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const label = (element) => (
      element.getAttribute("aria-label")
      || element.textContent
      || element.getAttribute("title")
      || ""
    ).replace(/\s+/g, " ").trim();
    const collect = (selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .map(label)
      .filter(Boolean)
      .slice(0, 40);

    return {
      path: window.location.pathname,
      title: document.title,
      headings: collect("h1, h2, h3"),
      buttons: collect("button, [role='button']"),
      links: collect("a[href]"),
      visibleTextExcerpt: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1800),
    };
  });
}

async function runBlindModelAssessment(buggyRevision) {
  const images = visionEnabled
    ? await Promise.all((buggyRevision.visualEvidence?.length
      ? buggyRevision.visualEvidence
      : [buggyRevision.evidence]
    ).map((relativePath) => fs.readFile(path.join(prototypeRoot, relativePath), "base64")))
    : [];
  const promptEvidence = {
    project: "Dopa, a fictional shopping showcase",
    previousAction: buggyRevision.action,
    ...(evidenceMode === "vision-only" ? {} : {
      resultingState: buggyRevision.observation,
      runtimeDiagnostics: buggyRevision.diagnostics,
    }),
  };
  const discovery = await requestStructuredJson({
    aiConfig,
    timeoutMs: 180000,
    systemPrompt: [
      "You are the bug-hunter role in an E2E quality pipeline.",
      "You are not given a bug report, a commit message, a fixed version, or a ground-truth defect.",
      evidenceMode === "vision-only"
        ? "Analyze the attached screenshot as the only interface-state evidence. Read its labels, active navigation, and calls to action visually."
        : visionEnabled
          ? "Use the attached screenshot as primary evidence and the structured interface state as grounding support."
        : "Analyze only the observed interaction and resulting structured interface state.",
      campaignObjective === "navigation-consistency"
        ? "This campaign focuses on consistency between the currently active view and the navigation or calls to action offered inside that view."
        : "Perform an open-ended functional QA review without assuming a particular defect category.",
      "Identify concrete functional or UX inconsistencies that a QA professional should investigate.",
      "Do not call missing optional content a bug. Do not invent controls or requirements.",
      "Each hypothesis must cite exact visible evidence and define a falsifiable browser oracle.",
      "Return raw JSON only: {\"hypotheses\":[{\"title\":\"...\",\"observedEvidence\":\"...\",\"expectedBehavior\":\"...\",\"risk\":\"...\",\"confidence\":\"high|medium|low\",\"oracle\":\"...\"}]}.",
      "Return at most three hypotheses.",
    ].join(" "),
    userPrompt: JSON.stringify(promptEvidence),
    images,
  });

  const hypotheses = normalizeHypotheses(discovery?.hypotheses);
  const review = await requestStructuredJson({
    aiConfig,
    timeoutMs: 180000,
    systemPrompt: [
      "You are the independent oracle-reviewer role in an E2E quality pipeline.",
      "Review proposed bug hypotheses against the supplied interface evidence only.",
      "Reject claims that lack observable support or a falsifiable expected behavior.",
      "Do not invent requirements and do not generate JavaScript.",
      "Return raw JSON only: {\"reviews\":[{\"title\":\"...\",\"decision\":\"accept|reject\",\"reason\":\"...\",\"suggestedOracle\":\"...\"}]}.",
    ].join(" "),
    userPrompt: JSON.stringify({ evidence: promptEvidence, hypotheses }),
    images,
  });

  return {
    mode: "blind",
    model,
    evidenceMode,
    objective: campaignObjective,
    hypotheses,
    reviews: Array.isArray(review?.reviews) ? review.reviews.slice(0, 3) : [],
  };
}

async function runBlindOracleAssessment(modelAssessment, buggyRevision) {
  const hypothesis = (modelAssessment.hypotheses || []).find((candidate) => (
    matchesDopaFavoritesGroundTruth([candidate])
  ));
  if (!hypothesis) {
    return {
      mode: "blind-hypothesis-to-oracle",
      model,
      skipped: true,
      reason: "No blind hypothesis matched the withheld historical defect.",
      plan: null,
      validation: { valid: false, steps: [], errors: ["No matching blind hypothesis was available."] },
    };
  }

  const response = await requestStructuredJson({
    aiConfig,
    timeoutMs: 180000,
    systemPrompt: [
      "You are the oracle-author role in a blind E2E bug-discovery campaign.",
      "Convert only the supplied model-authored hypothesis into a minimal browser plan.",
      "You are not given a bug report, source diff, fixed revision, or hidden ground truth.",
      "The plan starts from the home view and must avoid changing server data.",
      "Use only exact accessible button names present in the supplied interface evidence.",
      "Allowed actions are click and assert-absent. Do not generate JavaScript or selectors.",
      "Return raw JSON only with title and steps. Each step contains action, role, and name.",
    ].join(" "),
    userPrompt: JSON.stringify({
      hypothesis,
      availableButtons: buggyRevision.observation.buttons,
      observedJourney: [{ action: "click", role: "button", name: "Abrir favoritos" }],
    }),
  });
  const compiledPlan = compileObservedJourneyWithOracle(
    [{ action: "click", role: "button", name: "Abrir favoritos" }],
    response,
  );
  const validation = validateDopaFavoritesOraclePlan(compiledPlan);
  return {
    mode: "blind-hypothesis-to-oracle",
    model,
    skipped: false,
    hypothesis,
    plan: response,
    compiledPlan,
    validation,
    repairUsed: false,
    pairedExecutionCompatible: validation.valid,
  };
}

async function runIssueInformedAssessment(buggyRevision) {
  const issue = "When the user is already viewing Favorites, the interface must not recommend opening Favorites again.";
  const systemPrompt = [
    "You are the issue-reproduction test-author role in an E2E quality pipeline.",
    "Translate the supplied issue and grounded interface evidence into a minimal structured browser plan.",
    "Use only exact accessible button names copied from the supplied evidence; never copy schema placeholders.",
    "The plan starts from the home view and must reproduce the issue without changing server data.",
    "Allowed actions are click and assert-absent. Do not generate JavaScript or selectors.",
    "Return raw JSON only with title and steps. Each step contains action, role, and name.",
  ].join(" ");
  const evidence = {
    issue,
    observedAction: buggyRevision.action,
    resultingState: buggyRevision.observation,
  };
  const attempts = [];
  let response = await requestStructuredJson({
    aiConfig,
    timeoutMs: 180000,
    systemPrompt,
    userPrompt: JSON.stringify(evidence),
  });
  let validation = validateDopaFavoritesOraclePlan(response);
  attempts.push({ response, validation });

  if (!validation.valid) {
    response = await requestStructuredJson({
      aiConfig,
      timeoutMs: 180000,
      systemPrompt: `${systemPrompt} Correct the previous plan once. Return only the corrected complete JSON plan.`,
      userPrompt: JSON.stringify({
        ...evidence,
        previousPlan: response,
        validationErrors: validation.errors,
      }),
    });
    validation = validateDopaFavoritesOraclePlan(response);
    attempts.push({ response, validation });
  }
  return {
    mode: "issue-informed",
    model,
    issue,
    plan: response,
    validation,
    repairUsed: attempts.length > 1,
    attempts,
    pairedExecutionCompatible: validation.valid,
  };
}

function normalizeHypotheses(value) {
  return (Array.isArray(value) ? value : []).slice(0, 3).map((item) => ({
    title: sanitize(item?.title),
    observedEvidence: sanitize(item?.observedEvidence),
    expectedBehavior: sanitize(item?.expectedBehavior),
    risk: sanitize(item?.risk),
    confidence: ["high", "medium", "low"].includes(item?.confidence) ? item.confidence : "low",
    oracle: sanitize(item?.oracle),
  })).filter((item) => item.title && item.observedEvidence && item.oracle);
}

function buildInterpretation(pair, modelAssessment) {
  const blindMatch = matchesDopaFavoritesGroundTruth(modelAssessment.hypotheses);
  if (pair.confirmed && blindMatch) {
    return "The paired oracle reproduced the historical bug, and the blind model independently proposed the same defect from interface evidence.";
  }
  if (pair.confirmed) {
    return "The paired oracle reproduced the historical bug, but the blind model did not independently identify the ground-truth defect in this run.";
  }
  return "The historical pair did not produce the expected fail-before/pass-after signature, so the POC is inconclusive.";
}

function sanitize(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

function safeName(value) {
  return String(value || "model").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
