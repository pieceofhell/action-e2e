const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const {
  buildBugHunterPrompt,
  buildJourneyForStates,
  expandTransitionStates,
  normalizeDiagnostics,
  normalizeHypotheses,
  validateCriticReview,
} = require("../src/services/bug-discovery");
const { capturePageObservation } = require("../src/services/live-explorer");

test("retains a potential defect only when observed facts cite real evidence", () => {
  const diagnostics = normalizeDiagnostics({
    consoleErrors: [{ message: "Rendered state raised an error", url: "http://127.0.0.1:3000/" }],
  });
  const states = [{
    id: "state-2",
    path: "/favorites",
    visualEvidence: [{ fileName: "state-2.jpg", artifactUrl: "/artifacts/run/state-2.jpg", viewportIndex: 1 }],
  }];
  const steps = [{
    step: 1,
    status: "completed",
    beforeStateId: "state-1",
    afterStateId: "state-2",
    action: { kind: "click", name: "Favorites" },
    changed: true,
  }];
  const [hypothesis] = normalizeHypotheses([{
    title: "Favorites view keeps a self-navigation action",
    objectiveDescription: "The destination offers the same navigation action that led to it.",
    affectedFlow: "Open favorites",
    preconditions: ["The landing page is open"],
    reproductionSteps: ["Select Favorites"],
    observedResult: "The Favorites control remains visible in the Favorites state.",
    facts: [{ statement: "Favorites remains visible after navigation to the same destination.", evidenceRefs: ["state-2"] }],
    expectedResult: "The current destination should not offer a redundant self-navigation action.",
    expectationJustification: "The action and destination labels describe the same state.",
    expectationSource: "cross-state-consistency",
    severity: "low",
    confidence: "medium",
  }], { states, steps, diagnosticEvidence: diagnostics });

  assert.equal(hypothesis.confirmationStatus, "hypothesis");
  assert.equal(hypothesis.observed.facts[0].evidenceRefs[0], "state-2");
  assert.equal(hypothesis.expected.source, "cross-state-consistency");
  assert.equal(hypothesis.requiresHumanValidation, true);
  assert.equal(hypothesis.evidence.screenshots[0].artifactUrl, "/artifacts/run/state-2.jpg");
  assert.equal(hypothesis.evidence.executedActions[0].action.name, "Favorites");
});

test("rejects unsupported defect claims and does not accept invented evidence IDs", () => {
  const retained = normalizeHypotheses([{
    title: "Invented failure",
    reproductionSteps: ["Click a control"],
    observedResult: "It failed.",
    facts: [{ statement: "A failure occurred.", evidenceRefs: ["state-999"] }],
    expectedResult: "It should work.",
    expectationJustification: "The model assumes it should.",
  }], {
    states: [{ id: "state-1" }],
    steps: [],
    diagnosticEvidence: normalizeDiagnostics({}),
  });

  assert.deepEqual(retained, []);
});

test("does not ground a visible UI claim only in an incidental diagnostic", () => {
  const diagnostics = normalizeDiagnostics({ consoleErrors: ["A generic resource returned 404"] });
  const retained = normalizeHypotheses([{
    title: "Todo item missing",
    reproductionSteps: ["Submit a todo"],
    observedResult: "The submitted todo is missing from the page.",
    facts: [{ statement: "A resource failed with 404.", evidenceRefs: ["console-error-1"] }],
    expectedResult: "The todo should appear.",
    expectationJustification: "A submitted non-empty todo should be listed.",
  }], {
    states: [{ id: "state-1" }],
    steps: [],
    diagnosticEvidence: diagnostics,
  });

  assert.deepEqual(retained, []);
});

test("adds an objective unchanged-transition fact when a recorded outcome does not occur", () => {
  const [hypothesis] = normalizeHypotheses([{
    title: "Todo item missing after submission",
    reproductionSteps: ["Type a", "Press Enter"],
    observedResult: "No new todo item appears after pressing Enter.",
    facts: [{ statement: "The input contains a.", evidenceRefs: ["state-2"] }],
    expectedResult: "A todo item labeled a should appear.",
    expectationJustification: "The exploration agent recorded item creation as the expected outcome.",
    confidence: "medium",
  }], {
    states: [{ id: "state-2" }],
    steps: [{
      status: "completed",
      changed: false,
      beforeStateId: "state-2",
      afterStateId: "state-2",
      action: { name: "Press Enter in New Todo Input" },
      expectedOutcome: "A new item labeled a should appear.",
    }],
    diagnosticEvidence: normalizeDiagnostics({}),
  });

  assert.match(hypothesis.observed.facts.at(-1).statement, /no structured interface change was observed/i);
  assert.equal(hypothesis.confidence, "medium");
});

test("does not attach a submission transition to a hypothesis that never submits", () => {
  const retained = normalizeHypotheses([{
    title: "Validation feedback missing while typing",
    reproductionSteps: ["Type a"],
    observedResult: "No validation feedback appears while typing.",
    facts: [{ statement: "The input contains a.", evidenceRefs: ["state-2"] }],
    expectedResult: "Typing should display a validation message.",
    expectationJustification: "Model inference only.",
  }], {
    states: [{ id: "state-2" }],
    steps: [{
      status: "completed",
      changed: false,
      beforeStateId: "state-2",
      afterStateId: "state-2",
      action: { kind: "press", name: "Press Enter in New Todo Input" },
      expectedOutcome: "A new item labeled a should appear.",
    }],
    diagnosticEvidence: normalizeDiagnostics({}),
  });

  assert.deepEqual(retained, []);
});

