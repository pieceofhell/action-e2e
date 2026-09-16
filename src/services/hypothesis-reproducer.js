const fs = require("node:fs/promises");
const path = require("node:path");

async function reproduceHypotheses({
  browser,
  baseUrl,
  exploration,
  hypotheses,
  observeCurrentPage,
  evidenceDirectory = "",
  artifactBaseUrl = "",
  onProgress = () => {},
}) {
  const output = [];
  for (const [index, hypothesis] of (hypotheses || []).entries()) {
    onProgress({
      phase: "hypothesis-reproduction",
      message: `Replaying potential defect observation ${index + 1} of ${hypotheses.length} in a clean browser session...`,
      progress: 96 + Math.round(((index + 1) / Math.max(hypotheses.length, 1)) * 2),
    });
    output.push({
      ...hypothesis,
      reproduction: await reproduceOne({
        browser,
        baseUrl,
        exploration,
        hypothesis,
        observeCurrentPage,
        evidenceDirectory,
        artifactBaseUrl,
      }),
    });
  }
  return output;
}

async function reproduceOne({ browser, baseUrl, exploration, hypothesis, observeCurrentPage, evidenceDirectory, artifactBaseUrl }) {
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1180, height: 760 } });
  const page = await context.newPage();
  const replayDiagnostics = [];
  page.on("pageerror", (error) => replayDiagnostics.push(String(error?.message || error)));
  page.on("console", (message) => {
    if (message.type() === "error") replayDiagnostics.push(message.text());
  });
  const targetState = selectTargetState(exploration?.states || [], hypothesis.evidenceStateIds || []);
  const runtimeDiagnostic = hypothesis.expected?.source === "runtime-diagnostic";
  const targetStepIndex = runtimeDiagnostic
    ? (exploration?.steps || []).findLastIndex((step) => step.status === "completed")
    : (exploration?.steps || []).findLastIndex((step) => (
      step.status === "completed" && step.afterFingerprint === targetState?.fingerprint
    ));
  const journey = targetStepIndex >= 0
    ? exploration.steps.slice(0, targetStepIndex + 1).filter((step) => step.status === "completed")
    : [];
  let currentPage = page;
  try {
    if (!targetState) throw new Error("No cited evidence state is available for replay.");
    await currentPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await currentPage.waitForTimeout(500);
    for (const step of journey) {
      const observation = await observeCurrentPage(currentPage);
      const candidate = findReplayAction(observation.actions || [], step.action || {});
      if (!candidate) throw new Error(`The observed control is no longer available: ${step.action?.name || step.action?.kind}.`);
      currentPage = await executeReplayAction(currentPage, candidate, step.action || {});
      await currentPage.waitForTimeout(500);
    }
    const replayedObservation = await observeCurrentPage(currentPage);
    const similarity = stateSimilarity(targetState, replayedObservation);
    const screenshot = await saveScreenshot({
      page: currentPage,
      hypothesisId: hypothesis.id,
      evidenceDirectory,
      artifactBaseUrl,
    });
    if (hypothesis.expected?.source === "runtime-diagnostic") {
      const expectedMessages = [
        ...(hypothesis.evidence?.consoleErrors || []),
        ...(hypothesis.evidence?.pageErrors || []),
      ].map((item) => item?.message || item).filter(Boolean);
      const diagnosticMatched = expectedMessages.some((expected) => replayDiagnostics.some((actual) => (
        diagnosticSimilarity(expected, actual) >= 0.55
      )));
      return {
        status: diagnosticMatched ? "runtime-diagnostic-reproduced" : "runtime-diagnostic-not-reproduced",
        independentSession: true,
        replayedActions: journey.length,
        stateSimilarity: similarity,
        citedStateId: targetState.id,
        replayDiagnostics: replayDiagnostics.slice(0, 12),
        screenshot,
        interpretation: diagnosticMatched
          ? "The same runtime diagnostic signature was captured in an independent browser session."
          : "The cited runtime diagnostic did not recur in the independent browser session.",
      };
    }
    return {
      status: similarity >= 0.72 ? "observation-reproduced" : "observation-diverged",
      independentSession: true,
      replayedActions: journey.length,
      stateSimilarity: similarity,
      citedStateId: targetState.id,
      screenshot,
      interpretation: similarity >= 0.72
        ? "The cited interface state was reached again in a clean session. This reproduces the observation, not the inferred requirement."
        : "The clean replay reached a materially different interface state; human review is required before treating the hypothesis as reproducible.",
    };
  } catch (error) {
    return {
      status: "reproduction-blocked",
      independentSession: true,
      replayedActions: 0,
      stateSimilarity: 0,
      citedStateId: targetState?.id || "",
      screenshot: null,
      interpretation: `Independent replay could not complete: ${sanitizeText(error.message, 500)}`,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

function gateReproducedHypotheses(hypotheses = []) {
  const retained = [];
  const rejected = [];
  for (const hypothesis of hypotheses) {
    const status = hypothesis.reproduction?.status;
    const accepted = status === "observation-reproduced" || status === "runtime-diagnostic-reproduced";
    if (accepted) {
      retained.push(hypothesis);
      continue;
    }
    rejected.push({
      id: hypothesis.id,
      title: hypothesis.title,
      reason: status === "observation-diverged"
        ? "Independent replay reached a materially different state; the hypothesis was not retained."
        : status === "runtime-diagnostic-not-reproduced"
          ? "The runtime diagnostic did not recur in an independent session; the hypothesis was not retained."
          : "Independent replay was blocked; the hypothesis was not retained.",
      verdict: "reject",
      screeningStage: "independent-reproduction",
      authorConfidence: hypothesis.confidence,
      authorSeverity: hypothesis.severity,
      reproduction: hypothesis.reproduction,
    });
  }
  return { retained, rejected };
}

function selectTargetState(states, evidenceStateIds) {
  const requested = new Set(evidenceStateIds || []);
  return (states || []).filter((state) => requested.has(state.id)).at(-1) || null;
}

function findReplayAction(actions, recorded) {
  const sameKind = (actions || []).filter((action) => action.kind === recorded.kind);
  const exactStable = sameKind.find((action) => (
    recorded.testId && action.testId === recorded.testId
  ) || (
    recorded.domId && action.domId === recorded.domId
  ) || (
    recorded.tagName && Number.isInteger(recorded.tagIndex) && action.tagName === recorded.tagName && action.tagIndex === recorded.tagIndex
  ));
  if (exactStable) return exactStable;
  return sameKind.find((action) => (
    normalize(action.accessibleName || action.name) === normalize(recorded.accessibleName || recorded.name)
      && normalize(action.context) === normalize(recorded.context)
  )) || null;
}

async function executeReplayAction(page, candidate, recorded) {
  const locator = page.locator(`[data-e2p-action-id="${candidate.locatorId || candidate.id}"]`).first();
  await locator.waitFor({ state: "visible", timeout: 7000 });
  if (recorded.kind === "fill") await locator.fill(recorded.value || "");
  else if (recorded.kind === "press") await locator.press("Enter");
  else if (recorded.kind === "select") {
    const option = (candidate.options || []).find((item) => item.value === recorded.value || item.label === recorded.value);
    if (!option) throw new Error(`The observed option is no longer available for ${recorded.name}.`);
    await locator.selectOption({ value: option.value });
  } else {
    const pagesBefore = new Set(page.context().pages());
    await locator.click({ timeout: 7000 });
    const popup = page.context().pages().find((item) => !pagesBefore.has(item));
    if (popup) {
      await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      return popup;
    }
  }
  return page;
}

function stateSimilarity(expected, observed) {
  const scores = [];
  scores.push(normalize(expected.path) === normalize(observed.path) ? 1 : 0);
  scores.push(setOverlap(expected.headings, observed.headings));
  scores.push(setOverlap(expected.buttons, (observed.buttons || []).map((item) => item.ariaLabel || item.text || item.id || item)));
  scores.push(tokenOverlap(expected.visibleTextExcerpt, observed.visibleTextExcerpt));
  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2));
}

