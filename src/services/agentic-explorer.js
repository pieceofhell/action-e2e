const crypto = require("crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { normalizeAiConfig, requestStructuredJson } = require("./llm-provider");

const BLOCKED_ACTION_PATTERN = /\b(checkout|finalizar|finalize|confirm(?:ar| order)?|place order|pay|payment|purchase|buy now|comprar agora|submit|save|salvar|publish|publicar|send|enviar|upload|delete|deletar|destroy|clear cart|empty cart|limpar carrinho|esvaziar carrinho|remove account|sign out|log out|logout)\b/i;
const COVERAGE_RULES = [
  { id: "product-details", pattern: /product|produto|details|detalhes|description|descri[cç][aã]o/i },
  { id: "search-filter", pattern: /search|buscar|pesquis|filter|filtro|category|categoria/i },
  { id: "favorites", pattern: /favorite|favourite|wishlist|favorit|desejos/i },
  { id: "cart", pattern: /cart|carrinho|basket|sacola|add to cart|adicionar/i },
  { id: "navigation", pattern: /menu|home|in[ií]cio|back|voltar|next|pr[oó]xim/i },
];

async function runAgenticExploration({
  page,
  initialObservation,
  aiConfig,
  observeCurrentPage,
  onProgress = () => {},
  maxSteps = 20,
  maxDurationMs = 180000,
  maxDecisionRepairs = 1,
  allowVisualPreview = true,
  evidenceDirectory = "",
  artifactBaseUrl = "",
  visionEnabled = false,
}) {
  const normalized = normalizeAiConfig(aiConfig);
  if (!normalized.enabled) {
    return buildBaselineResult(initialObservation);
  }

  const startedAt = Date.now();
  const states = [toStateEvidence(initialObservation, 0)];
  let currentVisual = await captureStateVisualEvidence({
    page,
    stateId: states[0].id,
    evidenceDirectory,
    artifactBaseUrl,
    allowVisualPreview,
    visionEnabled,
  });
  states[0].visualEvidence = currentVisual.evidence;
  const steps = [];
  const usedActionKeys = new Set();
  let current = initialObservation;
  let activePage = page;
  let invalidDecisions = 0;
  let terminationReason = "action-limit";
  let fatalError = "";
  let adaptiveBudget = estimateAdaptiveExplorationBudget({
    current,
    states,
    hardMaxSteps: maxSteps,
    hardMaxDurationMs: maxDurationMs,
  });

  for (let attempt = 0; attempt < maxSteps + 4; attempt += 1) {
    adaptiveBudget = estimateAdaptiveExplorationBudget({
      current,
      states,
      hardMaxSteps: maxSteps,
      hardMaxDurationMs: maxDurationMs,
    });
    if (Date.now() - startedAt >= adaptiveBudget.durationMs) {
      terminationReason = "time-budget";
      break;
    }
    const completedCount = steps.filter((step) => step.status === "completed").length;
    if (completedCount >= adaptiveBudget.stepLimit) {
      terminationReason = "adaptive-action-budget";
      break;
    }
    const safeActions = (current.actions || [])
      .filter((action) => action.safe)
      .filter((action) => !current.dialogsCount || action.inOverlay)
      .filter((action) => !usedActionKeys.has(actionSemanticKey(action)))
      .slice(0, 30);

    if (!safeActions.length) {
      terminationReason = "safe-actions-exhausted";
      break;
    }

    onProgress({
      phase: "model-guided-exploration",
      message: `The selected model is choosing safe interface action ${completedCount + 1}; the current adaptive budget is ${adaptiveBudget.stepLimit}...`,
      progress: 66 + Math.round((completedCount / adaptiveBudget.stepLimit) * 18),
      detail: await createExplorationDetail({
        page: activePage,
        observation: current,
        step: completedCount + 1,
        maxSteps: adaptiveBudget.stepLimit,
        status: "thinking",
        allowVisualPreview,
        providedScreenshotDataUrl: currentVisual.previewDataUrl,
      }),
    });

    let decision;
    let rawDecision;
    try {
      let validationFeedback = "";
      for (let repairAttempt = 0; repairAttempt <= maxDecisionRepairs; repairAttempt += 1) {
        rawDecision = await requestExplorationDecision({
          aiConfig: normalized,
          current,
          states,
          steps,
          safeActions,
          remainingSteps: adaptiveBudget.stepLimit - completedCount,
          validationFeedback,
          images: visionEnabled ? currentVisual.images : [],
        });
        try {
          decision = validateAgentDecision(rawDecision, safeActions);
          break;
        } catch (error) {
          if (repairAttempt >= maxDecisionRepairs) throw error;
          validationFeedback = error.message;
          onProgress({
            phase: "model-decision-repair",
            message: `The model returned an invalid decision. Asking it to correct the same choice once: ${error.message}`,
            progress: 66 + Math.round((completedCount / adaptiveBudget.stepLimit) * 18),
          });
        }
      }
      const minimumUsefulActions = Math.min(2, countUniqueSafeActions(states, current));
      if (decision.action === "finish" && completedCount < minimumUsefulActions) {
        throw new Error("The model ended exploration before exercising the minimum safe interface coverage.");
      }
    } catch (error) {
      invalidDecisions += 1;
      steps.push({
        step: attempt + 1,
        status: "invalid-model-decision",
        proposedAction: sanitizeText(rawDecision?.decision || rawDecision?.action),
        proposedActionId: sanitizeText(rawDecision?.actionId),
        error: error.message,
      });
      fatalError = `Model-guided exploration failed at decision ${attempt + 1}: ${error.message}`;
      terminationReason = "invalid-model-decision";
      break;
    }

    if (decision.action === "finish") {
      steps.push({
        step: attempt + 1,
        status: "model-finished",
        rationale: decision.rationale,
      });
      terminationReason = "model-finished";
      break;
    }

    const selectedAction = safeActions.find((action) => action.id === decision.actionId);
    const beforeFingerprint = fingerprintObservation(current);
    const beforeState = states.find((state) => state.fingerprint === beforeFingerprint) || states.at(-1);
    usedActionKeys.add(actionSemanticKey(selectedAction));

    try {
      activePage = await executeDecision(activePage, decision, selectedAction);
      await activePage.waitForTimeout(700);
      const next = await observeCurrentPage(activePage);
      const afterFingerprint = fingerprintObservation(next);
      const changed = beforeFingerprint !== afterFingerprint;

      let afterState = states.find((state) => state.fingerprint === afterFingerprint);
      if (!afterState) {
        afterState = toStateEvidence(next, states.length);
        states.push(afterState);
      }
      const nextVisual = await captureStateVisualEvidence({
        page: activePage,
        stateId: afterState.id,
        evidenceDirectory,
        artifactBaseUrl,
        allowVisualPreview,
        visionEnabled,
      });
      if (!afterState.visualEvidence?.length) {
        afterState.visualEvidence = nextVisual.evidence;
      }

      const evidence = {
        step: attempt + 1,
        status: "completed",
        action: {
          kind: decision.action,
          name: selectedAction.name,
          accessibleName: selectedAction.accessibleName || selectedAction.name,
          context: selectedAction.context || "",
          role: selectedAction.role,
          tagName: selectedAction.tagName || "",
          nameAttribute: selectedAction.nameAttribute || "",
          tagIndex: Number.isInteger(selectedAction.tagIndex) ? selectedAction.tagIndex : -1,
          value: ["fill", "select"].includes(decision.action) ? String(decision.value || "").slice(0, 64) : "",
          label: selectedAction.label || "",
          placeholder: selectedAction.placeholder || "",
          options: selectedAction.options || [],
          targetBlank: Boolean(selectedAction.targetBlank),
          testId: selectedAction.testId || "",
          domId: selectedAction.domId || "",
          visualSelector: selectedAction.visualSelector || "",
          visualIndex: Number.isInteger(selectedAction.visualIndex) ? selectedAction.visualIndex : -1,
          accessibleIndex: Number.isInteger(selectedAction.accessibleIndex) ? selectedAction.accessibleIndex : -1,
          accessibleCount: Number.isInteger(selectedAction.accessibleCount) ? selectedAction.accessibleCount : 0,
          minLength: Number.isInteger(selectedAction.minLength) ? selectedAction.minLength : -1,
          boundaryProbe: Boolean(selectedAction.boundaryProbe),
        },
        rationale: decision.rationale,
        expectedOutcome: decision.expectedOutcome,
        protocolCorrection: decision.protocolCorrection || "",
        beforeFingerprint,
        afterFingerprint,
        beforeStateId: beforeState?.id || "",
        afterStateId: afterState.id,
        changed,
        observedAfter: summarizeState(next),
      };
      steps.push(evidence);
      current = next;
      currentVisual = nextVisual;

      onProgress({
        phase: "model-guided-exploration",
        message: `${selectedAction.name} was executed; the model is reviewing the resulting interface state.`,
        progress: 66 + Math.round(((completedCount + 1) / adaptiveBudget.stepLimit) * 18),
        detail: await createExplorationDetail({
          page: activePage,
          observation: next,
          step: completedCount + 1,
          maxSteps: adaptiveBudget.stepLimit,
          status: "observed",
          selectedAction,
          decision,
          changed,
          allowVisualPreview,
          providedScreenshotDataUrl: currentVisual.previewDataUrl,
        }),
      });

    } catch (error) {
      if (error.code === "E2P_ACTION_UNAVAILABLE") {
        const refreshed = await observeCurrentPage(activePage);
        const refreshedFingerprint = fingerprintObservation(refreshed);
        let refreshedState = states.find((state) => state.fingerprint === refreshedFingerprint);
        if (!refreshedState) {
          refreshedState = toStateEvidence(refreshed, states.length);
          states.push(refreshedState);
        }
        const refreshedVisual = await captureStateVisualEvidence({
          page: activePage,
          stateId: refreshedState.id,
          evidenceDirectory,
          artifactBaseUrl,
          allowVisualPreview,
          visionEnabled,
        });
        if (!refreshedState.visualEvidence?.length) refreshedState.visualEvidence = refreshedVisual.evidence;
        steps.push({
          step: attempt + 1,
          status: "action-unavailable",
          action: { kind: decision.action, name: selectedAction.name, role: selectedAction.role },
          rationale: decision.rationale,
          beforeStateId: beforeState?.id || "",
          afterStateId: refreshedState.id,
          error: error.message,
        });
        current = refreshed;
        currentVisual = refreshedVisual;
        onProgress({
          phase: "model-guided-exploration",
          message: `${selectedAction.name} changed availability before execution. The interface catalog was refreshed for the model.`,
          progress: 66 + Math.round((completedCount / adaptiveBudget.stepLimit) * 18),
        });
        continue;
      }
      steps.push({
        step: attempt + 1,
        status: "execution-failed",
        action: {
          kind: decision.action,
          name: selectedAction.name,
          role: selectedAction.role,
        },
        rationale: decision.rationale,
        error: error.message,
      });
      fatalError = `Model-guided exploration failed while executing "${selectedAction.name}": ${error.message}`;
      terminationReason = "action-execution-failed";
      break;
    }
  }

  const completedSteps = steps.filter((step) => step.status === "completed");
  const coverageAreas = inferCoverageAreas([], completedSteps);
  const observedOpportunities = inferCoverageAreas(states, []);

  return {
    strategy: "model-guided-stateful",
    usedModel: true,
    model: normalized.model,
    provider: normalized.provider,
    status: fatalError ? "failed" : (completedSteps.length ? "completed" : "inconclusive"),
    error: fatalError,
    terminationReason,
    steps,
    states,
    metrics: {
      adaptiveStepLimit: adaptiveBudget.stepLimit,
      adaptiveDurationMs: adaptiveBudget.durationMs,
      hardStepLimit: maxSteps,
      hardDurationMs: maxDurationMs,
      completedActions: completedSteps.length,
      changedStates: completedSteps.filter((step) => step.changed).length,
      uniqueStates: states.length,
      invalidDecisions,
      failedActions: steps.filter((step) => step.status === "execution-failed").length,
      coverageAreas,
      observedOpportunities,
      durationMs: Date.now() - startedAt,
    },
  };
}

async function createExplorationDetail({
  page,
  observation,
  step,
  maxSteps,
  status,
  selectedAction = null,
  decision = null,
  changed = null,
  allowVisualPreview,
  providedScreenshotDataUrl = null,
}) {
  let screenshotDataUrl = providedScreenshotDataUrl || "";
  if (allowVisualPreview && providedScreenshotDataUrl === null) {
    try {
      const screenshot = await page.screenshot({
        type: "jpeg",
        quality: 48,
        animations: "disabled",
        caret: "hide",
      });
      if (screenshot.length <= 600000) {
        screenshotDataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
      }
    } catch {
      screenshotDataUrl = "";
    }
  }

  return {
    type: "exploration",
    status,
    step,
    maxSteps,
    visualPreviewAllowed: Boolean(allowVisualPreview),
    screenshotDataUrl,
    action: selectedAction ? {
      id: selectedAction.id,
      kind: selectedAction.kind,
      name: selectedAction.name,
      value: allowVisualPreview && ["fill", "select"].includes(selectedAction.kind)
        ? String(decision?.value || "").slice(0, 64)
        : "",
      rationale: decision?.rationale || "",
      expectedOutcome: decision?.expectedOutcome || "",
      protocolCorrection: decision?.protocolCorrection || "",
      changed,
    } : null,
    state: {
      path: observation?.path || "/",
      title: observation?.title || "",
      headings: observation?.headings || [],
      buttons: observation?.buttons || [],
      inputs: observation?.inputs || [],
      visibleTextExcerpt: allowVisualPreview ? String(observation?.visibleTextExcerpt || "").slice(0, 320) : "",
    },
  };
}

async function requestExplorationDecision({
  aiConfig,
  current,
  states,
  steps,
  safeActions,
  remainingSteps,
  validationFeedback = "",
  images = [],
}) {
  return requestStructuredJson({
    aiConfig,
    systemPrompt: [
      "You are a QA exploration agent controlling a browser through a constrained action protocol.",
      "Your purpose is to discover meaningful, evidence-grounded E2E scenarios rather than only smoke-test the landing page.",
      images.length
        ? "Viewport screenshots of the current state are attached. Use them together with the structured control catalog; still select only a supplied actionId."
        : "No screenshot is attached. Base the decision only on the structured browser state and supplied action catalog.",
      "Select exactly one actionId from the supplied safeActions, or finish only after at least three useful actions when further actions would add no coverage.",
      "Do not choose or repeat the action kind. E2P derives click, fill, select, or press from the selected actionId and executes it through the safe browser adapter.",
      "Prefer breadth across product or item details, search and filtering, favorites or wishlists, cart-like ephemeral state, dialogs, and navigation when those capabilities are visible.",
      "Do not repeat a user intent already covered. Prefer controls likely to reveal a new state.",
      "Never attempt checkout, payment, final submission, account changes, publishing, uploads, deletion, or external navigation.",
      "For fill actions, use a short value grounded in the visible purpose of the field. Do not enter personal data, credentials, scripts, or secrets.",
      "Apply ordinary QA boundary probing: when a text field visibly creates, searches, or filters items and declares no minimum length, prefer one ordinary character on its first use. State the expected visible outcome so the next evidence can confirm or contradict it.",
      "For a text input, choose its fill action before its press action; use press only after the completed actions show that the same input was filled.",
      "For select controls, choose one supplied option value that differs from the current value.",
      "Return raw JSON only: {\"decision\":\"act|finish\",\"actionId\":\"...\",\"value\":\"\",\"rationale\":\"...\",\"expectedOutcome\":\"...\"}.",
    ].join(" "),
    userPrompt: JSON.stringify({
      remainingSteps,
      validationFeedback: validationFeedback || undefined,
      currentState: summarizeStateForDecision(current),
      discoveredStates: states.slice(-8).map((state) => ({
        id: state.id,
        path: state.path,
        headings: state.headings,
        dialogsCount: state.dialogsCount,
        visibleTextExcerpt: String(state.visibleTextExcerpt || "").slice(0, 180),
      })),
      completedActions: steps
        .filter((step) => step.status === "completed")
        .slice(-12)
        .map((step) => ({ action: step.action, changed: step.changed })),
      rejectedDecisions: steps
        .filter((step) => step.status === "invalid-model-decision")
        .map((step) => ({ action: step.proposedAction, actionId: step.proposedActionId, reason: step.error })),
      safeActions: safeActions.map((action) => ({
        id: action.id,
        kind: action.kind,
        role: action.role,
        name: action.name,
        context: action.context || "",
        inputType: action.inputType,
        minLength: action.minLength,
        boundaryProbe: Boolean(action.boundaryProbe),
        options: action.options,
        inOverlay: Boolean(action.inOverlay),
      })),
    }),
    images,
    timeoutMs: 120000,
  });
}

async function captureStateVisualEvidence({
  page,
  stateId,
  evidenceDirectory,
  artifactBaseUrl,
  allowVisualPreview,
  visionEnabled,
}) {
  if (!allowVisualPreview) {
    return { evidence: [], images: [], previewDataUrl: "" };
  }

  const evidence = [];
  const images = [];
  let previewDataUrl = "";
  let originalScrollY = 0;

  try {
    const viewport = await page.evaluate(() => ({
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      documentHeight: Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0
      ),
    }));
    originalScrollY = viewport.scrollY;
    const maximumScroll = Math.max(0, viewport.documentHeight - viewport.viewportHeight);
    const positions = [...new Set([
      0,
      Math.round(maximumScroll / 3),
      Math.round((maximumScroll * 2) / 3),
      maximumScroll,
    ])].slice(0, 4);

    if (evidenceDirectory) {
      await fs.mkdir(evidenceDirectory, { recursive: true });
    }

    for (const [index, scrollY] of positions.entries()) {
      await page.evaluate((targetY) => window.scrollTo(0, targetY), scrollY);
      await page.waitForTimeout(80);
      const screenshot = await page.screenshot({
        type: "jpeg",
        quality: 58,
        animations: "disabled",
        caret: "hide",
      });
      const fileName = `${stateId}-viewport-${index + 1}.jpg`;

      if (evidenceDirectory) {
        await fs.writeFile(path.join(evidenceDirectory, fileName), screenshot);
        evidence.push({
          kind: "screenshot",
          fileName,
          artifactUrl: artifactBaseUrl
            ? `${artifactBaseUrl}/${encodeURIComponent(fileName)}`
            : "",
          viewportIndex: index + 1,
          scrollY,
        });
      }
      // One current viewport keeps local VLM requests within modest context windows.
      // Additional tiles remain persisted as human-review evidence.
      if (visionEnabled && images.length < 1) {
        images.push(screenshot.toString("base64"));
      }
      if (!previewDataUrl && screenshot.length <= 600000) {
        previewDataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
      }
    }
  } catch {
    return { evidence, images, previewDataUrl };
  } finally {
    await page.evaluate((targetY) => window.scrollTo(0, targetY), originalScrollY).catch(() => {});
  }

  return { evidence, images, previewDataUrl };
}

