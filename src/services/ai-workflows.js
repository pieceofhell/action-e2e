const { normalizeAiConfig, requestStructuredJson } = require("./llm-provider");
const { isExplicitBaseline, requireCompletedAiExploration } = require("./pipeline-policy");

async function enhanceInspectionWithAi({ inspection, aiConfig }) {
  const normalized = normalizeAiConfig(aiConfig);

  if (!normalized.enabled) {
    if (!isExplicitBaseline(aiConfig)) {
      throw new Error("AI-first pipeline stopped during project understanding: no model is configured.");
    }
    return {
      inspection: {
        ...inspection,
        ai: buildAiMetadata(normalized, "heuristic-only"),
      },
      usedModel: false,
    };
  }

  const compactInspection = {
    project: inspection.project,
    detection: inspection.detection,
    runtime: inspection.runtime,
    readmeExcerpt: inspection.manifests.readme?.excerpt || "",
    relevantFiles: inspection.relevantFiles.slice(0, 6).map((file) => ({
      relativePath: file.relativePath,
      category: file.category,
      excerpt: String(file.excerpt || "").slice(0, 520),
    })),
    uiHints: {
      headings: inspection.uiHints.headings.slice(0, 5).map((item) => item.text),
      buttons: inspection.uiHints.buttons.slice(0, 8).map((item) => item.text || item.id || item.dataTool || ""),
      inputs: inspection.uiHints.inputs.slice(0, 6).map((item) => item.placeholder || item.id || item.name || item.type),
      links: inspection.uiHints.links.slice(0, 6).map((item) => item.text || item.href),
      hasCanvas: inspection.uiHints.canvases.length > 0,
    },
    liveExploration: summarizeLiveExplorationForPrompt(inspection.liveExploration),
    warnings: inspection.warnings,
  };

  try {
    const aiPayload = await requestStructuredJson({
      aiConfig: normalized,
      systemPrompt: [
        "You are a technical analyst for an experimental E2E test-generation prototype.",
        "You will receive a structured summary of a software project, and sometimes a live exploration of the rendered interface.",
        "When live exploration data exists, treat it as stronger evidence than static heuristics.",
        "Do not invent missing details. When uncertainty exists, lower the confidence.",
        "Your response must be valid raw JSON in this format:",
        '{"projectSynopsis":"...","userPersona":"...","mainCapabilities":["..."],"confidence":"high|medium|low","reasoning":["..."],"warnings":["..."]}',
      ].join(" "),
      userPrompt: JSON.stringify(compactInspection, null, 2),
      timeoutMs: 120000,
    });

    const mergedInspection = {
      ...inspection,
      projectSynopsis: sanitizeText(aiPayload.projectSynopsis) || inspection.projectSynopsis,
      ai: {
        ...buildAiMetadata(normalized, inspection.liveExploration?.status === "completed" ? "inspection-live-enriched" : "inspection-enriched"),
        userPersona: sanitizeText(aiPayload.userPersona),
        mainCapabilities: sanitizeStringArray(aiPayload.mainCapabilities),
        reasoning: sanitizeStringArray(aiPayload.reasoning),
      },
      detection: {
        ...inspection.detection,
        confidence: normalizeConfidence(aiPayload.confidence, inspection.detection.confidence),
      },
      signals: uniqueStrings([
        inspection.liveExploration?.status === "completed"
          ? `Summary refined by ${normalized.label} with live UI evidence.`
          : `Summary refined by ${normalized.label}.`,
        ...sanitizeStringArray(aiPayload.reasoning),
        ...inspection.signals,
      ]).slice(0, 16),
      warnings: uniqueStrings([
        ...inspection.warnings,
        ...sanitizeStringArray(aiPayload.warnings),
      ]).slice(0, 12),
    };

    return {
      inspection: mergedInspection,
      usedModel: true,
    };
  } catch (error) {
    throw new Error(`AI-first pipeline stopped during project understanding: ${error.message}`);
  }
}

