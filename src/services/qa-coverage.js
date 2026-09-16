const crypto = require("node:crypto");

const PRIORITY_WEIGHT = { high: 30, medium: 18, low: 8 };

function buildQaCoveragePlan({ inspection = {}, initialObservation = {} } = {}) {
  const actions = (initialObservation.actions || []).filter((action) => action.safe);
  const corpus = buildProjectCorpus(inspection, initialObservation);
  const goals = [];

  if (actions.some((action) => action.kind === "fill")) {
    goals.push(createGoal({
      id: "input-interaction",
      title: "Exercise a primary input",
      category: "interaction",
      priority: "high",
      requiredActionKinds: ["fill"],
      rationale: "The rendered interface exposes a writable field whose main behavior should be observed.",
    }));
  }

  if (actions.some((action) => action.kind === "press")) {
    goals.push(createGoal({
      id: "input-commit",
      title: "Commit an input-driven interaction",
      category: "interaction",
      priority: "high",
      requiredActionKinds: ["fill", "press"],
      rationale: "The interface exposes an Enter action, so filling without committing would leave the core transition untested.",
    }));
  }

  if (actions.some((action) => action.kind === "select")) {
    goals.push(createGoal({
      id: "selection-variation",
      title: "Exercise a selectable variation",
      category: "interaction",
      priority: "medium",
      requiredActionKinds: ["select"],
      rationale: "At least one selectable configuration or filter is visible.",
    }));
  }

  if (actions.some((action) => action.kind === "click")) {
    goals.push(createGoal({
      id: "primary-activation",
      title: "Exercise a primary visible action",
      category: "interaction",
      priority: "high",
      requiredActionKinds: ["click"],
      rationale: "The page exposes a safe button, link, or visual action.",
    }));
  }

  if (actions.some((action) => action.role === "link" && action.sameOrigin !== false)) {
    goals.push(createGoal({
      id: "same-origin-navigation",
      title: "Follow an internal navigation path",
      category: "navigation",
      priority: "medium",
      requiredActionKinds: ["click"],
      roleHints: ["link"],
      rationale: "An internal link can reveal a distinct route or state.",
    }));
  }

  if (/\b(?:modal|dialog|drawer|overlay|toggle|open|close|show|hide)\b/i.test(corpus)) {
    goals.push(createGoal({
      id: "overlay-lifecycle",
      title: "Exercise an open/close interface lifecycle",
      category: "lifecycle",
      priority: "medium",
      requiredActionKinds: ["click"],
      keywordHints: ["modal", "dialog", "toggle", "open", "close", "show", "hide"],
      rationale: "The project or rendered interface contains an overlay or visibility lifecycle.",
    }));
  }

  if (/\b(?:required|minlength|maxlength|pattern|validat(?:e|ion)|invalid|error-message)\b/i.test(corpus)) {
    goals.push(createGoal({
      id: "validation-boundary",
      title: "Probe an input boundary",
      category: "boundary",
      priority: "high",
      requiredActionKinds: ["fill"],
      requiresBoundaryProbe: true,
      rationale: "Static or rendered evidence indicates validation or an explicit input boundary.",
    }));
  }

  if (/\b(?:setinterval|settimeout|countdown|timer|time\s+left|game\s+over|time\s+ran\s+out|deadline)\b/i.test(corpus)) {
    goals.push(createGoal({
      id: "temporal-boundary",
      title: "Observe a time-dependent boundary",
      category: "temporal",
      priority: "high",
      requiredActionKinds: ["wait"],
      rationale: "The project contains a timer or lifecycle whose boundary cannot be covered by instantaneous clicks alone.",
    }));
  }

  if (/\b(?:localstorage|sessionstorage|indexeddb|persist(?:ed|ence|ent)|saved\s+state)\b/i.test(corpus)) {
    goals.push(createGoal({
      id: "persistence-reload",
      title: "Verify state across a reload",
      category: "persistence",
      priority: "high",
      requiredActionKinds: ["reload"],
      rationale: "The source or documentation indicates browser-persisted state.",
    }));
  }

  if (/\b(?:score|total|price|amount|balance|counter|quantity|subtotal|percent(?:age)?)\b/i.test(corpus)) {
    goals.push(createGoal({
      id: "calculated-state",
      title: "Exercise a calculated state transition",
      category: "calculation",
      priority: "high",
      requiredActionKinds: ["click", "fill", "select"],
      anyActionKind: true,
      requiresNumericChange: true,
      rationale: "The interface or source contains a calculated score, total, counter, or amount.",
    }));
  }

  return {
    version: 1,
    generatedFrom: {
      appType: String(inspection.detection?.appType || "unknown"),
      staticFilesConsidered: Math.min(8, inspection.relevantFiles?.length || 0),
      initialSafeActions: actions.length,
    },
    goals: deduplicateGoals(goals),
  };
}

