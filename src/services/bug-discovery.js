const fs = require("node:fs/promises");
const path = require("node:path");
const { normalizeAiConfig, requestStructuredJson } = require("./llm-provider");

const BATCH_SIZE = 1;
const ANOMALY_PATTERN = /\b(no|not|never|nothing|fail(?:ed|s|ure)?|error|missing|unexpected|incorrect|broken|unavailable|disabled|despite|remain(?:ed|s)?|unchanged|contradict(?:s|ory|ion)?|inconsisten(?:t|cy)|duplicate|overlap|empty|cannot|can't|wrong)\b/i;
const ALLOWED_SEVERITIES = new Set(["critical", "high", "medium", "low", "informational"]);
const ALLOWED_CONFIDENCE = new Set(["high", "medium", "low"]);
const ALLOWED_EXPECTATION_SOURCES = new Set([
  "project-documentation",
  "cross-state-consistency",
  "interface-convention",
  "runtime-diagnostic",
  "model-inference",
]);

async function discoverPotentialBugs({
  inspection,
  exploration,
  diagnostics = {},
  aiConfig,
  evidenceDirectory,
  visionEnabled = false,
  onProgress = () => {},
}) {
  const normalizedAi = normalizeAiConfig(aiConfig);
  const requestedReviewerModel = sanitizeText(aiConfig?.criticModel, 180);
  const normalizedCriticAi = requestedReviewerModel
    ? normalizeAiConfig({ ...aiConfig, model: requestedReviewerModel })
    : normalizedAi;
  if (!normalizedAi.enabled) {
    return buildUnavailableReport("A configured model is required for exploratory bug discovery.");
  }

  const states = (exploration?.states || []).filter((state) => state.id);
  if (!states.length) {
    return buildUnavailableReport("No completed exploration states were available for bug discovery.");
  }

  const batches = chunk(states, BATCH_SIZE);
  const hypotheses = [];
  const errors = [];
  const diagnosticEvidence = normalizeDiagnostics(diagnostics);

  for (const [index, batch] of batches.entries()) {
    onProgress({
      phase: "blind-bug-discovery",
      message: `The selected model is reviewing explored state batch ${index + 1} of ${batches.length} for potential defects...`,
      progress: 84 + Math.round(((index + 1) / batches.length) * 10),
    });
    try {
      const contextStates = expandTransitionStates(batch, states, exploration?.steps || []);
      const images = visionEnabled
        ? await readBatchImages(batch, evidenceDirectory)
        : [];
      const response = await requestStructuredJson({
        aiConfig: normalizedAi,
        timeoutMs: 180000,
        systemPrompt: buildBugHunterPrompt({ visionEnabled }),
        userPrompt: JSON.stringify({
          projectContext: buildProjectPromptContext(inspection),
          states: contextStates.map(toPromptState),
          observedJourney: buildJourneyForStates(exploration?.steps || [], batch, contextStates),
          diagnostics: diagnosticEvidence.prompt,
          evidenceContract: {
            validStateIds: contextStates.map((state) => state.id),
            attachedScreenshotStateIds: visionEnabled ? batch.map((state) => state.id) : [],
            validDiagnosticIds: diagnosticEvidence.validIds,
          },
        }),
        images,
      });
      hypotheses.push(...normalizeHypotheses(response?.hypotheses, {
        states: contextStates,
        steps: exploration?.steps || [],
        diagnosticEvidence,
      }));
    } catch (error) {
      errors.push(`State batch ${index + 1}: ${sanitizeText(error.message, 500)}`);
    }
  }

  const batchFailureCount = errors.length;
  const candidateHypotheses = deduplicateHypotheses(hypotheses).slice(0, 12);
  const criticReview = await critiqueHypotheses({
    hypotheses: candidateHypotheses,
    inspection,
    states,
    steps: exploration?.steps || [],
    aiConfig: normalizedCriticAi,
    evidenceDirectory,
    visionEnabled,
    onProgress,
  });
  errors.push(...criticReview.errors);
  const uniqueHypotheses = criticReview.retained;
  return {
    status: batchFailureCount === batches.length
      ? "failed"
      : errors.length ? "partial" : "completed",
    mode: "blind-model-guided",
    evidenceMode: visionEnabled ? "multimodal" : "structured-browser-evidence",
    model: normalizedAi.model,
    reviewerModel: normalizedCriticAi.model,
    provider: normalizedAi.provider,
    summary: uniqueHypotheses.length
      ? `${uniqueHypotheses.length} evidence-grounded potential defect(s) require human validation.`
      : "No evidence-grounded potential defect was retained from the explored states.",
    analyzedStateCount: states.length,
    analyzedBatchCount: batches.length,
    hypotheses: uniqueHypotheses,
    rejectedHypotheses: criticReview.rejected,
    screening: {
      candidates: candidateHypotheses.length,
      retained: uniqueHypotheses.length,
      rejected: criticReview.rejected.length,
      criticRole: "conservative-model-reviewer",
    },
    diagnostics: diagnosticEvidence.publicSummary,
    limitations: [
      "A retained item is a hypothesis, not a confirmed application defect.",
      "Expected behavior may be inferred from documentation, cross-state consistency, interface conventions, or model judgment.",
      "States not reached during model-guided exploration were not evaluated.",
      "Visual and semantic model judgments can be wrong even when their evidence references are valid.",
    ],
    errors,
    generatedAt: new Date().toISOString(),
  };
}

async function critiqueHypotheses({
  hypotheses,
  inspection,
  states,
  steps,
  aiConfig,
  evidenceDirectory,
  visionEnabled,
  onProgress,
}) {
  const retained = [];
  const rejected = [];
  const errors = [];

  for (const [index, hypothesis] of hypotheses.entries()) {
    onProgress({
      phase: "defect-hypothesis-critique",
      message: `A conservative model-reviewer is checking defect hypothesis ${index + 1} of ${hypotheses.length}...`,
      progress: 94 + Math.round(((index + 1) / Math.max(hypotheses.length, 1)) * 2),
    });
    const relatedStates = states.filter((state) => hypothesis.evidenceStateIds.includes(state.id));
    const relatedSteps = steps.filter((step) => hypothesis.evidenceStateIds.some((stateId) => (
      step.beforeStateId === stateId || step.afterStateId === stateId
    )));
    try {
      const images = visionEnabled
        ? await readBatchImages(relatedStates.slice(0, 1), evidenceDirectory)
        : [];
      let review;
      let validationFeedback = "";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const rawReview = await requestStructuredJson({
          aiConfig,
          timeoutMs: 180000,
          images,
          systemPrompt: [
            "You are the conservative reviewer for a blind web-QA defect-discovery pipeline.",
            "Try to falsify the candidate hypothesis using only the supplied state, executed actions, screenshot when present, and cited facts.",
            "Judge the state transition itself. Ignore an incidental missing resource unless the candidate proves that it directly caused the claimed UI outcome.",
            "Reject it if the observed behavior already satisfies the expected behavior, if it merely describes a normal empty or boundary state, if the claimed action was not executed, if visible feedback contradicts the claim, or if evidence only shows that a control exists.",
            "Retain it only when a concrete anomaly survives those checks. Uncertainty means reject, because a human can inspect rejected candidates later.",
            "Do not choose retain or reject. Report four factual gates: whether the claimed action was executed, whether the expected behavior is grounded rather than speculative, whether the supplied evidence is sufficient, and whether that grounded expectation was satisfied.",
            "An ordinary empty state, an unexecuted action, or a preference unsupported by documentation, interface copy, or cross-state consistency must set expectationGrounded false or actionExecuted false.",
            "If the action was executed, the expected visible outcome is grounded, the evidence is sufficient, and that outcome did not occur, set actionExecuted true, expectationGrounded true, evidenceSufficient true, and expectationSatisfied false.",
            "E2P derives the verdict from all four gates so a speculative expectation cannot become a reported defect.",
            "Return raw JSON only: {\"actionExecuted\":true,\"expectationGrounded\":true,\"evidenceSufficient\":true,\"expectationSatisfied\":false,\"observedOutcome\":\"...\",\"reason\":\"...\",\"confidence\":\"high|medium|low\"}.",
          ].join(" "),
          userPrompt: JSON.stringify({
            validationFeedback: validationFeedback || undefined,
            projectContext: buildProjectPromptContext(inspection),
            hypothesis,
            states: relatedStates.map(toPromptState),
            executedActions: relatedSteps.map((step) => ({
              step: step.step,
              action: toPromptAction(step.action),
              expectedOutcome: sanitizeText(step.expectedOutcome, 500),
              changed: step.changed,
              beforeStateId: step.beforeStateId,
              afterStateId: step.afterStateId,
            })),
          }),
        });
        try {
          review = validateCriticReview(rawReview);
          break;
        } catch (error) {
          if (attempt === 1) throw error;
          validationFeedback = error.message;
        }
      }
      const { verdict, reason } = review;
      if (verdict === "retain") {
        retained.push({
          ...hypothesis,
          criticReview: {
            verdict: "retain",
            reason,
            confidence: review.confidence,
            evidenceAssessment: review.evidenceAssessment,
            actionExecuted: review.actionExecuted,
            expectationGrounded: review.expectationGrounded,
            evidenceSufficient: review.evidenceSufficient,
            expectationSatisfied: review.expectationSatisfied,
            observedOutcome: review.observedOutcome,
          },
        });
      } else {
        rejected.push({
          id: hypothesis.id,
          title: hypothesis.title,
          reason,
          verdict: "reject",
          authorConfidence: hypothesis.confidence,
          authorSeverity: hypothesis.severity,
          reviewerConfidence: review.confidence,
          evidenceAssessment: review.evidenceAssessment,
          actionExecuted: review.actionExecuted,
          expectationGrounded: review.expectationGrounded,
          evidenceSufficient: review.evidenceSufficient,
          expectationSatisfied: review.expectationSatisfied,
          observedOutcome: review.observedOutcome,
        });
      }
    } catch (error) {
      const reason = `Critic review failed; the candidate was not retained: ${sanitizeText(error.message, 500)}`;
      errors.push(`${hypothesis.id}: ${reason}`);
      rejected.push({
        id: hypothesis.id,
        title: hypothesis.title,
        reason,
        verdict: "unreviewed",
        authorConfidence: hypothesis.confidence,
        authorSeverity: hypothesis.severity,
        reviewerConfidence: "unavailable",
      });
    }
  }

  return { retained, rejected, errors };
}

