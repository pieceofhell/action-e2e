function classifyHistoricalBugPair({ buggy, fixed }) {
  const buggyOutcome = normalizeOutcome(buggy);
  const fixedOutcome = normalizeOutcome(fixed);
  const confirmed = buggyOutcome === "failed" && fixedOutcome === "passed";

  let classification = "inconclusive";
  if (confirmed) classification = "historical-bug-reproduced";
  else if (buggyOutcome === "passed" && fixedOutcome === "passed") classification = "bug-not-detected";
  else if (buggyOutcome === "failed" && fixedOutcome === "failed") classification = "oracle-or-environment-failure";
  else if (buggyOutcome === "passed" && fixedOutcome === "failed") classification = "regression-or-invalid-oracle";

  return {
    confirmed,
    classification,
    buggyOutcome,
    fixedOutcome,
  };
}

function matchesDopaFavoritesGroundTruth(hypotheses) {
  const corpus = (Array.isArray(hypotheses) ? hypotheses : [])
    .map((hypothesis) => [
      hypothesis?.title,
      hypothesis?.observedEvidence,
      hypothesis?.expectedBehavior,
      hypothesis?.risk,
      hypothesis?.oracle,
    ].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();

  const mentionsFavorites = /favorit/.test(corpus);
  const mentionsTargetControl = /abrir meus favoritos|open (?:my )?favorites/.test(corpus);
  const identifiesSelfReference = /already (?:in|on)|same (?:view|page|tab)|self[- ]refer|redundan|unnecessar|inside the favorites|within the favorites|should (?:not|be hidden)|must (?:not|be hidden)|absent|hide the/.test(corpus);
  return mentionsFavorites && mentionsTargetControl && identifiesSelfReference;
}

function matchesToggleAllGroundTruth(hypotheses) {
  return (Array.isArray(hypotheses) ? hypotheses : []).some((hypothesis) => {
    const evidence = String(hypothesis?.observedEvidence || "").toLowerCase();
    const oracle = String(hypothesis?.oracle || "").toLowerCase();
    const combined = `${evidence} ${oracle}`;
    const mentionsControl = /checkbox|toggle/.test(combined);
    const mentionsState = /completed|completion|checked|active item/.test(combined);
    const explicitMismatch = /does not match|doesn't match|out of sync|unsynchron|mismatch|disagree|remain(?:ed|s)? checked while|checked despite|unchecked despite/.test(combined);
    return mentionsControl && mentionsState && explicitMismatch;
  });
}

function validateDopaFavoritesOraclePlan(plan) {
  const rawSteps = Array.isArray(plan?.steps) ? plan.steps : [];
  const steps = rawSteps.slice(0, 6).map((step) => ({
    action: String(step?.action || "").trim().toLowerCase(),
    role: String(step?.role || "").trim().toLowerCase(),
    name: String(step?.name || "").replace(/\s+/g, " ").trim(),
  }));
  const errors = [];
  const allowedActions = new Set(["click", "assert-absent"]);

  if (!steps.length) errors.push("The plan contains no steps.");
  if (steps.some((step) => !allowedActions.has(step.action))) errors.push("The plan contains an unsupported action.");
  if (steps.some((step) => step.role !== "button")) errors.push("Every step must target a button by accessible name.");
  if (!steps.some((step) => step.action === "click" && /^abrir favoritos$/i.test(step.name))) {
    errors.push("The plan must enter Favorites through the observed Abrir favoritos control.");
  }
  if (!steps.some((step) => step.action === "assert-absent" && /^abrir meus favoritos$/i.test(step.name))) {
    errors.push("The plan must assert that Abrir meus favoritos is absent in the Favorites view.");
  }

  return { valid: errors.length === 0, steps, errors };
}

function compileObservedJourneyWithOracle(journeySteps, oraclePlan) {
  const normalizeStep = (step) => ({
    action: String(step?.action || "").trim().toLowerCase(),
    role: String(step?.role || "").trim().toLowerCase(),
    name: String(step?.name || "").replace(/\s+/g, " ").trim(),
  });
  const combined = [
    ...(Array.isArray(journeySteps) ? journeySteps : []),
    ...(Array.isArray(oraclePlan?.steps) ? oraclePlan.steps : []),
  ].map(normalizeStep).filter((step) => step.action && step.role && step.name);
  const steps = combined.filter((step, index) => {
    const previous = combined[index - 1];
    return !previous
      || step.action !== previous.action
      || step.role !== previous.role
      || step.name.toLowerCase() !== previous.name.toLowerCase();
  }).slice(0, 10);

  return {
    title: String(oraclePlan?.title || "Model-authored defect oracle").trim(),
    steps,
  };
}

function normalizeOutcome(result) {
  if (result === true || result?.passed === true || result?.status === "passed") return "passed";
  if (result === false || result?.passed === false || result?.status === "failed") return "failed";
  return "unknown";
}

module.exports = {
  classifyHistoricalBugPair,
  compileObservedJourneyWithOracle,
  matchesDopaFavoritesGroundTruth,
  matchesToggleAllGroundTruth,
  validateDopaFavoritesOraclePlan,
};
