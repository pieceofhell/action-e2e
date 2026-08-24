const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyHistoricalBugPair,
  compileObservedJourneyWithOracle,
  matchesDopaFavoritesGroundTruth,
  matchesToggleAllGroundTruth,
  validateDopaFavoritesOraclePlan,
} = require("../src/services/bug-evaluator");

test("compiles a model-authored oracle with the grounded exploration journey", () => {
  const compiled = compileObservedJourneyWithOracle(
    [{ action: "click", role: "button", name: "Abrir favoritos" }],
    {
      title: "Redundant Favorites action",
      steps: [{ action: "assert-absent", role: "button", name: "Abrir meus favoritos" }],
    },
  );

  assert.deepEqual(compiled.steps, [
    { action: "click", role: "button", name: "Abrir favoritos" },
    { action: "assert-absent", role: "button", name: "Abrir meus favoritos" },
  ]);
  assert.equal(validateDopaFavoritesOraclePlan(compiled).valid, true);
});

test("confirms a historical bug only when the oracle fails before the fix and passes after it", () => {
  assert.deepEqual(
    classifyHistoricalBugPair({ buggy: { passed: false }, fixed: { passed: true } }),
    {
      confirmed: true,
      classification: "historical-bug-reproduced",
      buggyOutcome: "failed",
      fixedOutcome: "passed",
    },
  );

  assert.equal(
    classifyHistoricalBugPair({ buggy: { passed: false }, fixed: { passed: false } }).classification,
    "oracle-or-environment-failure",
  );
  assert.equal(
    classifyHistoricalBugPair({ buggy: { passed: true }, fixed: { passed: true } }).classification,
    "bug-not-detected",
  );
});

test("accepts only an issue-informed plan that enters Favorites and asserts the redundant CTA is absent", () => {
  const accepted = validateDopaFavoritesOraclePlan({ steps: [
    { action: "click", role: "button", name: "Abrir favoritos" },
    { action: "assert-absent", role: "button", name: "Abrir meus favoritos" },
  ] });
  assert.equal(accepted.valid, true);

  const rejected = validateDopaFavoritesOraclePlan({ steps: [
    { action: "click", role: "button", name: "Abrir meus favoritos" },
  ] });
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join(" "), /assert/i);
});

test("recognizes a blind hypothesis about the Dopa favorites self-reference", () => {
  assert.equal(matchesDopaFavoritesGroundTruth([{
    title: "Redundant favorites navigation",
    observedEvidence: "The Favorites tab still shows Abrir meus favoritos.",
    expectedBehavior: "Do not offer navigation to the same view.",
  }]), true);
  assert.equal(matchesDopaFavoritesGroundTruth([{
    title: "The product list may be empty",
    observedEvidence: "No products were favorited.",
  }]), false);
  assert.equal(matchesDopaFavoritesGroundTruth([{
    title: "Abrir meus favoritos may not navigate",
    observedEvidence: "The button is present.",
    expectedBehavior: "Clicking it should navigate to a favorites view.",
  }]), false);
});

test("does not score a TodoMVC inconsistency unless the evidence states an actual mismatch", () => {
  assert.equal(matchesToggleAllGroundTruth([{
    title: "Toggle-all inconsistency",
    observedEvidence: "The checkbox is unchecked and the active count is 2; these values align.",
    oracle: "The checkbox should remain unchecked while two items are active.",
  }]), false);
  assert.equal(matchesToggleAllGroundTruth([{
    title: "Toggle-all inconsistency",
    observedEvidence: "The item checkbox remained checked while the item was active and not completed.",
    oracle: "The checkbox and completed state must not be out of sync.",
  }]), true);
});
