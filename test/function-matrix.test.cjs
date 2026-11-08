const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateReference, evaluateRun, aggregateByTarget, resolveTarget, actionDescriptor } = require('../src/services/function-matrix');
const { cohensKappa, compareReviewers, buildTemplate } = require('../src/services/reviewer-agreement');

const reference = validateReference({ schemaVersion: 1, id: 'ref', targets: {
  todo: { aliases: ['react'], functions: [
    { id: 'create', match: [{ kind: 'press', descriptor: 'new todo' }], assertion: 'todo-item' },
    { id: 'complete', match: [{ kind: 'click', descriptor: 'toggle' }] },
    { id: 'persist', match: [{ kind: 'reload' }], requireChange: false, requiresPriorChange: true },
    { id: 'filter', match: [{ kind: 'click', descriptor: '^click completed' }], effect: 'No items' },
  ] },
} });
const step = (n, kind, name, extra = {}) => ({ step: n, status: 'completed', changed: true, beforeStateId: `s${n}`, afterStateId: `s${n + 1}`,
  action: { kind, name, ...extra.action }, ...extra });
const exploration = { agenticExploration: { model: 'm', status: 'completed', states: [{ id: 's4', visibleTextExcerpt: 'todos' }], steps: [
  step(1, 'fill', 'New Todo Input'),
  step(2, 'press', 'Press Enter in New Todo Input'),
  step(3, 'click', 'Completed'),
  step(4, 'reload', 'Reload', { changed: false }),
  { step: 5, status: 'action-unavailable', changed: null, action: { kind: 'click', name: 'Interactive', domId: 'toggle-1' } },
] } };

test('reference validation rejects duplicated ids, empty matchers and invalid patterns', () => {
  const base = fn => ({ schemaVersion: 1, targets: { a: { functions: fn } } });
  assert.throws(() => validateReference(base([{ id: 'x', match: [{ kind: 'click' }] }, { id: 'x', match: [{ kind: 'click' }] }])), /duplicated/);
  assert.throws(() => validateReference(base([{ id: 'x', match: [{}] }])), /empty matcher/);
  assert.throws(() => validateReference(base([{ id: 'x', match: [{ descriptor: '(' }] }])));
  assert.throws(() => validateReference({ schemaVersion: 2, targets: {} }), /schemaVersion/);
});