function setOverlap(left = [], right = []) {
  const a = new Set(left.map(normalize).filter(Boolean));
  const b = new Set(right.map(normalize).filter(Boolean));
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  return [...a].filter((item) => b.has(item)).length / Math.max(a.size, b.size);
}

function tokenOverlap(left, right) {
  const a = new Set(normalize(left).split(/[^a-z0-9]+/).filter((item) => item.length > 3));
  const b = new Set(normalize(right).split(/[^a-z0-9]+/).filter((item) => item.length > 3));
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  return [...a].filter((item) => b.has(item)).length / Math.max(a.size, b.size);
}

function diagnosticSimilarity(left, right) {
  return tokenOverlap(
    String(left || "").replace(/https?:\/\/\S+|\b\d+(?::\d+)?\b/g, " "),
    String(right || "").replace(/https?:\/\/\S+|\b\d+(?::\d+)?\b/g, " "),
  );
}

async function saveScreenshot({ page, hypothesisId, evidenceDirectory, artifactBaseUrl }) {
  if (!evidenceDirectory) return null;
  const directory = path.join(evidenceDirectory, "reproduction");
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${String(hypothesisId || "hypothesis").replace(/[^a-z0-9_-]+/gi, "-")}.png`;
  await page.screenshot({ path: path.join(directory, fileName), fullPage: true });
  return {
    fileName: `reproduction/${fileName}`,
    artifactUrl: artifactBaseUrl ? `${artifactBaseUrl}/reproduction/${fileName}` : "",
  };
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sanitizeText(value, limit = 500) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

module.exports = {
  findReplayAction,
  gateReproducedHypotheses,
  reproduceHypotheses,
  stateSimilarity,
};
