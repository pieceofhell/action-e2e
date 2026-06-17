const { normalizeAiConfig, requestStructuredJson } = require("./llm-provider");

async function enhanceInspectionWithAi({ inspection, aiConfig }) {
  const normalized = normalizeAiConfig(aiConfig);

  if (!normalized.enabled) {
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
    return {
      inspection: {
        ...inspection,
        ai: {
          ...buildAiMetadata(normalized, "inspection-fallback"),
          error: error.message,
        },
        warnings: uniqueStrings([
          ...inspection.warnings,
          `Failed to query ${normalized.label} during inspection. The prototype fell back to heuristic reading.`,
        ]).slice(0, 12),
      },
      usedModel: false,
    };
  }
}

async function enhanceFlowPlanWithAi({ inspection, basePlan, aiConfig }) {
  const normalized = normalizeAiConfig(aiConfig);

  if (!normalized.enabled) {
    return {
      plan: {
        ...basePlan,
        mode: "heuristic",
        ai: buildAiMetadata(normalized, "heuristic-only"),
      },
      usedModel: false,
    };
  }

  const selectedCandidates = selectAiFlowCandidates(basePlan.flows);

  const compactContext = {
    project: inspection.project,
    synopsis: inspection.projectSynopsis,
    detection: inspection.detection,
    uiHints: {
      headings: inspection.uiHints.headings.slice(0, 5).map((item) => item.text),
      buttons: inspection.uiHints.buttons.slice(0, 8).map((item) => item.text || item.id || item.dataTool || ""),
      inputs: inspection.uiHints.inputs.slice(0, 6).map((item) => item.placeholder || item.id || item.name || item.type),
      links: inspection.uiHints.links.slice(0, 6).map((item) => item.text || item.href),
      hasCanvas: inspection.uiHints.canvases.length > 0,
    },
    liveExploration: summarizeLiveExplorationForPrompt(inspection.liveExploration),
    candidates: selectedCandidates.map((flow) => ({
      id: flow.id,
      title: flow.title,
      confidence: flow.confidence,
      summary: flow.summary,
      sourceSignals: (flow.sourceSignals || []).slice(0, 3),
      assumptions: (flow.assumptions || []).slice(0, 2),
      blueprintHints: summarizeBlueprintForPrompt(flow.blueprint),
    })),
  };

  try {
    const aiPayload = await requestStructuredJson({
      aiConfig: normalized,
      systemPrompt: [
        "You are an E2E testing analyst authoring candidate user flows and acceptance criteria.",
        "You will receive a project summary, static interface hints, optional live interface exploration evidence, and heuristic candidate flows.",
        "Choose and refine the most valuable candidates without inventing pages, routes, buttons, or fields that are not supported by the evidence.",
        "You must preserve only ids that already exist in the candidate list.",
        "Do not reuse generic acceptance criteria text from the heuristic baseline. Write new, application-grounded criteria from scratch.",
        "Prefer distinct flows that cover different parts of the interface or different user intents.",
        "When live exploration exists, ground your criteria in observed headings, route paths, links, inputs, buttons, and visible text.",
        "When concrete labels are available, mention those labels in the criteria instead of generic wording.",
        "Return at most 5 flows. Each selected flow should contain 2 or 3 concrete criteria.",
        "Return raw JSON in this format:",
        '{"summary":"...","flows":[{"id":"...","title":"...","summary":"...","confidence":"high|medium|low","sourceSignals":["..."],"assumptions":["..."],"criteria":[{"title":"...","given":"...","when":"...","then":"..."}]}]}',
      ].join(" "),
      userPrompt: JSON.stringify(compactContext, null, 2),
      timeoutMs: 210000,
    });

    const mergedFlows = mergeAiFlows(basePlan.flows, aiPayload.flows);
    return {
      plan: {
        ...basePlan,
        mode: "ai-augmented",
        summary: choosePlanSummary(aiPayload.summary, basePlan.summary, inspection.projectSynopsis),
        flows: mergedFlows,
        ai: buildAiMetadata(normalized, inspection.liveExploration?.status === "completed" ? "flow-live-refinement" : "flow-refinement"),
      },
      usedModel: true,
    };
  } catch (error) {
    return {
      plan: {
        ...basePlan,
        mode: "heuristic-fallback",
        ai: {
          ...buildAiMetadata(normalized, "flow-fallback"),
          error: error.message,
        },
        summary: `${basePlan.summary} The query to ${normalized.label} failed, so the plan stayed on the local heuristic path.`,
      },
      usedModel: false,
    };
  }
}

async function enhanceInsightsWithAi({ inspection, approvedFlows, report, baseInsights, aiConfig }) {
  const normalized = normalizeAiConfig(aiConfig);

  if (!normalized.enabled) {
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
    heuristicInsights: baseInsights,
  };

  try {
    const aiPayload = await requestStructuredJson({
      aiConfig: normalized,
      systemPrompt: [
        "You are a technical analyst for an experimental E2E testing pipeline.",
        "You will receive a summarized execution report and a set of heuristic insights.",
        "Your response must be raw, objective JSON with no exaggerated conclusions.",
        "Respond in this format:",
        '{"overview":"...","insights":["..."],"limitations":["..."],"nextSteps":["..."]}',
      ].join(" "),
      userPrompt: JSON.stringify(compactContext, null, 2),
      timeoutMs: 120000,
    });

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
    return {
      insights: {
        ...baseInsights,
        ai: {
          ...buildAiMetadata(normalized, "insight-fallback"),
          error: error.message,
        },
      },
      usedModel: false,
    };
  }
}

function mergeAiFlows(baseFlows, aiFlowsRaw) {
  const aiFlows = Array.isArray(aiFlowsRaw) ? aiFlowsRaw : [];
  const aiFlowMap = new Map(
    aiFlows
      .filter((flow) => flow && typeof flow.id === "string")
      .map((flow) => [flow.id, flow])
  );

  const merged = [];

  for (const baseFlow of baseFlows) {
    if (!aiFlowMap.has(baseFlow.id)) {
      continue;
    }

    const aiFlow = aiFlowMap.get(baseFlow.id);
    merged.push({
      ...baseFlow,
      title: sanitizeText(aiFlow.title) || baseFlow.title,
      summary: sanitizeText(aiFlow.summary) || baseFlow.summary,
      confidence: normalizeConfidence(aiFlow.confidence, baseFlow.confidence),
      sourceSignals: sanitizeStringArray(aiFlow.sourceSignals).length ? sanitizeStringArray(aiFlow.sourceSignals) : baseFlow.sourceSignals,
      assumptions: sanitizeStringArray(aiFlow.assumptions).length ? sanitizeStringArray(aiFlow.assumptions) : baseFlow.assumptions,
      criteria: normalizeCriteria(aiFlow.criteria).length ? normalizeCriteria(aiFlow.criteria) : baseFlow.criteria,
    });
  }

  return merged.length ? merged : baseFlows;
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
      visibleTextExcerpt: sanitizeText(String(route.visibleTextExcerpt || "").slice(0, 280)),
    })),
    warnings: sanitizeStringArray(liveExploration.warnings),
  };
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
  enhanceInspectionWithAi,
  enhanceFlowPlanWithAi,
  enhanceInsightsWithAi,
};