function summarizeStateForDecision(observation) {
  const state = summarizeState(observation);
  delete state.actions;
  return state;
}

function validateAgentDecision(rawDecision, safeActions) {
  const requestedDecision = String(rawDecision?.decision || rawDecision?.action || "").trim().toLowerCase();
  const actionId = String(rawDecision?.actionId || "").trim();
  const selected = safeActions.find((candidate) => candidate.id === actionId);

  // A grounded catalog identifier is authoritative; model-invented verbs never
  // override the safe operation E2P observed for that control.
  if (selected) {
    return validateSelectedAction(rawDecision, selected, requestedDecision, actionId);
  }

  if (!actionId && ["finish", "stop", "done", "complete", "completed"].includes(requestedDecision)) {
    return {
      action: "finish",
      actionId: "",
      value: "",
      rationale: sanitizeText(rawDecision.rationale) || "The model found no additional safe high-value action.",
      expectedOutcome: sanitizeText(rawDecision.expectedOutcome),
    };
  }

  if (actionId) {
    throw new Error("The model selected an action that was not present in the current safe action set.");
  }
  if (requestedDecision && !["act", "click", "fill", "select", "press"].includes(requestedDecision)) {
    throw new Error("The model returned an unsupported exploration action.");
  }
  throw new Error("The model did not select an actionId from the current safe action set.");
}

