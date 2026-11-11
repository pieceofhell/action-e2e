const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
const { loadExperiment, collect, verify, randomSelector } = require('../scripts/evaluate-selector-comparison.cjs');
const { capturePageObservation } = require('../src/services/live-explorer');
const { runAgenticExploration } = require('../src/services/agentic-explorer');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');

test('a new protocol can load its own target and oracle and reject a changed browser result', { timeout: 45000 }, async () => {
  const fixture = path.join(__dirname, 'fixtures', 'selector-comparison');
  const tempRoot = path.join(__dirname, '..', 'tmp');
  await fs.mkdir(tempRoot, { recursive: true });
  const resolvedTemp = await fs.realpath(tempRoot);
  const scratch = await fs.mkdtemp(path.join(resolvedTemp, 'generic-comparison-'));
  const browser = await chromium.launch();
  const runtimes = [];
  try {
    const file = path.join(scratch, 'protocol.json');
    await fs.writeFile(file, JSON.stringify({ id: 'directory-protocol', seed: 1000, repetitions: 1, maxSteps: 1,
      maxDurationMs: 20000, conditions: ['llm', 'random'], targets: ['directory-lookup'],
      targetPaths: { 'directory-lookup': fixture }, model: 'unused-in-control',
      referenceImplementation: path.join(__dirname, 'fixtures', 'selector-comparison-oracle.cjs') }));
    const experiment = await loadExperiment(file);
    assert.equal(experiment.requirePriorFillForPress, false);
    async function start(directory) {
      const runtime = await startTargetRuntime({ targetProjectPath: directory, runtimeConfig: { mode: 'static' } });
      runtimes.push(runtime);
      return runtime;
    }
    const original = await start(experiment.targetDirs['directory-lookup']);
    const run = await collect({ browser, row: { id: 'directory-lookup-r1-random', target: 'directory-lookup', seed: 1000, condition: 'random' },
      experiment, runtime: original, inspection: {} });
    assert.deepEqual(run.exploration.steps.map(step => step.action.kind), ['press']);
    assert.deepEqual(run.effects.map(effect => effect.id), ['display-match']);
    const [positive] = await verify(path.join(scratch, 'reference'), [run], { 'directory-lookup': original });
    assert.equal(positive.status, 'passed');
    assert.match(positive.contract[0].expectationSource.reference, /^directory-protocol\//);

    const alteredDir = path.join(scratch, 'altered');
    await fs.mkdir(alteredDir);
    const html = await fs.readFile(path.join(fixture, 'index.html'), 'utf8');
    await fs.writeFile(path.join(alteredDir, 'index.html'), html.replace('Found: ', 'Queued: '));
    const altered = await start(alteredDir);
    const [negative] = await verify(path.join(scratch, 'negative'), [run], { 'directory-lookup': altered });
    assert.equal(negative.specSha256, positive.specSha256);
    assert.equal(negative.status, 'failed');
    const report = await fs.readFile(path.join(scratch, 'negative', 'playwright.json'), 'utf8');
    assert.ok(report.includes(positive.contract[0].assertionId));
    assert.ok(report.includes('Queued: cedar'));
  } finally {
    await browser.close();
    await Promise.allSettled(runtimes.map(runtime => runtime.stop()));
    const resolvedScratch = await fs.realpath(scratch);
    if (path.dirname(resolvedScratch) === resolvedTemp && path.basename(resolvedScratch).startsWith('generic-comparison-')) {
      await fs.rm(resolvedScratch, { recursive: true, force: true });
    }
  }
});

test('press eligibility after fill distinguishes controls with the same name', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<input aria-label="Filter" value="one"><input aria-label="Filter" value="two">');
    const observe = () => capturePageObservation({ page, baseUrl: 'http://127.0.0.1' });
    const run = await runAgenticExploration({ page, initialObservation: await observe(), observeCurrentPage: observe,
      fixedBudget: true, requirePriorFillForPress: true, maxSteps: 2, allowVisualPreview: false,
      selectDecision({ safeActions, steps }) {
        if (!steps.length) {
          assert.equal(safeActions.filter(action => action.kind === 'press').length, 0);
          return { decision: 'act', actionId: safeActions.find(action => action.kind === 'fill' && action.tagIndex === 1).id, value: 'updated' };
        }
        const presses = safeActions.filter(action => action.kind === 'press');
        assert.deepEqual(presses.map(action => action.tagIndex), [1]);
        return { decision: 'act', actionId: presses[0].id };
      } });
    assert.deepEqual(run.steps.filter(step => step.status === 'completed').map(step => [step.action.kind, step.action.tagIndex]), [['fill', 1], ['press', 1]]);
  } finally { await browser.close(); }
});

test('the uniform selector samples a numeric value compatible with observed bounds', () => {
  const action = { id: 'quantity', name: 'Quantity', kind: 'fill', inputType: 'number', numericConstraints: { min: 60, max: 80, step: 10, stepBase: 60 } };
  assert.equal(randomSelector(123)({ safeActions: [action], steps: [] }).value, '60');
});