function buildProjectPromptContext(inspection) {
  const relevantFiles = [...(inspection?.relevantFiles || [])]
    .sort((left, right) => projectEvidencePriority(right?.relativePath) - projectEvidencePriority(left?.relativePath))
    .slice(0, 10)
    .map((file) => ({
      path: sanitizeText(file?.relativePath, 260),
      excerpt: sanitizeText(file?.excerpt, 900),
    }))
    .filter((file) => file.path && file.excerpt);
  return {
    name: inspection?.project?.name || "Unknown web project",
    synopsis: sanitizeText(inspection?.projectSynopsis, 1600),
    documentedCapabilities: uniqueStrings(inspection?.ai?.mainCapabilities).slice(0, 10),
    repositorySignals: uniqueStrings(inspection?.signals).slice(0, 12),
    sourceEvidence: relevantFiles,
  };
}

function projectEvidencePriority(relativePath) {
  const value = String(relativePath || "");
  if (/readme|spec|requirement/i.test(value)) return 5;
  if (/input|form|header|reducer|store|action/i.test(value)) return 4;
  if (/component|page|route|app/i.test(value)) return 3;
  return 1;
}

function validateCriticReview(review) {
  const reason = sanitizeText(review?.reason, 1000);
  if (!reason) throw new Error("The critic must explain its verdict.");
  if (!ALLOWED_CONFIDENCE.has(review?.confidence)) throw new Error("The critic must provide high, medium, or low confidence.");
  if (typeof review?.actionExecuted !== "boolean") throw new Error("The critic must state whether the claimed action was executed.");
  if (typeof review?.expectationGrounded !== "boolean") throw new Error("The critic must state whether the expected behavior is grounded.");
  if (typeof review?.evidenceSufficient !== "boolean") throw new Error("The critic must state whether the supplied evidence is sufficient.");
  if (typeof review?.expectationSatisfied !== "boolean") throw new Error("The critic must state whether the expected outcome was satisfied.");
  const supportsAnomaly = review.actionExecuted
    && review.expectationGrounded
    && review.evidenceSufficient
    && !review.expectationSatisfied;
  const evidenceAssessment = supportsAnomaly
    ? "supports-anomaly"
    : !review.evidenceSufficient || !review.actionExecuted || !review.expectationGrounded
    ? "insufficient"
    : "refutes-anomaly";
  return {
    verdict: supportsAnomaly ? "retain" : "reject",
    evidenceAssessment,
    actionExecuted: review.actionExecuted,
    expectationGrounded: review.expectationGrounded,
    evidenceSufficient: review.evidenceSufficient,
    expectationSatisfied: review.expectationSatisfied,
    observedOutcome: sanitizeText(review.observedOutcome, 1000),
    reason,
    confidence: review.confidence,
  };
}