function validateSelectedAction(rawDecision, selected, requestedDecision, actionId) {
  const action = selected.kind;

  const value = sanitizeText(rawDecision?.value).slice(0, 64);
  if ((action === "fill" || action === "select") && !value) {
    throw new Error(`The model selected a ${action} action without a safe value.`);
  }
  if (action === "fill" && selected.boundaryProbe && [...value].length !== 1) {
    throw new Error("This field is marked for a general single-character boundary probe. Select the same actionId with exactly one ordinary character.");
  }
  if (action === "select" && !selected.options?.some((option) => option.value === value || option.label === value)) {
    throw new Error("The model selected an option that was not exposed by the current select control.");
  }

  if (BLOCKED_ACTION_PATTERN.test(`${selected.name} ${value}`)) {
    throw new Error("The model selected an action blocked by the exploration safety policy.");
  }

  return {
    action,
    actionId,
    value,
    protocolCorrection: requestedDecision && requestedDecision !== "act" && requestedDecision !== action
      ? `Ignored legacy kind ${requestedDecision}; executed the catalog kind ${action}.`
      : "",
    rationale: sanitizeText(rawDecision.rationale),
    expectedOutcome: sanitizeText(rawDecision.expectedOutcome),
  };
}

function estimateAdaptiveExplorationBudget({ current, states = [], hardMaxSteps = 20, hardMaxDurationMs = 180000 }) {
  const safeActionCount = countUniqueSafeActions(states, current);
  const discoveredStateCount = Math.max(1, states.length);
  const stateExpansionAllowance = Math.min(6, Math.max(0, discoveredStateCount - 1) * 2);
  const evidenceDrivenTarget = Math.ceil(safeActionCount * 0.75) + stateExpansionAllowance + 1;
  const stepLimit = Math.max(1, Math.min(hardMaxSteps, Math.max(2, evidenceDrivenTarget)));
  const durationMs = Math.max(45000, Math.min(hardMaxDurationMs, 30000 + (stepLimit * 7500)));
  return { stepLimit, durationMs, safeActionCount, discoveredStateCount };
}

