const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { chromium } = require('playwright');
const { createRuntimeDiagnosticsCollector, capturePageObservation } = require('../src/services/live-explorer');
const { classifyExplorationAction, validateAgentDecision } = require('../src/services/agentic-explorer');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');

test('native validation alert is evidence, not a page exception, on a standalone fixture', async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-dialog-'));
  await fs.writeFile(path.join(target, 'index.html'), `<!doctype html><html><body>
    <form id="form"><label for="text">Text</label><input id="text">
    <label for="amount">Amount</label><input id="amount" type="number">
    <button>Add transaction</button></form><script>
    document.querySelector('#form').onsubmit = event => { event.preventDefault();
      if (!document.querySelector('#text').value || !document.querySelector('#amount').value)
        alert('Please add a text and amount'); };
    </script></body></html>`);
  const runtime = await startTargetRuntime({ targetProjectPath: target, runtimeConfig: { mode: 'static' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const collector = createRuntimeDiagnosticsCollector(context);
    const page = await context.newPage();
    await page.goto(runtime.baseUrl);
    collector.beginAction(1, { name: 'Add transaction' });
    await page.locator('#form button').click();
    collector.endAction();
    const diagnostics = collector.snapshot();
    assert.equal(diagnostics.nativeDialogs.length, 1);
    assert.equal(diagnostics.nativeDialogs[0].type, 'alert');
    assert.equal(diagnostics.nativeDialogs[0].message, 'Please add a text and amount');
    assert.equal(diagnostics.nativeDialogs[0].actionStep, 1);
    assert.equal(diagnostics.pageErrors.length, 0);
    const conservative = await capturePageObservation({ page, baseUrl: runtime.baseUrl });
    const profile = await capturePageObservation({ page, baseUrl: runtime.baseUrl, disposableLocalProfile: true });
    assert.equal(conservative.actions.find(action => action.inputType === 'number')?.safe, false);
    assert.equal(profile.actions.find(action => action.inputType === 'number')?.safe, true);
    await page.locator('#amount').fill('-42.50');
    const numericProfile = await capturePageObservation({ page, baseUrl: runtime.baseUrl, disposableLocalProfile: true });
    const numericConservative = await capturePageObservation({ page, baseUrl: runtime.baseUrl });
    assert.equal(numericProfile.inputs.find(input => input.domId === 'amount').value, '-42.50');
    assert.equal(numericConservative.inputs.find(input => input.domId === 'amount').value, '');
  } finally { await browser.close(); await runtime.stop(); await fs.rm(target, { recursive: true, force: true }); }
});

test('disposable numeric profile accepts bounded signed fictional amounts', () => {
  const action = { id: 'amount', kind: 'fill', name: 'Amount', inputType: 'number', safe: true, numericConstraints: { step: 'any' } };
  assert.equal(classifyExplorationAction(action).safe, false);
  assert.equal(classifyExplorationAction(action, { disposableLocalProfile: true }).safe, true);
  assert.equal(validateAgentDecision({ decision: 'act', actionId: 'amount', value: '42' }, [action]).value, '42');
  for (const value of ['-42', '12.50', '0', '-1000', '1000']) {
    assert.equal(validateAgentDecision({ decision: 'act', actionId: 'amount', value }, [action]).value, value);
  }
  for (const value of ['50000', '-1001', '1.001', 'Infinity', '1e3', '42;alert(1)']) {
    assert.throws(() => validateAgentDecision({ decision: 'act', actionId: 'amount', value }, [action]), /-1000 through 1000/);
  }
});

test('synthetic numeric decisions respect the actual HTML step and bounds', () => {
  const action = { id: 'amount', kind: 'fill', name: 'Amount', inputType: 'number', safe: true,
    numericConstraints: { min: '-100', max: '100', step: '1', stepBase: '-100' } };
  const decide = value => validateAgentDecision({ decision: 'act', actionId: 'amount', value }, [action]);
  assert.equal(decide('-12').value, '-12');
  assert.throws(() => decide('-12.50'), /step 1/);
  assert.throws(() => decide('101'), /field bounds/);
  action.numericConstraints = { min: '0.25', max: '10', step: '0.5', stepBase: '0.25' };
  assert.equal(decide('0.75').value, '0.75');
  assert.throws(() => decide('0.50'), /step 0.5/);
});