function buildBugHunterPrompt({ visionEnabled = false } = {}) {
  return [
    "You are the blind bug-hunter stage of a web QA pipeline.",
    "The target is unfamiliar: you have no issue list, known bug, source diff, fixed version, or privileged ground truth.",
    visionEnabled
      ? "Analyze only the attached viewport screenshots, executed journey, structured browser states, project documentation signals, and runtime diagnostics."
      : "Analyze only the executed journey, structured browser states, project documentation signals, and runtime diagnostics. No screenshot was supplied to this text-only model.",
    "Report concrete inconsistencies, broken state transitions, contradictory content, inaccessible or unusable controls, visible runtime failures, or behavior that conflicts with a clearly stated capability.",
    "Do not claim that an unexercised control is broken. Do not turn aesthetic preferences into functional bugs.",
    "Keep observed facts separate from inferred expectations. Every fact must cite supplied state or diagnostic IDs.",
    "Every UI hypothesis must include at least one fact citing a state ID. A console or page diagnostic alone cannot establish a visible UI failure.",
    "InputDetails describe values still inside fields; visibleTextExcerpt describes rendered page text. Do not claim that a value became a created item merely because it remains in an input.",
    "Do not use an unrelated missing resource or generic 404 as evidence for a UI state transition unless its URL and timing directly identify the failed operation.",
    "A hypothesis must describe an actual anomaly. Its observed result and at least one cited fact must explicitly state the failure, contradiction, missing feedback, unchanged state, or other unexpected behavior; the mere presence of a control is not a defect.",
    "Expected behavior must name its source: project-documentation, cross-state-consistency, interface-convention, runtime-diagnostic, or model-inference.",
    "If evidence is insufficient, omit the hypothesis rather than inventing a requirement.",
    "All reproduction steps must be derived from the supplied observed journey and visible controls.",
    "Return at most two hypotheses per state batch.",
    "Return raw JSON only with this shape:",
    "{\"hypotheses\":[{\"title\":\"...\",\"objectiveDescription\":\"...\",\"affectedFlow\":\"...\",\"preconditions\":[\"...\"],\"reproductionSteps\":[\"...\"],\"observedResult\":\"...\",\"facts\":[{\"statement\":\"...\",\"evidenceRefs\":[\"state-1\"]}],\"expectedResult\":\"...\",\"expectationJustification\":\"...\",\"expectationSource\":\"cross-state-consistency\",\"severity\":\"medium\",\"confidence\":\"medium\",\"evidenceStateIds\":[\"state-1\"]}]}",
  ].join(" ");
}

