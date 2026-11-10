// Evaluator-owned function × execution matrix. Read-only over recorded runs: it never calls a model, never starts a
// target, and never upgrades a level without a cited step/state. "Not available" is kept distinct from "no".
const LEVELS = ["not-attempted", "attempted", "exercised", "verified"];

function validateReference(reference) {
  if (!reference || reference.schemaVersion !== 1 || !reference.targets || typeof reference.targets !== "object") {
    throw new Error("Reference functions must have schemaVersion 1 and a targets object.");
  }
  for (const [targetId, target] of Object.entries(reference.targets)) {
    if (!Array.isArray(target.functions) || !target.functions.length) throw new Error(`Target ${targetId} has no functions.`);
    const ids = new Set();
    for (const fn of target.functions) {
      if (!fn.id || ids.has(fn.id)) throw new Error(`Target ${targetId} has a missing or duplicated function id.`);
      ids.add(fn.id);
      if (!Array.isArray(fn.match) || !fn.match.length) throw new Error(`Function ${targetId}/${fn.id} needs at least one matcher.`);
      for (const matcher of fn.match) {
        if (!matcher.kind && !matcher.descriptor) throw new Error(`Function ${targetId}/${fn.id} has an empty matcher.`);
        if (matcher.descriptor) new RegExp(matcher.descriptor, "i");
      }
      if (fn.effect) new RegExp(fn.effect, "i");
    }
  }
  return reference;
}

// One searchable descriptor per action, combining accessible names with stable DOM identifiers ("#prev").
function actionDescriptor(action = {}) {
  return [
    `${action.kind || ""} ${action.name || ""}`,
    action.accessibleName, action.label, action.placeholder, action.context, action.testId,
    action.domId ? `#${action.domId}` : "", action.visualSelector, action.nameAttribute,
  ].filter(Boolean).join(" | ").toLowerCase();
}

function matches(matcher, action) {
  if (matcher.kind && !new RegExp(`^(?:${matcher.kind})$`, "i").test(String(action.kind || ""))) return false;
  if (matcher.descriptor && !new RegExp(matcher.descriptor, "i").test(actionDescriptor(action))) return false;
  return true;
}

function stateText(step, statesById) {
  const state = statesById.get(step.afterStateId) || step.observedAfter || {};
  return [state.title, state.visibleTextExcerpt, ...(state.headings || []), ...(state.buttons || []),
    ...(state.inputDetails || []).map(item => item.value)].filter(Boolean).join(" \n ");
}

function resolveTarget(reference, runId, explicitTarget) {
  if (explicitTarget) return reference.targets[explicitTarget] ? explicitTarget : null;
  const prefix = String(runId || "").replace(/-\d{4}-\d{2}-\d{2}T.*$/, "").toLowerCase();
  return Object.entries(reference.targets).find(([id, target]) => [id, ...(target.aliases || [])]
    .some(alias => alias.toLowerCase() === prefix))?.[0] || null;
}

// tests: array of { file, source } from the run's generated specs, or null when the run has no generated tests.
function evaluateRun({ reference, runId, exploration, tests = null, targetId = null }) {
  const target = resolveTarget(reference, runId, targetId);
  if (!target) return { runId, target: null, error: "No reference target matches this run." };
  const agentic = exploration?.agenticExploration || {};
  const steps = Array.isArray(agentic.steps) ? agentic.steps : [];
  const statesById = new Map((agentic.states || []).map(state => [state.id, state]));
  const functions = reference.targets[target].functions.map(fn => {
    const matched = steps.filter(step => fn.match.some(matcher => matches(matcher, step.action || {})));
    const exercised = matched.filter((step) => {
      if (step.status !== "completed") return false;
      if (fn.requireChange !== false && step.changed !== true) return false;
      // Legacy references describe actions. A reload and prior arbitrary UI change do not prove restoration.
      if (!fn.effect || fn.requiresPriorChange || !statesById.has(step.beforeStateId) || !statesById.has(step.afterStateId)) return false;
      const effect = new RegExp(fn.effect, 'i');
      const beforeText = stateText({ afterStateId: step.beforeStateId }, statesById);
      return !effect.test(beforeText) && effect.test(stateText(step, statesById));
    });
    const level = exercised.length ? "exercised" : matched.length ? "attempted" : "not-attempted";
    return {
      id: fn.id, label: fn.label || fn.id, level,
      attemptedSteps: matched.map(step => step.step),
      exercisedSteps: exercised.map(step => ({ step: step.step, beforeStateId: step.beforeStateId || null, afterStateId: step.afterStateId || null })),
      verified: null, verifiedBy: [],
    };
  });
  const count = level => functions.filter(fn => LEVELS.indexOf(fn.level) >= LEVELS.indexOf(level)).length;
  return {
    runId, target, model: agentic.model || null, status: agentic.status || exploration?.status || null,
    actions: steps.filter(step => step.status === 'completed').length, testsAvailable: tests !== null,
    totals: { functions: functions.length, attempted: count("attempted"), exercised: count("exercised"),
      verified: null },
    functions,
  };
}

function aggregateByTarget(reference, runs) {
  return Object.entries(reference.targets).map(([targetId, target]) => {
    const targetRuns = runs.filter(run => run.target === targetId);
    return {
      target: targetId, runs: targetRuns.length,
      functions: target.functions.map(fn => {
        const levels = targetRuns.map(run => run.functions.find(item => item.id === fn.id)?.level || "not-attempted");
        return { id: fn.id, label: fn.label || fn.id, levels,
          exercisedIn: levels.filter(level => LEVELS.indexOf(level) >= LEVELS.indexOf("exercised")).length };
      }),
    };
  });
}

module.exports = { LEVELS, validateReference, actionDescriptor, resolveTarget, evaluateRun, aggregateByTarget };