test('descriptors include stable DOM identifiers, and run prefixes resolve to aliases', () => {
  assert.match(actionDescriptor({ kind: 'click', name: 'Interactive action-btn 0', domId: 'prev' }), /#prev/);
  assert.equal(resolveTarget(reference, 'react-2026-10-20T15-24-39-822Z-7e1d1a'), 'todo');
  assert.equal(resolveTarget(reference, 'unknown-2026-10-20T15-24-39-822Z-7e1d1a'), null);
});

test('levels separate attempt, exercise with cited states, and unavailable verification', () => {
  const run = evaluateRun({ reference, runId: 'react-2026-11-07T00-00-00-000Z-abc', exploration });
  const level = id => run.functions.find(fn => fn.id === id);
  assert.equal(level('create').level, 'exercised');
  assert.deepEqual(level('create').exercisedSteps, [{ step: 2, beforeStateId: 's2', afterStateId: 's3' }]);
  assert.equal(level('complete').level, 'attempted', 'an unavailable action is an attempt, not an exercise');
  assert.equal(level('persist').level, 'exercised', 'reload needs completion after a prior change, not a visible change');
  assert.equal(level('filter').level, 'attempted', 'the declared effect was not observed in the after state');
  assert.equal(level('create').verified, null); assert.equal(run.totals.verified, null);
  assert.deepEqual(run.totals, { functions: 4, attempted: 4, exercised: 2, verified: null });
});

test('verification requires a matching expect() in a generated test and an exercised function', () => {
  const tests = [{ file: 'a.spec.cjs', source: "await page.fill('x');\nawait expect(page.getByTestId('todo-item')).toHaveCount(1);\nawait expect(page.getByText('toggle')).toBeVisible();" }];
  const run = evaluateRun({ reference, runId: 'react-x', exploration, tests, targetId: 'todo' });
  const create = run.functions.find(fn => fn.id === 'create');
  assert.equal(create.level, 'verified'); assert.equal(create.verifiedBy[0].line, 2);
  assert.equal(run.functions.find(fn => fn.id === 'complete').level, 'attempted');
  assert.equal(run.totals.verified, 1);
  const aggregate = aggregateByTarget(reference, [run]);
  assert.deepEqual(aggregate[0].functions.map(fn => fn.exercisedIn), [1, 0, 1, 0]);
});

test('infrastructure overlay guards never count as function verification', () => {
  const ref = validateReference({ schemaVersion: 1, targets: { t: { functions: [{ id: 'clear', match: [{ kind: 'click', descriptor: 'clear' }], assertion: 'toHaveCount\\(0\\)' }] } } });
  const run = evaluateRun({ reference: ref, runId: 'x', targetId: 't',
    exploration: { agenticExploration: { steps: [step(1, 'click', 'Clear Cards')] } },
    tests: [{ file: 'a.spec.cjs', source: 'await expect(page.locator("vite-error-overlay, [data-vite-error-overlay], #webpack-dev-server-client-overlay")).toHaveCount(0);' }] });
  assert.equal(run.functions[0].level, 'exercised');
  assert.equal(run.functions[0].verified, false);
});

test('the published reference file is valid and covers every target of the diverse-contexts protocol', () => {
  const root = path.join(__dirname, '..');
  const ref = validateReference(JSON.parse(fs.readFileSync(path.join(root, 'evaluation/reference-functions/diverse-contexts-v1.json'), 'utf8')));
  const protocol = JSON.parse(fs.readFileSync(path.join(root, 'evaluation/protocols/diverse-contexts.json'), 'utf8'));
  for (const target of protocol.targets) assert.ok(ref.targets[target.id], `missing reference for ${target.id}`);
});

test('Cohen kappa matches a hand-computed example and stays undefined without category variation', () => {
  const pairs = [['a', 'a'], ['a', 'a'], ['a', 'b'], ['b', 'b'], ['b', 'b'], ['b', 'a'], ['a', 'a'], ['b', 'b'], ['a', 'a'], ['b', 'b']];
  const result = cohensKappa(pairs);
  assert.equal(result.observed, 0.8); assert.equal(result.expected, 0.5);
  assert.ok(Math.abs(result.kappa - 0.6) < 1e-12);
  assert.equal(cohensKappa([['a', 'a'], ['a', 'a']]).kappa, null);
  assert.equal(cohensKappa([]).kappa, null);
});

test('reviewer comparison keeps unpaired and pending items out of kappa but listed', () => {
  const first = { reviewer: 'A', labels: [{ id: '1', label: 'x' }, { id: '2', label: 'y' }, { id: '3', label: '' }] };
  const second = { reviewer: 'B', labels: [{ id: '1', label: 'x' }, { id: '2', label: 'x' }, { id: '4', label: 'y' }] };
  const result = compareReviewers(first, second);
  assert.equal(result.n, 2); assert.equal(result.disagreements.length, 1);
  assert.deepEqual(result.unpaired.sort(), ['3', '4']);
  assert.throws(() => compareReviewers(first, { ...second, reviewer: 'A' }), /different reviewers/);
});

test('blind template lists retained and rejected hypotheses without model verdicts', () => {
  const template = buildTemplate({ bugDiscovery: { hypotheses: [{ id: 'h1', title: 'T', verdict: 'confirmed', confidence: 'high' }],
    rejectedHypotheses: [{ id: 'h2', title: 'R', rejectionReason: 'empty state' }] } }, 'run-1', 'A');
  assert.equal(template.labels.length, 2);
  assert.deepEqual(template.labels.map(item => item.id), ['run-1#h1', 'run-1#h2']);
  assert.ok(template.labels.every(item => !('verdict' in item) && !('rejectionReason' in item) && item.label === ''));
});