function countUniqueSafeActions(states, current) {
  const actions = [
    ...(states || []).flatMap((state) => state.actions || []),
    ...(current?.actions || []),
  ].filter((action) => action.safe);
  return new Set(actions.map(actionSemanticKey)).size;
}

async function executeDecision(page, decision, selectedAction) {
  const locator = page.locator(`[data-e2p-action-id="${selectedAction.locatorId || selectedAction.id}"]`).first();
  try {
    await locator.waitFor({ state: "visible", timeout: 5000 });
    if (!await locator.isEnabled()) throw new Error("The observed control is disabled.");
  } catch (error) {
    const unavailable = new Error("The selected control became unavailable after the last interface observation.");
    unavailable.code = "E2P_ACTION_UNAVAILABLE";
    throw unavailable;
  }

  if (decision.action === "fill") {
    await locator.fill(decision.value);
    return page;
  }

  if (decision.action === "select") {
    const option = selectedAction.options.find((candidate) => candidate.value === decision.value || candidate.label === decision.value);
    await locator.selectOption(option.value ? { value: option.value } : { label: option.label });
    return page;
  }

  if (decision.action === "press") {
    await locator.press("Enter");
    return page;
  }

  const pagesBefore = new Set(page.context().pages());
  try {
    await locator.click({ timeout: 7000 });
  } catch (error) {
    if (/intercepts pointer events|not receive pointer events|element is not attached|element is not visible/i.test(error.message || "")) {
      const unavailable = new Error("The interface changed after observation and another visible layer now owns the interaction.");
      unavailable.code = "E2P_ACTION_UNAVAILABLE";
      throw unavailable;
    }
    throw error;
  }
  await page.waitForTimeout(350);
  const openedPage = page.context().pages().find((candidate) => !pagesBefore.has(candidate));
  if (openedPage) {
    await openedPage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    return openedPage;
  }
  return page;
}