async function enhanceFlowPlanWithAi({ inspection, basePlan, aiConfig }) {
  const normalized = normalizeAiConfig(aiConfig);

  if (!normalized.enabled) {
    if (!isExplicitBaseline(aiConfig)) {
      throw new Error("AI-first pipeline stopped during flow planning: no model is configured.");
    }
    return {
      plan: {
        ...basePlan,
        mode: basePlan.mode === "authenticated-read-only" ? "authenticated-read-only" : "heuristic",
        ai: buildAiMetadata(normalized, "heuristic-only"),
      },
      usedModel: false,
    };
  }


  requireCompletedAiExploration(inspection, "flow planning");

  const explorationStates = inspection.liveExploration?.agenticExploration?.states || [];
  const completedExplorationSteps = (inspection.liveExploration?.agenticExploration?.steps || [])
    .filter((step) => step.status === "completed");
  const coverageTargets = deriveCoverageTargets(explorationStates, completedExplorationSteps);

  const compactContext = {
    project: { name: inspection.project?.name },
    access: basePlan.access || inspection.liveExploration?.access || { mode: "guest" },
    liveExploration: summarizeLiveExplorationForPrompt(inspection.liveExploration),
    evidenceContract: {
      allowedStateIds: explorationStates.map((state) => state.id),
      completedActionLabels: completedExplorationSteps.map((step) => step.action?.name).filter(Boolean),
      observedHeadings: [...new Set(explorationStates.flatMap((state) => state.headings || []))].slice(0, 12),
      observedButtons: [...new Set(explorationStates.flatMap((state) => state.buttons || []))].slice(0, 16),
      observedInputs: [...new Set(explorationStates.flatMap((state) => state.inputs || []))].slice(0, 12),
      coverageTargets,
    },
  };

  try {
    const planningSystemPrompt = [
        "You are an E2E testing analyst authoring candidate user flows and acceptance criteria.",
        `The current project is ${sanitizeText(inspection.project?.name)}. Treat this as an isolated evaluation and do not reuse flows from any other application or earlier request.`,
        "You will receive only the current project name, model-guided browser states, and completed browser actions. Treat this rendered evidence as the complete source of truth for planning.",
        "Author the most valuable evidence-grounded user journeys from scratch. Do not rely on generic templates or baseline flows.",
        "Every flow must cite evidenceStateIds and sourceSignals that can be traced to the supplied live evidence. Do not invent pages, routes, buttons, or fields.",
        "Copy evidenceStateIds character-for-character from evidenceContract.allowedStateIds. Never calculate, extrapolate, renumber, or invent a state ID.",
        "A product or organization named Canvas does not imply an HTML drawing canvas. Never infer drawing tools, mouse drawing, or save-canvas behavior from the word Canvas alone.",
        "Never mention products, carts, favorites, authentication, or another domain unless those exact concepts appear in the supplied current-project states and completed actions.",
        "Write application-grounded acceptance criteria from scratch.",
        "Prefer distinct flows that cover different parts of the interface or different user intents.",
        "Distinct executed actions may legitimately produce the same terminal state. Preserve them as separate flows when they exercise different user intents or controls.",
        "If access.mode is authenticated, propose only navigation and observation flows. Never propose creating, changing, publishing, sending, uploading, joining, enrolling, or deleting data.",
        "Authentication values, cookies, headers, environment references, and password fields are never part of your context and must never be requested.",
        "For guest exploration, never propose entering, revealing, validating, or submitting passwords, API keys, access tokens, credentials, or other authentication material, even when those fields were visible.",
        "Do not claim that an account was connected, a form was submitted, or a route changed unless the completed actions prove that exact outcome.",
        "When live exploration exists, ground your criteria in observed headings, route paths, links, inputs, buttons, and visible text.",
        "When concrete labels are available, mention those labels in the criteria instead of generic wording.",
        "Prefer behavior-rich journeys over landing-page smoke checks, but name capabilities only with concepts and labels present in the current evidence.",
        "When completed model-guided actions changed the interface, at least two proposed flows must use those changed states instead of reducing the plan to rendering or generic navigation.",
        "Build semantic flow IDs from exact current-project labels and intents; never use placeholders or examples from another domain.",
        "For each behavior-rich flow, cite the state reached after the relevant completed action, not only state-1.",
        "Use resultingStateId from completedActions as the authoritative action-to-state mapping. Never infer state numbers from action order.",
        "Cover as many supplied coverageTargets as the evidence supports, up to 6 flows. Each selected flow should contain 2 to 4 concrete criteria.",
        "Return raw JSON in this format:",
        '{"summary":"...","flows":[{"id":"...","title":"...","summary":"...","confidence":"high|medium|low","evidenceStateIds":["state-1"],"sourceSignals":["..."],"assumptions":["..."],"criteria":[{"title":"...","given":"...","when":"...","then":"..."}]}]}',
        "The only top-level keys are summary and flows. Do not return a browser action list, plan.flow, candidates, or copied evidence objects.",
      ].join(" ");
    let mergedFlows = [];
    let aiPayload = null;
    let planningPayload = null;
    let transitionFlows = [];
    const desiredFlowCount = Math.min(6, Math.max(1, coverageTargets.length));
    const minimumAdmissibleFlowCount = 1;
    for (let attempt = 0; attempt < 1 && mergedFlows.length < desiredFlowCount; attempt += 1) {
      aiPayload = await requestPlanningJson({
        aiConfig: normalized,
        systemPrompt: planningSystemPrompt,
        userPrompt: JSON.stringify(compactContext, null, 2),
        timeoutMs: 210000,
      });
      planningPayload = Array.isArray(aiPayload?.plan)
        ? { flows: aiPayload.plan }
        : (aiPayload?.plan && typeof aiPayload.plan === "object" ? aiPayload.plan : aiPayload);
      mergedFlows = mergeAiFlows(basePlan.flows, planningPayload?.flows, inspection.liveExploration, inspection);
    }
    if (mergedFlows.length < desiredFlowCount) {
      transitionFlows = await authorFlowsPerObservedTransition({
        aiConfig: normalized,
        projectName: inspection.project?.name,
        states: explorationStates,
        steps: completedExplorationSteps,
        desiredCount: desiredFlowCount,
      });
      const broadFlows = Array.isArray(planningPayload?.flows) ? planningPayload.flows : [];
      mergedFlows = mergeAiFlows(basePlan.flows, [...broadFlows, ...transitionFlows], inspection.liveExploration, inspection);
      planningPayload = { summary: "Model-authored flows decomposed by observed browser transition.", flows: transitionFlows };
    }
    if (mergedFlows.length < minimumAdmissibleFlowCount) {
      throw createFlowGroundingError({
        broadPayload: aiPayload,
        transitionFlows,
        projectName: inspection.project?.name,
        allowedStateIds: explorationStates.map((state) => state.id),
      });
    }
    const coverage = measureFlowCoverage(mergedFlows, coverageTargets, completedExplorationSteps, explorationStates);
    return {
      plan: {
        ...basePlan,
        mode: basePlan.access?.mode === "authenticated" ? "authenticated-ai-first" : "ai-first",
        summary: choosePlanSummary(planningPayload?.summary, basePlan.summary, inspection.projectSynopsis),
        flows: mergedFlows,
        coverage,
        ai: buildAiMetadata(normalized, inspection.liveExploration?.status === "completed" ? "flow-live-refinement" : "flow-refinement"),
      },
      usedModel: true,
    };
  } catch (error) {
    const wrapped = new Error(`AI-first pipeline stopped during flow planning: ${error.message}`);
    wrapped.code = error.code || "AI_FLOW_PLANNING_FAILED";
    wrapped.diagnostics = error.diagnostics || null;
    throw wrapped;
  }
}