function normalizeHypotheses(value, context) {
  return (Array.isArray(value) ? value : []).flatMap((raw) => {
    const validStateIds = new Set(context.states.map((state) => state.id));
    const validRefs = new Set([...validStateIds, ...context.diagnosticEvidence.validIds]);
    const rawFacts = (Array.isArray(raw?.facts) ? raw.facts : []).slice(0, 8).map((fact) => ({
      statement: sanitizeText(fact?.statement, 700),
      evidenceRefs: uniqueStrings(fact?.evidenceRefs).filter((ref) => validRefs.has(ref)).slice(0, 8),
    })).filter((fact) => fact.statement && fact.evidenceRefs.length);
    const evidenceStateIds = uniqueStrings([
      ...(Array.isArray(raw?.evidenceStateIds) ? raw.evidenceStateIds : []),
      ...rawFacts.flatMap((fact) => fact.evidenceRefs.filter((ref) => validStateIds.has(ref))),
    ]).filter((id) => validStateIds.has(id));
    const title = sanitizeText(raw?.title, 180);
    const observedResult = sanitizeText(raw?.observedResult, 1000);
    const expectedResult = sanitizeText(raw?.expectedResult, 1000);
    const expectationJustification = sanitizeText(raw?.expectationJustification, 1000);
    const reproductionSteps = uniqueStrings(raw?.reproductionSteps).slice(0, 12);

    const relatedSteps = context.steps.filter((step) => (
      evidenceStateIds.some((stateId) => stateId === step.beforeStateId || stateId === step.afterStateId)
    ));
    const reproductionMaterial = reproductionSteps.join(" ");
    const transitionFacts = relatedSteps
      .filter((step) => {
        if (step.status !== "completed" || step.changed !== false || !step.expectedOutcome) return false;
        if (step.action?.kind === "press") return /\b(press|enter|submit)\b/i.test(reproductionMaterial);
        return true;
      })
      .map((step) => ({
        statement: `After ${sanitizeText(step.action?.name, 180)}, no structured interface change was observed despite the recorded expectation: ${sanitizeText(step.expectedOutcome, 420)}`,
        evidenceRefs: uniqueStrings([step.beforeStateId, step.afterStateId]).filter((id) => validStateIds.has(id)),
      }))
      .filter((fact) => fact.evidenceRefs.length);
    const facts = deduplicateFacts([...rawFacts, ...transitionFacts]).slice(0, 10);
    const hasStateFact = facts.some((fact) => fact.evidenceRefs.some((ref) => validStateIds.has(ref)));
    const anomalyIsGrounded = ANOMALY_PATTERN.test(`${title} ${observedResult}`)
      && facts.some((fact) => ANOMALY_PATTERN.test(fact.statement));
    if (!title || !facts.length || !hasStateFact || !observedResult || !expectedResult || !expectationJustification || !reproductionSteps.length || !anomalyIsGrounded) {
      return [];
    }

    const relatedStates = context.states.filter((state) => evidenceStateIds.includes(state.id));
    return [{
      id: `bug-hypothesis-${stableHash(`${title}|${observedResult}`)}`,
      confirmationStatus: "hypothesis",
      title,
      objectiveDescription: sanitizeText(raw?.objectiveDescription, 1200),
      affectedFlow: sanitizeText(raw?.affectedFlow, 400),
      preconditions: uniqueStrings(raw?.preconditions).slice(0, 10),
      reproductionSteps,
      observed: {
        result: observedResult,
        facts,
      },
      expected: {
        result: expectedResult,
        justification: expectationJustification,
        source: ALLOWED_EXPECTATION_SOURCES.has(raw?.expectationSource)
          ? raw.expectationSource
          : "model-inference",
      },
      severity: ALLOWED_SEVERITIES.has(raw?.severity) ? raw.severity : "medium",
      confidence: ALLOWED_CONFIDENCE.has(raw?.confidence) ? raw.confidence : "low",
      evidenceStateIds,
      evidence: collectEvidence(relatedStates, relatedSteps, facts, context.diagnosticEvidence),
      requiresHumanValidation: true,
    }];
  });
}