function evaluateQaCoverage(plan, { steps = [], states = [] } = {}) {
  const completed = steps.filter((step) => step.status === "completed");
  const completedKinds = new Set(completed.map((step) => step.action?.kind).filter(Boolean));
  const stateById = new Map(states.map((state) => [state.id, state]));
  const evaluatedGoals = (plan?.goals || []).map((goal) => {
    const matchedSteps = completed.filter((step) => stepMatchesGoal(step, goal));
    const kindCoverage = goal.requiredActionKinds.map((kind) => ({ kind, covered: completedKinds.has(kind) }));
    let covered = goal.anyActionKind
      ? matchedSteps.length > 0
      : kindCoverage.every((entry) => entry.covered);

    if (goal.requiresBoundaryProbe) {
      covered = completed.some((step) => step.action?.kind === "fill" && step.action?.boundaryProbe);
    }
    if (goal.requiresNumericChange) {
      covered = completed.some((step) => hasNumericStateChange(step, stateById));
    }
    if (goal.category === "navigation") {
      covered = completed.some((step) => step.action?.role === "link" && didPathChange(step, stateById));
    }
    if (goal.id === "overlay-lifecycle") {
      covered = completed.some((step) => matchedSteps.includes(step) && step.changed);
    }

    const partial = !covered && (
      matchedSteps.length > 0
      || kindCoverage.some((entry) => entry.covered)
    );
    return {
      ...goal,
      status: covered ? "covered" : partial ? "partial" : "uncovered",
      evidence: matchedSteps.slice(0, 4).map((step) => ({
        step: step.step,
        action: step.action?.name || step.action?.kind || "",
        resultingStateId: step.afterStateId || "",
        changed: Boolean(step.changed),
      })),
    };
  });

  const covered = evaluatedGoals.filter((goal) => goal.status === "covered");
  const partial = evaluatedGoals.filter((goal) => goal.status === "partial");
  const uncovered = evaluatedGoals.filter((goal) => goal.status === "uncovered");
  const totalWeight = evaluatedGoals.reduce((sum, goal) => sum + (PRIORITY_WEIGHT[goal.priority] || 1), 0);
  const coveredWeight = evaluatedGoals.reduce((sum, goal) => {
    const weight = PRIORITY_WEIGHT[goal.priority] || 1;
    return sum + (goal.status === "covered" ? weight : goal.status === "partial" ? weight * 0.4 : 0);
  }, 0);

  return {
    version: plan?.version || 1,
    goals: evaluatedGoals,
    summary: {
      total: evaluatedGoals.length,
      covered: covered.length,
      partial: partial.length,
      uncovered: uncovered.length,
      highPriorityUncovered: uncovered.filter((goal) => goal.priority === "high").length,
      ratio: totalWeight ? Number((coveredWeight / totalWeight).toFixed(3)) : 1,
      coveredGoalIds: covered.map((goal) => goal.id),
      uncoveredGoalIds: uncovered.map((goal) => goal.id),
      riskAreas: [...new Set(uncovered.map((goal) => goal.category))],
    },
  };
}

function rankActionsByCoverage(actions, coverage) {
  const uncovered = (coverage?.goals || []).filter((goal) => goal.status !== "covered");
  return (actions || []).map((action, index) => {
    const matchedGoals = uncovered.filter((goal) => actionMatchesGoal(action, goal));
    const coverageScore = matchedGoals.reduce((sum, goal) => sum + (PRIORITY_WEIGHT[goal.priority] || 1), 0);
    return {
      ...action,
      coverageGoalIds: matchedGoals.map((goal) => goal.id),
      coverageScore,
      _originalIndex: index,
    };
  }).sort((left, right) => (
    right.coverageScore - left.coverageScore || left._originalIndex - right._originalIndex
  )).map(({ _originalIndex, ...action }) => action);
}

