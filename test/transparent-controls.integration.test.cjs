const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { capturePageObservation } = require('../src/services/live-explorer');

test('a transparent ancestor keeps its controls out of the catalog until the panel opens', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<button id="show">Open form</button>
      <section id="panel" style="opacity:0">
        <div><label for="question">Question</label><textarea id="question"></textarea></div>
        <button id="add-card">Add Card</button>
      </section>`);
    const observe = () => capturePageObservation({ page, baseUrl: 'http://127.0.0.1', disposableLocalProfile: true });
    const hidden = await observe();
    assert.ok(hidden.actions.some(action => action.domId === 'show' && action.safe));
    assert.ok(!hidden.actions.some(action => ['question', 'add-card'].includes(action.domId)));
    await page.locator('#panel').evaluate(panel => { panel.style.opacity = '1'; });
    const opened = await observe();
    assert.ok(opened.actions.some(action => action.domId === 'question' && action.kind === 'fill'));
    assert.ok(opened.actions.some(action => action.domId === 'add-card' && action.kind === 'click'));
  } finally { await browser.close(); }
});