test("rejects normal behavior and an anomaly that is absent from its cited facts", () => {
  const states = [{ id: "state-1" }];
  const context = { states, steps: [], diagnosticEvidence: normalizeDiagnostics({}) };
  const normalBehavior = {
    title: "Category navigation",
    reproductionSteps: ["Choose Men's"],
    observedResult: "The category page displays men's products.",
    facts: [{ statement: "Men's products are displayed.", evidenceRefs: ["state-1"] }],
    expectedResult: "Men's products should be displayed.",
    expectationJustification: "The selected category is Men's.",
  };
  const unsupportedAnomaly = {
    title: "Missing add-to-cart feedback",
    reproductionSteps: ["Open a product"],
    observedResult: "No feedback appears after adding the item.",
    facts: [{ statement: "An Add to cart button is present.", evidenceRefs: ["state-1"] }],
    expectedResult: "The cart count should change.",
    expectationJustification: "A cart action should communicate its result.",
  };

  assert.deepEqual(normalizeHypotheses([normalBehavior, unsupportedAnomaly], context), []);
});

test("makes screenshot availability explicit in the defect-hunter prompt", () => {
  assert.match(buildBugHunterPrompt({ visionEnabled: true }), /attached viewport screenshots/i);
  assert.match(buildBugHunterPrompt({ visionEnabled: false }), /No screenshot was supplied/i);
});

test("normalizes only browser console and page errors, never network traffic", () => {
  const diagnostics = normalizeDiagnostics({
    consoleErrors: ["console"],
    pageErrors: ["page"],
    failedRequests: ["must not be collected"],
    errorResponses: ["must not be collected"],
  });

  assert.deepEqual(Object.keys(diagnostics.items), ["consoleErrors", "pageErrors"]);
  assert.equal(diagnostics.validIds.length, 2);
});

test("adds only immediate before and after states to a focal defect review", () => {
  const states = ["state-1", "state-2", "state-3", "state-4"].map((id) => ({ id }));
  const steps = [
    { beforeStateId: "state-1", afterStateId: "state-2" },
    { beforeStateId: "state-2", afterStateId: "state-3" },
    { beforeStateId: "state-3", afterStateId: "state-4" },
  ];

  assert.deepEqual(
    expandTransitionStates([states[2]], states, steps).map((state) => state.id),
    ["state-2", "state-3", "state-4"],
  );
});

test("keeps defect-review journeys compact instead of repeating full page catalogs", () => {
  const states = [
    { id: "state-1", path: "/", headings: ["Store"], buttons: ["Cart"] },
    { id: "state-2", path: "/cart", headings: ["Cart"], buttons: ["Continue"] },
  ];
  const journey = buildJourneyForStates([{
    step: 1,
    status: "completed",
    beforeStateId: "state-1",
    afterStateId: "state-2",
    changed: true,
    action: { kind: "click", name: "Cart", role: "link", options: Array(100).fill({ label: "unused" }) },
    expectedOutcome: "The cart page should appear.",
    observedAfter: { actions: Array(100).fill({ name: "unused control" }), visibleTextExcerpt: "unused" },
  }], [states[1]], states);

  const serialized = JSON.stringify(journey);
  assert.equal(journey.length, 1);
  assert.match(serialized, /"name":"Cart"/);
  assert.match(serialized, /cart page should appear/);
  assert.doesNotMatch(serialized, /unused control|"options"|"observedAfter"/);
  assert.ok(serialized.length < 700);
});

test("derives the critic verdict only when all four evidence gates pass", () => {
  assert.throws(() => validateCriticReview({
    reason: "The submitted item did not appear, confirming the anomaly.",
    confidence: "high",
  }), /claimed action was executed/);

  assert.deepEqual(validateCriticReview({
    actionExecuted: true,
    expectationGrounded: true,
    evidenceSufficient: true,
    expectationSatisfied: false,
    observedOutcome: "The input still contains the submitted value and no item appears.",
    reason: "The submitted item did not appear after the observed action.",
    confidence: "high",
  }), {
    verdict: "retain",
    evidenceAssessment: "supports-anomaly",
    actionExecuted: true,
    expectationGrounded: true,
    evidenceSufficient: true,
    expectationSatisfied: false,
    observedOutcome: "The input still contains the submitted value and no item appears.",
    reason: "The submitted item did not appear after the observed action.",
    confidence: "high",
  });

  assert.equal(validateCriticReview({
    actionExecuted: true,
    expectationGrounded: false,
    evidenceSufficient: true,
    expectationSatisfied: false,
    reason: "The candidate expects content in a normal empty state without first creating it.",
    confidence: "high",
  }).verdict, "reject");
});

test("adds card context to generic icon actions without polluting global navigation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <nav><a href="/cart">Cart</a></nav>
      <main>
        <h1>No saved items yet</h1>
        <label for="new-task">New task</label>
        <input id="new-task" type="text" value="a">
        <article>
          <h2>Canvas backpack</h2>
          <button aria-label="Add to favorites">Heart</button>
        </article>
      </main>
    `);
    const observation = await capturePageObservation({ page, baseUrl: "http://127.0.0.1:3000" });
    const names = observation.actions.map((action) => action.name);

    assert.ok(names.includes("Cart"));
    assert.ok(names.includes("Add to favorites — Canvas backpack"));
    assert.equal(names.some((name) => name.includes("Cart — No saved items yet")), false);
    assert.equal(observation.inputs.find((input) => input.label === "New task")?.value, "a");
    assert.equal(observation.actions.find((action) => action.name === "New task")?.boundaryProbe, true);
  } finally {
    await browser.close();
  }
});