function createFlowGroundingError({ broadPayload, transitionFlows, projectName, allowedStateIds }) {
  const broadFlows = Array.isArray(broadPayload?.flows)
    ? broadPayload.flows
    : (Array.isArray(broadPayload?.plan) ? broadPayload.plan : broadPayload?.plan?.flows || []);
  const returnedFlows = [...broadFlows, ...(transitionFlows || [])];
  const rejectedTitles = [...new Set(returnedFlows.map((flow) => sanitizeText(flow?.title)).filter(Boolean))].slice(0, 3);
  const titleSummary = rejectedTitles.length
    ? ` Rejected examples: ${rejectedTitles.map((title) => `"${title}"`).join(", ")}.`
    : "";
  const error = new Error(`The model proposed flows, but none were grounded in the observed ${sanitizeText(projectName) || "target"} interface.${titleSummary} Rerun the exploration or select a model with stronger instruction following.`);
  error.code = "AI_FLOW_GROUNDING_REJECTED";
  error.diagnostics = {
    stage: "flow-planning",
    projectName: sanitizeText(projectName),
    allowedStateIds: sanitizeStringArray(allowedStateIds),
    broadPayload,
    transitionFlows,
    rejectedFlows: returnedFlows.slice(0, 8).map((flow) => ({
      id: sanitizeFlowId(flow?.id || flow?.title || ""),
      title: sanitizeText(flow?.title),
      evidenceStateIds: sanitizeStringArray(flow?.evidenceStateIds),
      criteriaCount: Array.isArray(flow?.criteria) ? flow.criteria.length : 0,
    })),
  };
  return error;
}