function buildSyntheticCoverageActions(coverage, { current = {}, steps = [] } = {}) {
  const uncoveredIds = new Set((coverage?.goals || [])
    .filter((goal) => goal.status !== "covered")
    .map((goal) => goal.id));
  const actions = [];

  if (uncoveredIds.has("temporal-boundary") && !steps.some((step) => step.action?.kind === "wait")) {
    const durationMs = inferTemporalWaitMs(current.visibleTextExcerpt);
    actions.push({
      id: `e2p-observe-time-${durationMs}`,
      kind: "wait",
      role: "browser",
      name: `Observe the interface across its timer boundary (${Math.round(durationMs / 1000)}s)`,
      context: "Time-dependent coverage probe",
      durationMs,
      safe: true,
      inOverlay: Boolean(current.dialogsCount),
      coverageGoalIds: ["temporal-boundary"],
      coverageScore: PRIORITY_WEIGHT.high,
    });
  }

  const hasStateChangingAction = steps.some((step) => step.status === "completed" && step.changed && step.action?.kind !== "reload");
  if (uncoveredIds.has("persistence-reload") && hasStateChangingAction && !steps.some((step) => step.action?.kind === "reload")) {
    actions.push({
      id: "e2p-browser-reload",
      kind: "reload",
      role: "browser",
      name: "Reload the current page and compare persisted state",
      context: "Persistence coverage probe",
      safe: true,
      inOverlay: Boolean(current.dialogsCount),
      coverageGoalIds: ["persistence-reload"],
      coverageScore: PRIORITY_WEIGHT.high,
    });
  }

  return actions;
}

function actionableUncoveredGoals(actions) {
  return [...new Set((actions || []).flatMap((action) => action.coverageGoalIds || []))];
}

function createGoal(goal) {
  return {
    id: goal.id,
    title: goal.title,
    category: goal.category,
    priority: goal.priority,
    rationale: goal.rationale,
    requiredActionKinds: goal.requiredActionKinds || [],
    roleHints: goal.roleHints || [],
    keywordHints: goal.keywordHints || [],
    anyActionKind: Boolean(goal.anyActionKind),
    requiresBoundaryProbe: Boolean(goal.requiresBoundaryProbe),
    requiresNumericChange: Boolean(goal.requiresNumericChange),
  };
}

function actionMatchesGoal(action, goal) {
  if (!action || !goal) return false;
  const kindMatches = goal.requiredActionKinds.includes(action.kind);
  if (!kindMatches) return false;
  if (goal.roleHints?.length && !goal.roleHints.includes(action.role)) return false;
  if (goal.requiresBoundaryProbe && !action.boundaryProbe) return false;
  if (goal.keywordHints?.length) {
    const material = normalize(`${action.name || ""} ${action.context || ""}`);
    return goal.keywordHints.some((keyword) => material.includes(normalize(keyword)));
  }
  return true;
}

function stepMatchesGoal(step, goal) {
  if (!step?.action) return false;
  if (step.action.coverageGoalIds?.includes(goal.id)) return true;
  return actionMatchesGoal(step.action, goal);
}

function hasNumericStateChange(step, stateById) {
  if (!step.changed) return false;
  const before = stateById.get(step.beforeStateId)?.visibleTextExcerpt || "";
  const after = stateById.get(step.afterStateId)?.visibleTextExcerpt || step.observedAfter?.visibleTextExcerpt || "";
  const beforeNumbers = extractNumbers(before);
  const afterNumbers = extractNumbers(after);
  return beforeNumbers.length > 0 && afterNumbers.length > 0 && beforeNumbers.join("|") !== afterNumbers.join("|");
}

function didPathChange(step, stateById) {
  const before = stateById.get(step.beforeStateId)?.path || "";
  const after = stateById.get(step.afterStateId)?.path || step.observedAfter?.path || "";
  return Boolean(before && after && before !== after);
}

function inferTemporalWaitMs(text) {
  const match = String(text || "").match(/(?:time\s+left|remaining|restante)\s*:?\s*(\d{1,3})\s*s\b/i);
  if (!match) return 3000;
  return Math.max(1000, Math.min(12000, (Number(match[1]) + 1) * 1000));
}

function extractNumbers(value) {
  return (String(value || "").match(/-?\d+(?:[.,]\d+)?/g) || []).slice(0, 20);
}

function buildProjectCorpus(inspection, initialObservation) {
  return [
    inspection.project?.name,
    inspection.projectSynopsis,
    inspection.detection?.appType,
    ...(inspection.ai?.mainCapabilities || []),
    inspection.manifests?.readme?.excerpt,
    ...(inspection.relevantFiles || []).slice(0, 8).map((file) => file.excerpt),
    JSON.stringify(inspection.uiHints || {}),
    initialObservation.visibleTextExcerpt,
    JSON.stringify((initialObservation.actions || []).slice(0, 40)),
  ].filter(Boolean).join("\n");
}

function deduplicateGoals(goals) {
  const seen = new Set();
  return goals.filter((goal) => {
    const key = goal.id || crypto.createHash("sha1").update(JSON.stringify(goal)).digest("hex");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

module.exports = {
  actionableUncoveredGoals,
  buildQaCoveragePlan,
  buildSyntheticCoverageActions,
  evaluateQaCoverage,
  inferTemporalWaitMs,
  rankActionsByCoverage,
};
