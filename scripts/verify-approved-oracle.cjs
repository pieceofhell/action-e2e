const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { createRunDirectory } = require('../src/services/artifact-store');
const { buildObservedJourneySpecContent } = require('../src/services/test-generator');
const { runGeneratedTests } = require('../src/services/test-runner');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');

const prototypeRoot = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(prototypeRoot, 'evaluation-results', 'approved-oracle', new Date().toISOString().replace(/[:.]/g, '-')));
async function main() {
  await fs.mkdir(output, { recursive: true });
  const members = {};
  for (const [name, normalizedValue] of [['correct', '99'], ['mutant', '42']]) {
    const directory = path.join(output, name);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'index.html'), `<!doctype html><html><body><label for="amount">Amount</label><input id="amount"><script>document.querySelector('#amount').addEventListener('input', e => {e.target.value = '${normalizedValue}';});</script></body></html>`);
    members[name] = directory;
  }
  const flow = { id: 'approved-value', title: 'Amount follows the approved normalization rule', evidenceStateIds: ['after'], observedStepNumber: 1,
    criteria: [{ title: 'Normalized amount', given: 'The form is open', when: 'The user enters Amount',
      then: "The field value should be '99'.", expectationSource: 'project-requirement', sourceReference: 'Fixture rule: normalize the entered value to 99' }] };
  // Deliberately contradictory discovery evidence must never rewrite the approved expectation.
  const inspection = { liveExploration: { agenticExploration: { steps: [{ step: 1, status: 'completed',
    action: { kind: 'fill', name: 'Amount', domId: 'amount', value: '42' }, afterFingerprint: 'observed' }],
  states: [{ id: 'after', fingerprint: 'observed', inputDetails: [{ domId: 'amount', value: '42' }] }] } } };
  let contract;
  const source = buildObservedJourneySpecContent(flow, inspection, result => { contract = result; });
  if (contract[0]?.expectedValue !== '99') throw new Error('Approved oracle was overwritten.');
  const run = await createRunDirectory(path.join(prototypeRoot, 'prototype-runs'), members.correct);
  await fs.writeFile(path.join(run.testsDirectory, 'approved-value.spec.cjs'), source);
  await fs.writeFile(path.join(run.runDirectory, 'generated-tests.json'), JSON.stringify([
    { flowId: flow.id, title: flow.title, fileName: 'approved-value.spec.cjs', criterionContract: contract },
  ]));
  await fs.writeFile(path.join(run.runDirectory, 'playwright.config.cjs'), `const path = require('node:path'); module.exports = {testDir:path.join(__dirname,'tests'), workers:1, timeout:15000, reporter:[['json',{outputFile:path.join(__dirname,'results','playwright-results.json')}]],use:{baseURL:process.env.TARGET_BASE_URL,headless:true}};`);
  const result = { protocol: 'approved-oracle-browser-regression', contract, replays: [] };
  for (const [name, directory] of Object.entries(members)) {
    const runtime = await startTargetRuntime({ targetProjectPath: directory, runtimeConfig: { mode: 'static' } });
    const browser = await chromium.launch({ headless: true });
    let independentlyObserved;
    try {
      const page = await browser.newPage();
      await page.goto(runtime.baseUrl); await page.locator('#amount').fill('42');
      independentlyObserved = await page.locator('#amount').inputValue();
    } finally { await browser.close(); await runtime.stop(); }
    const replay = await runGeneratedTests({ prototypeRoot, runDirectory: run.runDirectory,
      resultsDirectory: run.resultsDirectory, targetProjectPath: directory,
      runtimeConfig: { mode: 'static', runInstallBeforeExecution: false }, authConfig: { mode: 'guest' } });
    result.replays.push({ member: name, independentlyObserved, summary: replay.report.summary });
    await fs.cp(run.resultsDirectory, path.join(output, `${name}-results`), { recursive: true });
  }
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.replays, null, 2));
  if (result.replays[0].summary.result !== 'passed' || result.replays[1].summary.result !== 'assertion-failed') {
    throw new Error('Oracle browser regression did not discriminate the intended behavior.');
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