async function authorFlowsPerObservedTransition({ aiConfig, projectName, states, steps, desiredCount }) {
  const transitions = [];
  const usedActionKeys = new Set();
  for (const step of steps) {
    const resultingStateId = findStateIdByFingerprint(states, step.afterFingerprint);
    const actionKey = semanticActionKey(step.action);
    if (!resultingStateId || !actionKey || usedActionKeys.has(actionKey)) continue;
    const resultingState = states.find((state) => state.id === resultingStateId);
    if (!resultingState || !step.action?.name) continue;
    usedActionKeys.add(actionKey);
    transitions.push({ step, resultingState, resultingStateId });
  }

  const flows = [];
  for (const transition of transitions.slice(0, 6)) {
    const payload = await requestPlanningJson({
      aiConfig,
      systemPrompt: [
        "You are authoring exactly one E2E user flow from one browser transition that the model already executed.",
        "The action label and resulting state are immutable facts. Describe only behavior directly visible in the supplied before/after evidence.",
        "Do not invent dashboards, tools, drawing, products, routes, submission, authentication success, or controls that are absent.",
        "A product named Canvas is not an HTML drawing canvas unless drawing controls are explicitly listed.",
        "Return 1 to 3 concrete Given/When/Then criteria. Do not mention passwords, API keys, tokens, credentials, or secret values.",
        "Return raw JSON only: {\"id\":\"semantic-id\",\"title\":\"...\",\"summary\":\"...\",\"confidence\":\"high|medium|low\",\"sourceSignals\":[\"...\"],\"assumptions\":[\"...\"],\"criteria\":[{\"title\":\"...\",\"given\":\"...\",\"when\":\"...\",\"then\":\"...\"}]}",
      ].join(" "),
      userPrompt: JSON.stringify({
        project: projectName,
        fixedAction: {
          name: transition.step.action.name,
          kind: transition.step.action.kind,
          rationale: transition.step.rationale,
        },
        fixedResultingStateId: transition.resultingStateId,
        resultingState: {
          path: transition.resultingState.path,
          title: transition.resultingState.title,
          headings: transition.resultingState.headings,
          buttons: transition.resultingState.buttons,
          inputs: transition.resultingState.inputs,
          visibleTextExcerpt: sanitizeText(transition.resultingState.visibleTextExcerpt).slice(0, 500),
        },
      }, null, 2),
      timeoutMs: 150000,
    });
    flows.push({
      ...payload,
      id: sanitizeFlowId(`${transition.step.action.name}-${transition.resultingStateId}`),
      evidenceStateIds: [transition.resultingStateId],
      sourceSignals: sanitizeStringArray(payload?.sourceSignals).length
        ? sanitizeStringArray(payload.sourceSignals)
        : [`Executed action: ${transition.step.action.name}`],
      observedAction: {
        name: transition.step.action.name,
        kind: transition.step.action.kind,
        resultingStateId: transition.resultingStateId,
      },
    });
    if (flows.length >= Math.max(desiredCount + 1, 3)) break;
  }
  return flows;
}

async function requestPlanningJson(options) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestStructuredJson(options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function enhanceInsightsWithAi({ inspection, approvedFlows, report, baseInsights, generatedTests = [], aiConfig }) {
  const normalized = normalizeAiConfig(aiConfig);

  if (!normalized.enabled) {
    if (!isExplicitBaseline(aiConfig)) {
      throw new Error("AI-first pipeline stopped during result interpretation: no model is configured.");
    }
    return {
      insights: {
        ...baseInsights,
        ai: buildAiMetadata(normalized, "heuristic-only"),
      },
      usedModel: false,
    };
  }

  const compactContext = {
    project: inspection.project,
    synopsis: inspection.projectSynopsis,
    detection: inspection.detection,
    approvedFlows: approvedFlows.map((flow) => ({
      title: flow.title,
      confidence: flow.confidence,
      criteriaText: flow.criteriaText,
    })),
    reportSummary: report.summary,
    reportTests: report.tests.map((test) => ({
      title: test.title,
      status: test.status,
      durationMs: test.durationMs,
      error: test.error || "",
    })),
    exploration: {
      status: inspection.liveExploration?.status || "unknown",
      modelGuided: inspection.liveExploration?.agenticExploration?.usedModel === true,
      completedActions: inspection.liveExploration?.agenticExploration?.metrics?.completedActions || 0,
      observedStates: inspection.liveExploration?.agenticExploration?.metrics?.uniqueStates || 0,
    },
    generationModes: generatedTests.map((test) => test.generationMode).filter(Boolean),
    objectiveInsights: baseInsights,
  };

  try {
    let aiPayload;
    let validationFeedback = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      aiPayload = await requestStructuredJson({
        aiConfig: normalized,
        systemPrompt: [
          "You are a technical analyst for an experimental E2E testing pipeline.",
          "You will receive objective execution facts and an objective local summary.",
          "Do not call AI-derived tests heuristic, baseline, fallback, generic smoke tests, or deterministic QA output.",
          "Do not claim exploration was absent when exploration.status is completed.",
          validationFeedback ? `Your previous response was rejected: ${validationFeedback} Correct that contradiction.` : "",
          "Your response must be raw, objective JSON with no exaggerated conclusions.",
          "Respond in this format:",
          '{"overview":"...","insights":["..."],"limitations":["..."],"nextSteps":["..."]}',
        ].filter(Boolean).join(" "),
        userPrompt: JSON.stringify(compactContext, null, 2),
        timeoutMs: 120000,
      });

      try {
        validateInsightPayload(aiPayload, compactContext);
        break;
      } catch (error) {
        if (attempt === 1) throw error;
        validationFeedback = error.message;
      }
    }

    return {
      insights: {
        overview: sanitizeText(aiPayload.overview) || baseInsights.overview,
        insights: uniqueStrings([
          ...sanitizeStringArray(aiPayload.insights),
          ...baseInsights.insights,
        ]),
        limitations: uniqueStrings([
          ...baseInsights.limitations,
          ...sanitizeStringArray(aiPayload.limitations),
        ]),
        nextSteps: uniqueStrings([
          ...sanitizeStringArray(aiPayload.nextSteps),
          ...baseInsights.nextSteps,
        ]),
        ai: buildAiMetadata(normalized, "insight-enrichment"),
      },
      usedModel: true,
    };
  } catch (error) {
    throw new Error(`AI-first pipeline stopped during result interpretation: ${error.message}`);
  }
}