function classifyExplorationAction(action, { authenticated = false } = {}) {
  const name = sanitizeText(action?.name);
  if (!name || BLOCKED_ACTION_PATTERN.test(name)) {
    return { safe: false, reason: "blocked-intent" };
  }

  if (action?.kind === "fill" || action?.kind === "press") {
    const inputType = String(action.inputType || "text").toLowerCase();
    const inputHint = `${name} ${action.placeholder || ""}`;
    const allowed = ["text", "search"].includes(inputType)
      && !/password|email|phone|address|credential|token|secret|api\s*key|access\s*key|chave|senha|e-mail/i.test(inputHint);
    return { safe: allowed && !authenticated, reason: allowed && !authenticated ? "safe-query-input" : "sensitive-or-authenticated-input" };
  }

  if (action?.kind === "select") {
    const allowed = !authenticated && Array.isArray(action.options) && action.options.length > 1;
    return { safe: allowed, reason: allowed ? "safe-select-control" : "unsupported-select-control" };
  }

  if (action?.role === "link" && action?.href && !action.sameOrigin) {
    return { safe: false, reason: "external-navigation" };
  }

  if (authenticated && !/menu|navigation|course|dashboard|home|profile|account|calendar|inbox|close|back|next|previous/i.test(name)) {
    return { safe: false, reason: "authenticated-read-only-policy" };
  }

  return { safe: true, reason: "ephemeral-or-navigation-action" };
}

