const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');
async function main() {
  const root = path.resolve(__dirname, '..');
  const target = path.resolve(root, '../candidates/vanillawebprojects/form-validator');
  const output = path.resolve(process.argv[2] || path.join(root, 'evaluation-results/current-20261020/form-expectation.json'));
  const runtime = await startTargetRuntime({ targetProjectPath: target, runtimeConfig: { mode: 'static' } });
  const browser = await chromium.launch({ headless: true });
  const result = { protocol: 'candidate-expectation-check-not-blind-discovery', source: 'form-validator/script.js: form submit handler', checks: [] };
  try {
    for (const mode of ['enter-in-username', 'submit-button']) {
      const page = await browser.newPage(); await page.goto(runtime.baseUrl);
      await page.locator('#username').fill('sampleuser');
      await page.evaluate(() => { window.__submits = 0; document.querySelector('form').addEventListener('submit', () => window.__submits++); });
      if (mode === 'enter-in-username') await page.locator('#username').press('Enter');
      else await page.locator('form button').click();
      result.checks.push({ mode, submits: await page.evaluate(() => window.__submits),
        errors: await page.locator('.form-control.error small').allTextContents() });
      await page.close();
    }
    result.sameValidation = JSON.stringify(result.checks[0].errors) === JSON.stringify(result.checks[1].errors);
    result.assessment = 'The candidate expectation that Enter validates only Username is unsupported. Both actions submit the form and invoke its whole-form validation; reproducing the messages is not evidence of a defect.';
    await fs.writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx' });
    if (!result.sameValidation || result.checks.some(item => item.submits !== 1)) throw new Error('Form behavior differed; review evidence.');
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); await runtime.stop(); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