function validateInsightPayload(payload, context) {
  const semanticText = [
    payload?.overview,
    ...(Array.isArray(payload?.insights) ? payload.insights : []),
    ...(Array.isArray(payload?.limitations) ? payload.limitations : []),
    ...(Array.isArray(payload?.nextSteps) ? payload.nextSteps : []),
  ].map(sanitizeText).join(" ");
  const hasAiDerivedTests = (context?.generationModes || []).some((mode) =>
    ["model-assisted", "model-journey-compiled", "model-assisted-structured"].includes(mode)
  );
  const completedModelExploration = context?.exploration?.status === "completed" && context?.exploration?.modelGuided;

  const contradictsAiProvenance = /\b(?:heuristic|deterministic)(?:\s+\w+){0,2}\s+(?:fallback|generation|tests?)\b|\b(?:baseline|fallback)\s+(?:flow|journey|generation|tests?)\b/i.test(semanticText);
  if (hasAiDerivedTests && contradictsAiProvenance) {
    throw new Error("The model contradicted test provenance in its result interpretation.");
  }
  const deniesCompletedExploration = /\b(?:live\s+|interface\s+)?exploration\s+(?:(?:was|is)\s+)?(?:null|absent|missing|unavailable|not\s+(?:available|performed|completed)|did\s+not\s+occur|cannot\s+be\s+confirmed)\b|\b(?:no|without)\s+(?:live\s+|interface\s+)?exploration\b/i.test(semanticText);
  if (completedModelExploration && deniesCompletedExploration) {
    throw new Error("The model contradicted the recorded completed live exploration.");
  }

  return true;
}

function mergeAiFlows(baseFlows, aiFlowsRaw, liveExploration = null, inspection = null) {
  const aiFlows = Array.isArray(aiFlowsRaw) ? aiFlowsRaw : [];
  const baseFlowMap = new Map((baseFlows || []).map((flow) => [flow.id, flow]));
  const explorationStates = liveExploration?.agenticExploration?.states || [];
  const explorationSteps = liveExploration?.agenticExploration?.steps || [];
  const knownStateIds = new Set(explorationStates.map((state) => state.id));
  const merged = [];
  const acceptedJourneys = new Set();

  for (const [index, aiFlow] of aiFlows.slice(0, 6).entries()) {
    if (!aiFlow || typeof aiFlow !== "object") {
      continue;
    }
    const requestedId = sanitizeFlowId(aiFlow.id || aiFlow.title || `model-flow-${index + 1}`);
    const baseFlow = baseFlowMap.get(requestedId);
    const criteria = normalizeCriteria(aiFlow.criteria);
    const title = sanitizeText(aiFlow.title) || baseFlow?.title || `Observed journey ${index + 1}`;
    if (!criteria.length || !title) {
      continue;
    }
    const semanticText = [
      title,
      aiFlow.summary,
      ...criteria.flatMap((criterion) => [criterion.title, criterion.given, criterion.when, criterion.then]),
    ].join(" ");
    if (/password|api\s*key|access\s*token|credential|secret|senha|chave\s+de\s+api|save key and connect|submit(?:ted)?\s+(?:the\s+)?(?:form|credentials?)|\bscroll(?:s|ed|ing)?\b|\brolar\b/i.test(semanticText)) {
      continue;
    }
    const evidenceStateIds = sanitizeStringArray(aiFlow.evidenceStateIds)
      .map(normalizeEvidenceStateId)
      .filter((id) => knownStateIds.has(id));
    if (!evidenceStateIds.length) {
      continue;
    }
    const terminalStateId = evidenceStateIds.at(-1);
    const terminalState = explorationStates.find((state) => state.id === terminalStateId);
    const enteringSteps = explorationSteps.filter((step) => step.status === "completed" && step.afterFingerprint === terminalState?.fingerprint);
    const contractedStep = enteringSteps.find((step) => (
      aiFlow.observedAction?.resultingStateId === terminalStateId
        && sanitizeText(aiFlow.observedAction?.kind) === sanitizeText(step.action?.kind)
        && sanitizeText(aiFlow.observedAction?.name) === sanitizeText(step.action?.name)
    ));
    const enteringStep = contractedStep || enteringSteps.find((step) => flowMatchesEnteringAction(semanticText, step)) || enteringSteps[0];
    if (!flowGroundedInCitedEvidence({ title, criteria, evidenceStateIds, explorationStates, explorationSteps, inspection })) {
      continue;
    }
    if (terminalStateId !== "state-1" && !contractedStep && !flowMatchesEnteringAction(semanticText, enteringStep)) {
      continue;
    }
    const journeyKey = `${terminalStateId}|${semanticActionKey(enteringStep?.action) || sanitizeFlowId(title)}`;
    if (acceptedJourneys.has(journeyKey)) continue;
    acceptedJourneys.add(journeyKey);
    const assumptions = sanitizeStringArray(aiFlow.assumptions).length ? sanitizeStringArray(aiFlow.assumptions) : (baseFlow?.assumptions || []);
    merged.push({
      ...(baseFlow || {}),
      id: requestedId || `model-flow-${index + 1}`,
      title,
      summary: sanitizeText(aiFlow.summary) || baseFlow?.summary || title,
      confidence: calibrateFlowConfidence({ requested: aiFlow.confidence, assumptions, criteria, enteringStep }),
      sourceSignals: sanitizeStringArray(aiFlow.sourceSignals).length ? sanitizeStringArray(aiFlow.sourceSignals) : (baseFlow?.sourceSignals || []),
      assumptions,
      evidenceStateIds,
      criteria,
      blueprint: evidenceStateIds.length
        ? {
            kind: "model-observed-journey",
            evidenceStateIds,
            baselineBlueprint: baseFlow?.blueprint || null,
          }
        : (baseFlow?.blueprint || null),
    });
  }

  return uniqueFlows(merged);
}

