const test = require("node:test");
const assert = require("node:assert/strict");

const {
  actionableUncoveredGoals,
  buildQaCoveragePlan,
  buildSyntheticCoverageActions,
  evaluateQaCoverage,
  inferTemporalWaitMs,
  rankActionsByCoverage,
} = require("../src/services/qa-coverage");
const {
  estimateAdaptiveExplorationBudget,
  executeDecision,
  pauseApplicationClock,
  resumeApplicationClock,
} = require("../src/services/agentic-explorer");
const { buildObservedJourneySpecContent } = require("../src/services/test-generator");

function action(id, kind, name, extra = {}) {
  return { id, kind, name, role: kind === "fill" ? "textbox" : "button", safe: true, ...extra };
}

test("builds project-grounded QA goals for boundaries, timers, persistence, and calculations", () => {
  const plan = buildQaCoveragePlan({
    inspection: {
      detection: { appType: "web-app" },
      projectSynopsis: "A score counter with saved state",
      relevantFiles: [{ excerpt: "localStorage.setItem('score', score); setInterval(tick, 1000); input.required = true;" }],
    },
    initialObservation: {
      visibleTextExcerpt: "Score 0 Time left: 5s",
      actions: [
        action("name", "fill", "Player name", { boundaryProbe: true }),
        action("start", "click", "Start game"),
      ],
    },
  });

  assert.deepEqual(plan.goals.map((goal) => goal.id), [
    "input-interaction",
    "primary-activation",
    "validation-boundary",
    "temporal-boundary",
    "persistence-reload",
    "calculated-state",
  ]);
});

test("ranks actions by uncovered risk and adds only evidence-grounded browser probes", () => {
  const plan = {
    version: 1,
    goals: [
      { id: "temporal-boundary", title: "Timer", category: "temporal", priority: "high", requiredActionKinds: ["wait"] },
      { id: "persistence-reload", title: "Persistence", category: "persistence", priority: "high", requiredActionKinds: ["reload"] },
      { id: "primary-activation", title: "Action", category: "interaction", priority: "high", requiredActionKinds: ["click"] },
    ],
  };
  const steps = [{ status: "completed", changed: true, action: { kind: "click", name: "Increment" } }];
  const coverage = evaluateQaCoverage(plan, { steps, states: [] });
  const probes = buildSyntheticCoverageActions(coverage, {
    current: { visibleTextExcerpt: "Time left: 4s" },
    steps,
  });
  const ranked = rankActionsByCoverage([
    action("ordinary", "select", "Theme"),
    ...probes,
  ], coverage);

  assert.deepEqual(probes.map((candidate) => candidate.kind), ["wait", "reload"]);
  assert.equal(probes[0].durationMs, 5000);
  assert.deepEqual(ranked.slice(0, 2).map((candidate) => candidate.kind), ["wait", "reload"]);
  assert.deepEqual(actionableUncoveredGoals(ranked).sort(), ["persistence-reload", "temporal-boundary"]);
});

test("evaluates weighted QA coverage from recorded state transitions", () => {
  const plan = {
    version: 1,
    goals: [
      { id: "validation-boundary", title: "Boundary", category: "boundary", priority: "high", requiredActionKinds: ["fill"], requiresBoundaryProbe: true },
      { id: "calculated-state", title: "Calculation", category: "calculation", priority: "high", requiredActionKinds: ["click"], anyActionKind: true, requiresNumericChange: true },
      { id: "temporal-boundary", title: "Timer", category: "temporal", priority: "high", requiredActionKinds: ["wait"] },
    ],
  };
  const states = [
    { id: "before", visibleTextExcerpt: "Score 0" },
    { id: "after", visibleTextExcerpt: "Score 1" },
  ];
  const coverage = evaluateQaCoverage(plan, {
    states,
    steps: [
      { step: 1, status: "completed", changed: false, beforeStateId: "before", afterStateId: "before", action: { kind: "fill", name: "Name", boundaryProbe: true } },
      { step: 2, status: "completed", changed: true, beforeStateId: "before", afterStateId: "after", action: { kind: "click", name: "Increment" } },
    ],
  });

  assert.equal(coverage.summary.covered, 2);
  assert.equal(coverage.summary.highPriorityUncovered, 1);
  assert.deepEqual(coverage.summary.uncoveredGoalIds, ["temporal-boundary"]);
  assert.equal(coverage.summary.ratio, 0.667);
});

test("uses QA goal count to avoid under-budgeting otherwise small interfaces", () => {
  const budget = estimateAdaptiveExplorationBudget({
    current: { actions: [action("one", "click", "Only action")] },
    states: [{ actions: [action("one", "click", "Only action")] }],
    coverageGoalCount: 6,
  });
  assert.equal(budget.stepLimit, 7);
});

test("executes synthetic wait and reload actions without requiring a DOM locator", async () => {
  const calls = [];
  const page = {
    waitForTimeout: async (durationMs) => calls.push(["wait", durationMs]),
    reload: async (options) => calls.push(["reload", options]),
  };

  assert.equal(await executeDecision(page, { action: "wait" }, { durationMs: 1750 }), page);
  assert.equal(await executeDecision(page, { action: "reload" }, {}), page);
  assert.deepEqual(calls, [
    ["wait", 1750],
    ["reload", { waitUntil: "domcontentloaded", timeout: 15000 }],
  ]);
});

test("isolates model think time through the browser clock API", async () => {
  const calls = [];
  const page = {
    evaluate: async () => 123456,
    clock: {
      pauseAt: async (time) => calls.push(["pauseAt", time]),
      resume: async () => calls.push(["resume"]),
    },
  };

  assert.equal(await pauseApplicationClock(page), true);
  assert.equal(await resumeApplicationClock(page), true);
  assert.deepEqual(calls, [["pauseAt", 123456], ["resume"]]);
});

test("compiles wait and persistence probes into a replayable observed journey", () => {
  const terminalFingerprint = "reloaded";
  const source = buildObservedJourneySpecContent({
    title: "Timer and persistence",
    evidenceStateIds: ["state-3"],
  }, {
    liveExploration: { agenticExploration: {
      states: [
        { id: "state-1", fingerprint: "initial", headings: ["Counter"], buttons: [] },
        { id: "state-2", fingerprint: "after-wait", headings: ["Counter"], buttons: [] },
        { id: "state-3", fingerprint: terminalFingerprint, headings: ["Counter"], buttons: [] },
      ],
      steps: [
        { status: "completed", afterFingerprint: "after-wait", action: { kind: "wait", name: "Observe timer", durationMs: 4200 } },
        { status: "completed", afterFingerprint: terminalFingerprint, action: { kind: "reload", name: "Reload page" } },
      ],
    } },
  });

  assert.match(source, /waitForTimeout\(4200\)/);
  assert.match(source, /reload\(\{ waitUntil: "domcontentloaded" \}\)/);
});

test("bounds temporal probes and derives timer-boundary duration from visible text", () => {
  assert.equal(inferTemporalWaitMs("Time left: 7s"), 8000);
  assert.equal(inferTemporalWaitMs("Time left: 99s"), 12000);
  assert.equal(inferTemporalWaitMs("No timer value"), 3000);
});