function buildBaselineResult(initialObservation) {
  return {
    strategy: "baseline-dom-scan",
    usedModel: false,
    model: "",
    provider: "heuristic",
    status: "not-run",
    steps: [],
    states: [toStateEvidence(initialObservation, 0)],
    metrics: {
      requestedStepLimit: 0,
      completedActions: 0,
      changedStates: 0,
      uniqueStates: 1,
      invalidDecisions: 0,
      failedActions: 0,
      coverageAreas: inferCoverageAreas([toStateEvidence(initialObservation, 0)], []),
      observedOpportunities: inferCoverageAreas([toStateEvidence(initialObservation, 0)], []),
      durationMs: 0,
    },
  };
}

function toStateEvidence(observation, index) {
  return {
    id: `state-${index + 1}`,
    fingerprint: fingerprintObservation(observation),
    ...summarizeState(observation),
  };
}

function summarizeState(observation) {
  return {
    path: observation?.path || "/",
    title: observation?.title || "",
    headings: (observation?.headings || []).slice(0, 8),
    buttons: (observation?.buttons || []).slice(0, 16).map((button) => button.ariaLabel || button.text || button.id || "").filter(Boolean),
    inputs: (observation?.inputs || []).slice(0, 10).map((input) => input.label || input.placeholder || input.name || input.type || "").filter(Boolean),
    inputDetails: (observation?.inputs || []).slice(0, 10).map((input) => ({
      label: input.label || "",
      placeholder: input.placeholder || "",
      name: input.name || "",
      type: input.type || "",
      value: input.value || "",
    })),
    actions: (observation?.actions || []).slice(0, 30).map((action) => ({
      id: action.id,
      kind: action.kind,
      role: action.role,
      name: action.name,
      accessibleName: action.accessibleName,
      context: action.context || "",
      tagName: action.tagName,
      nameAttribute: action.nameAttribute,
      tagIndex: action.tagIndex,
      options: action.options,
      label: action.label,
      placeholder: action.placeholder,
      targetBlank: Boolean(action.targetBlank),
      testId: action.testId,
      domId: action.domId,
      visualSelector: action.visualSelector,
      visualIndex: action.visualIndex,
      accessibleIndex: action.accessibleIndex,
      accessibleCount: action.accessibleCount,
      minLength: action.minLength,
      boundaryProbe: Boolean(action.boundaryProbe),
      safe: action.safe,
      inOverlay: Boolean(action.inOverlay),
    })),
    dialogsCount: observation?.dialogsCount || 0,
    overlayTexts: (observation?.overlayTexts || []).slice(0, 4),
    visibleTextExcerpt: sanitizeText(observation?.visibleTextExcerpt).slice(0, 700),
  };
}