function deriveCoverageTargets(states, steps) {
  const seen = new Set();
  return (steps || []).flatMap((step) => {
    const key = semanticActionKey(step.action);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: `coverage-${seen.size}`,
      action: sanitizeText(step.action?.name),
      kind: sanitizeText(step.action?.kind),
      resultingStateId: step.afterStateId || findStateIdByFingerprint(states, step.afterFingerprint),
      changed: Boolean(step.changed),
    }];
  }).slice(0, 12);
}

function measureFlowCoverage(flows, targets, steps, states) {
  const covered = [];
  for (const target of targets) {
    const matchingStep = (steps || []).find((step) => semanticActionKey(step.action) === semanticActionKey({ kind: target.kind, name: target.action }));
    const matched = (flows || []).some((flow) => {
      const text = `${flow.title} ${flow.summary} ${(flow.sourceSignals || []).join(" ")} ${(flow.criteria || []).map((item) => `${item.when} ${item.then}`).join(" ")}`;
      return flow.evidenceStateIds?.includes(target.resultingStateId)
        && (!matchingStep || flowMatchesEnteringAction(text, matchingStep));
    });
    if (matched) covered.push(target.id);
  }
  const coveredSet = new Set(covered);
  return {
    observedOpportunities: targets,
    coveredTargetIds: covered,
    uncoveredTargetIds: targets.filter((target) => !coveredSet.has(target.id)).map((target) => target.id),
    ratio: targets.length ? Number((covered.length / targets.length).toFixed(2)) : 1,
    method: "executed-action-opportunities",
  };
}

function semanticActionKey(action = {}) {
  const tokens = [...semanticTokens(`${action.context || ""} ${action.name || ""}`)].sort().join("-");
  return `${sanitizeText(action.kind).toLowerCase()}|${tokens}`;
}

function calibrateFlowConfidence({ requested, assumptions, criteria, enteringStep }) {
  const requestedConfidence = normalizeConfidence(requested, "medium");
  if (!enteringStep || (assumptions || []).length > 1) return "low";
  const evidenceCeiling = enteringStep.changed && !(assumptions || []).length && (criteria || []).length >= 2
    ? "high"
    : "medium";
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[requestedConfidence] <= rank[evidenceCeiling] ? requestedConfidence : evidenceCeiling;
}

function flowGroundedInCitedEvidence({ title, criteria, evidenceStateIds, explorationStates, explorationSteps, inspection }) {
  const citedStates = explorationStates.filter((state) => evidenceStateIds.includes(state.id));
  const citedFingerprints = new Set(citedStates.map((state) => state.fingerprint).filter(Boolean));
  const citedSteps = explorationSteps.filter((step) =>
    step.status === "completed" && citedFingerprints.has(step.afterFingerprint)
  );
  const evidenceText = [
    inspection?.project?.name,
    inspection?.projectSynopsis,
    ...(inspection?.uiHints?.headings || []).map((item) => item.text),
    ...citedStates.flatMap((state) => [
      state.title,
      state.path,
      state.visibleTextExcerpt,
      ...(state.headings || []),
      ...(state.buttons || []),
      ...(state.inputs || []),
      ...(state.links || []).map((link) => typeof link === "string" ? link : `${link.text || ""} ${link.href || ""}`),
    ]),
    ...citedSteps.flatMap((step) => [
      step.action?.name,
      step.rationale,
      step.expectedOutcome,
      step.observedAfter?.visibleTextExcerpt,
    ]),
  ].join(" ");
  const evidenceTokens = semanticTokens(evidenceText);
  const parts = [title, ...criteria.map((criterion) => `${criterion.title} ${criterion.given} ${criterion.when} ${criterion.then}`)];

  return parts.every((part) => {
    const tokens = semanticTokens(part);
    return tokens.size > 0 && [...tokens].some((token) => evidenceTokens.has(token));
  });
}

function normalizeEvidenceStateId(value) {
  const normalized = sanitizeText(value).toLowerCase().replace(/_/g, "-");
  const number = normalized.match(/(?:state-?)?(\d+)$/)?.[1];
  return number ? `state-${Number(number)}` : normalized;
}

