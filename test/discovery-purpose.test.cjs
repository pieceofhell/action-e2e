const test = require('node:test');
const assert = require('node:assert/strict');
const { canCorrectInput } = require('../src/services/agentic-explorer');
const { mergeAiFlows } = require('../src/services/ai-workflows');
const express = require('express');
const { chromium } = require('playwright');
const { runAgenticExploration } = require('../src/services/agentic-explorer');

test('permits one validation correction and recommit without allowing endless repeats', () => {
  const fill = { kind: 'fill', role: 'input', name: 'Username', domId: 'username' };
  const press = { ...fill, kind: 'press', name: 'Press Enter in Username' };
  const steps = [{ status: 'completed', action: fill }, { status: 'completed', action: press }];
  const current = { visibleTextExcerpt: 'Username must be at least 3 characters' };
  assert.equal(canCorrectInput(fill, steps, current), true);
  assert.equal(canCorrectInput(press, steps, current), false);
  assert.equal(canCorrectInput(fill, steps, { visibleTextExcerpt: 'Welcome' }), false);
  assert.equal(canCorrectInput(fill, steps, { visibleTextExcerpt: 'Email is not valid', inputs: [{ domId: 'username', validationMessage: '' }] }), false);
  steps.push({ status: 'completed', action: fill });
  assert.equal(canCorrectInput(fill, steps, current), false);
  assert.equal(canCorrectInput(press, steps, current), true);
  steps.push({ status: 'completed', action: press });
  assert.equal(canCorrectInput(press, steps, current), false);
});

test('accepts observed password error text without permitting password entry', () => {
  const flow = { id: 'username-validation', title: 'Username validation', summary: 'Observe password required feedback', confidence: 'high', evidenceStateIds: ['state-2'],
    criteria: [{ title: 'Username validation feedback', given: 'Username contains a', when: 'Press Enter in Username', then: 'Username and Password required errors are displayed' }] };
  const live = { agenticExploration: {
    states: [{ id: 'state-2', fingerprint: 'errors', visibleTextExcerpt: 'Username must be at least 3 characters Password required' }],
    steps: [{ status: 'completed', afterFingerprint: 'errors', action: { kind: 'press', name: 'Press Enter in Username' } }],
  } };
  assert.equal(mergeAiFlows([], [flow], live).length, 1);
  const unsafe = { ...flow, criteria: [{ ...flow.criteria[0], when: 'Enter a password into Password' }] };
  assert.equal(mergeAiFlows([], [unsafe], live).length, 0);
  assert.equal(mergeAiFlows([], [{ ...flow, evidenceStateIds: ['state-999'] }], live).length, 0);
});

test('repairs malformed model JSON before executing an ordinary discovery action', { timeout: 30000 }, async t => {
  const app = express(); app.use(express.json());
  let calls = 0;
  app.post('/v1/chat/completions', (req, res) => {
    calls += 1;
    res.json({ choices: [{ message: { content: calls === 1 ? 'not JSON' : JSON.stringify({ decision: 'act', actionId: 'username', value: 'sampleuser', rationale: 'Learn the input', expectedOutcome: 'Username contains sampleuser' }) } }] });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<label for="username">Username</label><input id="username" data-e2p-action-id="username">');
  const action = { id: 'username', domId: 'username', kind: 'fill', role: 'input', tagName: 'input', name: 'Username', accessibleName: 'Username', safe: true, boundaryProbe: true };
  const observation = value => ({ path: '/', title: 'Sample', headings: [], buttons: [], links: [], inputs: [{ label: 'Username', type: 'text', value }], actions: [action], visibleTextExcerpt: 'Username' });
  const result = await runAgenticExploration({ page, initialObservation: observation(''),
    observeCurrentPage: async () => observation(await page.locator('#username').inputValue()),
    aiConfig: { provider: 'llama-cpp', model: 'test', endpoint: `http://127.0.0.1:${server.address().port}/v1` },
    allowVisualPreview: false,
  });
  assert.equal(calls, 2);
  assert.equal(await page.locator('#username').inputValue(), 'sampleuser');
  assert.equal(result.metrics.invalidDecisions, 0);
  assert.equal(result.status, 'completed');
  assert.equal(result.steps[0].action.boundaryProbe, false);
});