function fingerprintObservation(observation) {
  const material = JSON.stringify({
    path: observation?.path || "/",
    title: observation?.title || "",
    headings: observation?.headings || [],
    buttons: (observation?.buttons || []).map((button) => button.ariaLabel || button.text || button.id || ""),
    inputs: (observation?.inputs || []).map((input) => ({
      label: input.label || input.placeholder || input.name || "",
      value: input.value || "",
    })),
    dialogsCount: observation?.dialogsCount || 0,
    overlayTexts: observation?.overlayTexts || [],
    actions: (observation?.actions || []).slice(0, 35).map((action) => `${action.kind}|${action.role}|${action.name}`),
    visibleTextExcerpt: sanitizeText(observation?.visibleTextExcerpt).slice(0, 1000),
  });
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 16);
}

function actionSemanticKey(action) {
  return `${action.kind}|${action.role}|${sanitizeText(action.name).toLowerCase()}`;
}

function inferCoverageAreas(states, steps) {
  if (!states.length) {
    const covered = new Set();
    for (const step of steps || []) {
      const name = sanitizeText(step.action?.name);
      const reasoning = `${step.rationale || ""} ${step.expectedOutcome || ""}`;
      if (/favorit|wishlist|desejos/i.test(name)) covered.add("favorites");
      if (/cart|carrinho|basket|sacola|adicionar ao carrinho|adicionar uma unidade|remover uma unidade/i.test(name)) covered.add("cart");
      if (step.action?.kind === "fill" || /^[✦⌘◉◎◇]|^(tudo|tecnologia|anime|importados|moda)$/i.test(name)) covered.add("search-filter");
      if (step.changed && /product|produto|details|detalhes|specifics|item/i.test(reasoning)) covered.add("product-details");
      if (/explor|menu|home|in[ií]cio|back|voltar|next|pr[oó]xim/i.test(name)) covered.add("navigation");
    }
    return COVERAGE_RULES.map((rule) => rule.id).filter((id) => covered.has(id));
  }
  const corpus = states.length
    ? JSON.stringify(states)
    : "";
  return COVERAGE_RULES.filter((rule) => rule.pattern.test(corpus)).map((rule) => rule.id);
}

function sanitizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  buildBaselineResult,
  classifyExplorationAction,
  estimateAdaptiveExplorationBudget,
  executeDecision,
  fingerprintObservation,
  runAgenticExploration,
  validateAgentDecision,
};