function flowMatchesEnteringAction(flowText, enteringStep) {
  if (!enteringStep?.action?.name) return false;
  const actionText = `${enteringStep.action.name} ${enteringStep.rationale || ""} ${enteringStep.expectedOutcome || ""}`;
  const flowTokens = semanticTokens(flowText);
  const actionTokens = semanticTokens(actionText);
  return [...flowTokens].some((token) => actionTokens.has(token));
}

function semanticTokens(value) {
  const ignored = new Set([
    "user", "usuario", "application", "aplicacao", "interface", "page", "pagina", "button", "botao",
    "click", "clicks", "clicar", "open", "opens", "opened", "abrir", "abre", "view", "views", "navigate", "navigates", "navigated", "loads", "load", "carrega", "display", "displays", "displayed", "screen", "visible", "visivel", "should", "becomes",
    "given", "when", "then", "with", "from", "into", "their", "they", "that", "this", "para", "com",
    "uma", "the", "and", "item", "product", "produto",
  ]);
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return new Set(normalized.split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !ignored.has(token)).map((token) => token.slice(0, 7)));
}

function summarizeLiveExplorationForPrompt(liveExploration) {
  if (!liveExploration || liveExploration.status !== "completed") {
    return liveExploration
      ? {
          status: liveExploration.status,
          baseUrl: liveExploration.baseUrl || "",
          warnings: sanitizeStringArray(liveExploration.warnings),
          error: sanitizeText(liveExploration.error),
        }
      : null;
  }

  return {
    status: liveExploration.status,
    mode: liveExploration.mode,
    baseUrl: liveExploration.baseUrl,
    summary: liveExploration.summary,
    agenticExploration: liveExploration.agenticExploration
      ? {
          strategy: liveExploration.agenticExploration.strategy,
          usedModel: liveExploration.agenticExploration.usedModel,
          model: liveExploration.agenticExploration.model,
          status: liveExploration.agenticExploration.status,
          metrics: liveExploration.agenticExploration.metrics,
          states: (liveExploration.agenticExploration.states || []).slice(0, 20).map((state) => ({
            id: state.id,
            path: state.path,
            headings: sanitizeStringArray(state.headings),
            buttons: sanitizeStringArray(state.buttons),
            inputs: sanitizeStringArray(state.inputs),
            inputDetails: (state.inputDetails || []).slice(0, 10),
            dialogsCount: state.dialogsCount || 0,
            visibleTextExcerpt: sanitizeText(String(state.visibleTextExcerpt || "").slice(0, 140)),
            enteredByAction: findEnteringAction(liveExploration.agenticExploration.steps, state.fingerprint),
          })),
          completedActions: (liveExploration.agenticExploration.steps || [])
            .filter((step) => step.status === "completed")
            .slice(0, 20)
            .map((step) => ({
              step: step.step,
              action: step.action,
              rationale: sanitizeText(step.rationale),
              changed: Boolean(step.changed),
              observedAfter: step.observedAfter,
              resultingStateId: findStateIdByFingerprint(liveExploration.agenticExploration.states, step.afterFingerprint),
            })),
        }
      : null,
    routes: (liveExploration.routes || []).slice(0, 4).map((route) => ({
      path: route.path,
      title: route.title,
      headings: sanitizeStringArray(route.headings),
      buttons: (route.buttons || []).slice(0, 5).map((button) => button.text || button.id || button.dataTestId || "").filter(Boolean),
      links: (route.links || []).slice(0, 5).map((link) => ({
        text: sanitizeText(link.text),
        href: sanitizeText(link.href),
      })),
      inputs: (route.inputs || []).slice(0, 5).map((input) => ({
        label: sanitizeText(input.label),
        placeholder: sanitizeText(input.placeholder),
        name: sanitizeText(input.name),
        type: sanitizeText(input.type),
      })),
      formsCount: route.formsCount || 0,
      dialogsCount: route.dialogsCount || 0,
      canvasesCount: route.canvasesCount || 0,
      visibleTextExcerpt: sanitizeText(String(route.visibleTextExcerpt || "").slice(0, 180)),
    })),
    warnings: sanitizeStringArray(liveExploration.warnings),
  };
}

function findStateIdByFingerprint(states, fingerprint) {
  return (states || []).find((state) => state.fingerprint === fingerprint)?.id || "";
}

function findEnteringAction(steps, fingerprint) {
  const step = (steps || []).find((candidate) => candidate.status === "completed" && candidate.afterFingerprint === fingerprint);
  return step
    ? {
        name: sanitizeText(step.action?.name),
        kind: sanitizeText(step.action?.kind),
        rationale: sanitizeText(step.rationale),
      }
    : null;
}

