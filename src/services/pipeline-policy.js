const { normalizeAiConfig } = require("./llm-provider");

function isBaselineModeEnabled() {
  return process.env.E2P_ENABLE_BASELINE_MODE === "1";
}

function isExplicitBaseline(aiConfig) {
  return isBaselineModeEnabled() && String(aiConfig?.provider || "") === "heuristic";
}

function requireAiForStage(aiConfig, stage) {
  const normalized = normalizeAiConfig(aiConfig);
  if (normalized.enabled || isExplicitBaseline(aiConfig)) {
    return normalized;
  }

  throw new Error(
    `AI-first pipeline stopped during ${stage}: select an available model, endpoint, and required credentials before continuing.`
  );
}

function requireCompletedAiExploration(inspection, stage = "the next pipeline stage") {
  const live = inspection?.liveExploration;
  const agent = live?.agenticExploration;

  if (live?.status !== "completed") {
    throw new Error(`AI-first pipeline stopped before ${stage}: live interface exploration must complete successfully.`);
  }

  if (!agent?.usedModel || agent.status !== "completed") {
    throw new Error(`AI-first pipeline stopped before ${stage}: no completed model-guided exploration is available.`);
  }

  const failedActions = Number(agent.metrics?.failedActions || 0);
  const invalidDecisions = Number(agent.metrics?.invalidDecisions || 0);
  const completedActions = Number(agent.metrics?.completedActions || 0);
  if (failedActions || invalidDecisions) {
    throw new Error(
      `AI-first pipeline stopped before ${stage}: exploration recorded ${invalidDecisions} invalid model decision(s) and ${failedActions} failed action(s).`
    );
  }

  if (!completedActions) {
    throw new Error(`AI-first pipeline stopped before ${stage}: the model did not complete any interface action.`);
  }

  return agent;
}

module.exports = {
  isBaselineModeEnabled,
  isExplicitBaseline,
  requireAiForStage,
  requireCompletedAiExploration,
};
