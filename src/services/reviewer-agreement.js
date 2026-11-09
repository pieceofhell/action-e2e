// Agreement between independent human reviewers of defect hypotheses. Only items labeled by both reviewers enter
// the statistic; one-sided items stay listed so the denominator is never silently reduced.
function validateLabels(file, name) {
  if (!file || !Array.isArray(file.labels) || !file.reviewer) throw new Error(`${name} must contain reviewer and labels[].`);
  const seen = new Set();
  for (const item of file.labels) {
    if (!item.id || seen.has(item.id)) throw new Error(`${name} has a missing or duplicated item id.`);
    seen.add(item.id);
  }
  return file;
}

function cohensKappa(pairs) {
  const categories = [...new Set(pairs.flatMap(([a, b]) => [a, b]))].sort();
  const n = pairs.length;
  if (!n) return { n: 0, categories, observed: null, expected: null, kappa: null, confusion: {} };
  const confusion = Object.fromEntries(categories.map(a => [a, Object.fromEntries(categories.map(b => [b, 0]))]));
  for (const [a, b] of pairs) confusion[a][b] += 1;
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  const expected = categories.reduce((sum, category) => sum
    + (pairs.filter(([a]) => a === category).length / n) * (pairs.filter(([, b]) => b === category).length / n), 0);
  // With a single shared category, chance agreement is 1 and kappa is undefined, not perfect.
  const kappa = expected === 1 ? null : (observed - expected) / (1 - expected);
  return { n, categories, observed, expected, kappa, confusion };
}

function interpretKappa(kappa) {
  if (kappa === null) return "indefinido (sem variação suficiente entre categorias)";
  if (kappa < 0) return "pior que o acaso";
  if (kappa <= 0.2) return "leve";
  if (kappa <= 0.4) return "razoável";
  if (kappa <= 0.6) return "moderada";
  if (kappa <= 0.8) return "substancial";
  return "quase perfeita";
}

function compareReviewers(first, second) {
  validateLabels(first, "first reviewer"); validateLabels(second, "second reviewer");
  if (first.reviewer === second.reviewer) throw new Error("Agreement requires two different reviewers.");
  const pending = label => label === undefined || label === null || label === "";
  const byId = new Map(second.labels.map(item => [item.id, item]));
  const pairs = []; const disagreements = []; const onlyOne = [];
  for (const item of first.labels) {
    const other = byId.get(item.id);
    if (!other || pending(item.label) || pending(other.label)) { onlyOne.push(item.id); continue; }
    pairs.push([item.label, other.label]);
    if (item.label !== other.label) disagreements.push({ id: item.id, [first.reviewer]: item.label, [second.reviewer]: other.label,
      justifications: [item.justification || "", other.justification || ""] });
  }
  for (const item of second.labels) if (!first.labels.some(candidate => candidate.id === item.id)) onlyOne.push(item.id);
  const stats = cohensKappa(pairs);
  return { reviewers: [first.reviewer, second.reviewer], ...stats, interpretation: interpretKappa(stats.kappa), disagreements, unpaired: onlyOne };
}

// Blind template: hypotheses without model verdicts, so reviewers do not anchor on the AI classification.
function buildTemplate(exploration, runId, reviewer = "") {
  const discovery = exploration?.bugDiscovery || {};
  const items = [...(discovery.hypotheses || []).map(item => ({ ...item, origin: "retained" })),
    ...(discovery.rejectedHypotheses || []).map(item => ({ ...item, origin: "rejected" }))];
  return {
    reviewer, runId, instructions: "Rotule cada item sem consultar outro avaliador. Categorias sugeridas: defeito-confirmado, nao-sustentado, inconclusivo. Justifique com a evidência citada.",
    labels: items.map((item, index) => ({
      id: `${runId}#${item.id || index + 1}`,
      summary: item.title || item.summary || item.description || "",
      observedFacts: (item.claim || item).observed?.facts || item.observedFacts || item.facts || [],
      inferredExpectation: (item.claim || item).expected?.result || item.inferredExpectation || item.expectation || "",
      label: "", justification: "",
    })),
  };
}

module.exports = { cohensKappa, interpretKappa, compareReviewers, buildTemplate };