function selectAiFlowCandidates(flows) {
  const ranked = [...(Array.isArray(flows) ? flows : [])]
    .sort((left, right) => scoreFlowCandidate(right) - scoreFlowCandidate(left));

  const output = [];
  const kinds = new Set();

  for (const flow of ranked) {
    const kind = flow?.blueprint?.kind || "generic";
    if (kinds.has(kind) && output.length >= 4) {
      continue;
    }

    output.push(flow);
    kinds.add(kind);

    if (output.length >= 6) {
      break;
    }
  }

  return output.length ? output : (flows || []).slice(0, 6);
}

function scoreFlowCandidate(flow) {
  const confidenceWeight = {
    high: 30,
    medium: 18,
    low: 8,
  };

  const kindWeight = {
    "live-route": 24,
    "live-form": 22,
    navigation: 18,
    "safe-actions": 16,
    render: 14,
    "form-validation": 14,
    "tool-switch": 14,
    "canvas-smoke": 12,
    "auth-presence": 12,
  };

  const kind = flow?.blueprint?.kind || "";
  const signalCount = Array.isArray(flow?.sourceSignals) ? Math.min(flow.sourceSignals.length, 3) : 0;
  return (confidenceWeight[flow?.confidence] || 0) + (kindWeight[kind] || 10) + signalCount;
}

function summarizeBlueprintForPrompt(blueprint) {
  if (!blueprint) {
    return null;
  }

  const summary = {
    kind: blueprint.kind || "",
  };

  if (blueprint.heading?.text) {
    summary.heading = blueprint.heading.text;
  }

  if (blueprint.routePath) {
    summary.routePath = blueprint.routePath;
  }

  if (blueprint.expectedHeading) {
    summary.expectedHeading = blueprint.expectedHeading;
  }

  if (Array.isArray(blueprint.buttons)) {
    summary.buttons = blueprint.buttons
      .map((button) => button.text || button.id || button.dataTool || "")
      .filter(Boolean)
      .slice(0, 4);
  }

  if (Array.isArray(blueprint.toolButtons)) {
    summary.toolButtons = blueprint.toolButtons
      .map((button) => button.text || button.id || button.dataTool || "")
      .filter(Boolean)
      .slice(0, 4);
  }

  if (Array.isArray(blueprint.links)) {
    summary.links = blueprint.links
      .map((link) => link.text || link.href || "")
      .filter(Boolean)
      .slice(0, 4);
  }

  if (Array.isArray(blueprint.inputs)) {
    summary.inputs = blueprint.inputs
      .map((input) => input.label || input.placeholder || input.name || input.type || "")
      .filter(Boolean)
      .slice(0, 4);
  }

  if (Array.isArray(blueprint.actionHints)) {
    summary.actionHints = blueprint.actionHints.slice(0, 4);
  }

  if (blueprint.submitButton) {
    summary.submitButton = blueprint.submitButton.text || blueprint.submitButton.id || blueprint.submitButton.dataTool || "";
  }

  return summary;
}

function normalizeCriteria(criteriaRaw) {
  if (!Array.isArray(criteriaRaw)) {
    return [];
  }

  return criteriaRaw
    .map((criterion) => ({
      title: sanitizeText(criterion?.title),
      given: sanitizeText(criterion?.given),
      when: sanitizeText(criterion?.when),
      then: sanitizeText(criterion?.then),
    }))
    .filter((criterion) => criterion.title && criterion.given && criterion.when && criterion.then)
    .slice(0, 6);
}

function sanitizeFlowId(value) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function uniqueFlows(flows) {
  const seen = new Set();
  return flows.filter((flow) => {
    if (!flow.id || seen.has(flow.id)) return false;
    seen.add(flow.id);
    return true;
  });
}

function buildAiMetadata(normalized, stage) {
  return {
    provider: normalized.provider,
    model: normalized.model || "",
    endpoint: normalized.endpoint || "",
    label: normalized.label,
    stage,
  };
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeText(item))
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeConfidence(candidate, fallback) {
  const value = String(candidate || "").toLowerCase();
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return fallback;
}

function uniqueStrings(items) {
  const output = [];
  for (const item of items || []) {
    const normalized = sanitizeText(item);
    if (normalized && !output.includes(normalized)) {
      output.push(normalized);
    }
  }
  return output;
}

function choosePlanSummary(candidate, fallback, projectSynopsis) {
  const normalizedCandidate = sanitizeText(candidate);
  const normalizedSynopsis = sanitizeText(projectSynopsis);

  if (!normalizedCandidate) {
    return fallback;
  }

  if (normalizedCandidate === normalizedSynopsis) {
    return fallback;
  }

  if (normalizedCandidate.length < 32) {
    return fallback;
  }

  return normalizedCandidate;
}

module.exports = {
  authorFlowsPerObservedTransition,
  calibrateFlowConfidence,
  deriveCoverageTargets,
  enhanceInspectionWithAi,
  enhanceFlowPlanWithAi,
  enhanceInsightsWithAi,
  validateInsightPayload,
  mergeAiFlows,
  measureFlowCoverage,
  summarizeLiveExplorationForPrompt,
};