function deduplicateFacts(facts) {
  const seen = new Set();
  return facts.filter((fact) => {
    const key = `${fact.statement}|${fact.evidenceRefs.join("|")}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectEvidence(states, steps, facts, diagnosticEvidence) {
  const diagnosticRefs = new Set(facts.flatMap((fact) => fact.evidenceRefs).filter((ref) => !ref.startsWith("state-")));
  return {
    screenshots: states.flatMap((state) => (state.visualEvidence || []).map((item) => ({
      stateId: state.id,
      artifactUrl: item.artifactUrl,
      fileName: item.fileName,
      viewportIndex: item.viewportIndex,
    }))),
    executedActions: steps.map((step) => ({
      step: step.step,
      action: step.action,
      changed: step.changed,
    })),
    consoleErrors: diagnosticEvidence.items.consoleErrors.filter((item) => diagnosticRefs.has(item.id)),
    pageErrors: diagnosticEvidence.items.pageErrors.filter((item) => diagnosticRefs.has(item.id)),
  };
}

async function readBatchImages(states, evidenceDirectory) {
  if (!evidenceDirectory) return [];
  const candidates = states
    .map((state) => (state.visualEvidence || [])[0])
    .filter(Boolean)
    .slice(0, 1);
  const images = [];
  for (const item of candidates) {
    const absolutePath = path.resolve(evidenceDirectory, item.fileName || "");
    const relative = path.relative(evidenceDirectory, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    images.push(await fs.readFile(absolutePath, "base64"));
  }
  return images;
}

function toPromptState(state) {
  return {
    id: state.id,
    path: state.path,
    title: sanitizeText(state.title, 240),
    headings: uniqueStrings(state.headings).slice(0, 8),
    buttons: uniqueStrings(state.buttons).slice(0, 16),
    inputs: uniqueStrings(state.inputs).slice(0, 12),
    inputDetails: (Array.isArray(state.inputDetails) ? state.inputDetails : []).slice(0, 12).map((input) => ({
      label: sanitizeText(input.label || input.placeholder || input.name, 180),
      type: sanitizeText(input.type, 40),
      value: sanitizeText(input.value, 180),
    })),
    dialogsCount: state.dialogsCount,
    visibleTextExcerpt: sanitizeText(state.visibleTextExcerpt, 700),
    screenshotFileNames: (state.visualEvidence || []).map((item) => item.fileName).slice(0, 4),
  };
}

function toPromptAction(action = {}) {
  return {
    kind: sanitizeText(action.kind, 40),
    name: sanitizeText(action.name, 240),
    context: sanitizeText(action.context, 240),
    role: sanitizeText(action.role, 40),
    value: sanitizeText(action.value, 240),
    href: sanitizeText(action.href, 400),
  };
}

function buildJourneyForStates(steps, focalStates, contextStates = focalStates) {
  const stateIds = new Set(focalStates.map((state) => state.id));
  const stateMap = new Map(contextStates.map((state) => [state.id, state]));
  return (steps || []).filter((step) => (
    step.status === "completed"
      && (stateIds.has(step.beforeStateId) || stateIds.has(step.afterStateId))
  )).map((step) => ({
    step: step.step,
    beforeStateId: step.beforeStateId,
    action: toPromptAction(step.action),
    rationale: sanitizeText(step.rationale, 500),
    expectedOutcome: sanitizeText(step.expectedOutcome, 700),
    changed: step.changed,
    afterStateId: step.afterStateId,
    beforePath: stateMap.get(step.beforeStateId)?.path || "",
    afterPath: stateMap.get(step.afterStateId)?.path || "",
  }));
}

function expandTransitionStates(focalStates, allStates, steps) {
  const focalIds = new Set(focalStates.map((state) => state.id));
  const ids = new Set(focalIds);
  for (const step of steps || []) {
    if (focalIds.has(step.beforeStateId) || focalIds.has(step.afterStateId)) {
      if (step.beforeStateId) ids.add(step.beforeStateId);
      if (step.afterStateId) ids.add(step.afterStateId);
    }
  }
  return allStates.filter((state) => ids.has(state.id)).slice(0, 4);
}

function normalizeDiagnostics(diagnostics) {
  const categories = ["consoleErrors", "pageErrors"];
  const items = {};
  const prompt = {};
  const validIds = [];
  for (const category of categories) {
    items[category] = (Array.isArray(diagnostics?.[category]) ? diagnostics[category] : []).slice(0, 12).map((item, index) => {
      const id = `${category.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/s$/, "")}-${index + 1}`;
      validIds.push(id);
      return typeof item === "string"
        ? { id, message: sanitizeText(item, 800) }
        : { id, ...item };
    });
    prompt[category] = items[category];
  }
  return {
    items,
    prompt,
    validIds,
    publicSummary: Object.fromEntries(categories.map((category) => [category, items[category].length])),
  };
}

function deduplicateHypotheses(hypotheses) {
  const output = [];
  const seen = new Set();
  for (const hypothesis of hypotheses) {
    const key = `${hypothesis.title}|${hypothesis.observed.result}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(hypothesis);
  }
  return output;
}

function buildUnavailableReport(error) {
  return {
    status: "unavailable",
    mode: "blind-model-guided",
    evidenceMode: "unavailable",
    summary: error,
    analyzedStateCount: 0,
    analyzedBatchCount: 0,
    hypotheses: [],
    diagnostics: {},
    limitations: [error],
    errors: [error],
    generatedAt: new Date().toISOString(),
  };
}

function chunk(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => sanitizeText(value, 500)).filter(Boolean))];
}

function sanitizeText(value, limit = 500) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

module.exports = {
  buildBugHunterPrompt,
  buildJourneyForStates,
  discoverPotentialBugs,
  expandTransitionStates,
  normalizeDiagnostics,
  normalizeHypotheses,
  validateCriticReview,
};
