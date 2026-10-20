const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createRunDirectory, writeJson } = require('../src/services/artifact-store');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');
const { capturePageObservation } = require('../src/services/live-explorer');
const { fingerprintObservation } = require('../src/services/agentic-explorer');
const { buildObservedJourneySpecContent } = require('../src/services/test-generator');
const { runGeneratedTests } = require('../src/services/test-runner');

const prototypeRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(prototypeRoot, '..');
const target = path.join(workspaceRoot, 'candidates', 'vanillawebprojects', 'expense-tracker');
const evidenceRoot = path.join(workspaceRoot, 'output', 'e2p-evolution-20261006', 'regression-pairs',
  `expense-tracker-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const runtimeConfig = { mode: 'static', runInstallBeforeExecution: false, disposableLocalProfile: true };

async function main() {
  await fs.mkdir(evidenceRoot, { recursive: true });
  const balanceMutant = await makeMutant('balance-not-updated', '    updateValues();', '    // updateValues disabled in addTransaction for regression');
  const storageMutant = await makeMutant('transaction-not-persisted', '    updateLocalStorage();', '    // updateLocalStorage disabled in addTransaction for regression');
  const observed = await observeCorrectJourney();
  const independent = {
    correct: await inspectBehavior(target), balanceMutant: await inspectBehavior(balanceMutant),
    storageMutant: await inspectBehavior(storageMutant),
  };
  if (independent.correct.balanceAfterAdd !== '$42.00' || !independent.correct.persisted
    || independent.balanceMutant.balanceAfterAdd !== '$0.00' || independent.storageMutant.persisted) {
    throw new Error('The independent browser behavior did not distinguish the reference and mutants as expected.');
  }
  const flows = [
    { id: 'transaction-balance', title: 'Valid transaction updates balance', evidenceStateIds: ['state-1', 'state-4'],
      observedStepNumber: 3, criteria: [{ title: 'Balance reflects the added transaction',
        given: 'The balance starts at zero', when: 'The user clicks Add transaction',
        then: "The balance becomes '$42.00' after adding 42." }] },
    { id: 'transaction-persistence', title: 'Transaction persists after reload', evidenceStateIds: ['state-1', 'state-5'],
      observedStepNumber: 4, criteria: [{ title: 'The same transaction survives reload',
        given: 'Lunch with amount 42 has been added', when: 'The page reloads',
        then: 'The same Lunch transaction and its amount 42 remain after reload.' }] },
  ];
  const inspection = { liveExploration: { agenticExploration: observed } };
  const run = await createRunDirectory(path.join(prototypeRoot, 'prototype-runs'), target);
  await fs.copyFile(path.join(prototypeRoot, 'test', 'fixtures', 'music-player-journey', 'playwright.config.cjs'),
    path.join(run.runDirectory, 'playwright.config.cjs'));
  const tests = [];
  for (const flow of flows) {
    let contract;
    const source = buildObservedJourneySpecContent(flow, inspection, result => { contract = result; });
    if (!source || contract[0]?.status !== 'asserted') throw new Error(`No grounded assertion for ${flow.id}.`);
    const fileName = `${flow.id}.spec.cjs`;
    await fs.writeFile(path.join(run.testsDirectory, fileName), source);
    tests.push({ flowId: flow.id, title: flow.title, fileName, criterionContract: contract });
  }
  await writeJson(path.join(run.runDirectory, 'generated-tests.json'), tests);
  const suiteHashes = await Promise.all(tests.map(async item => ({ fileName: item.fileName,
    sha256: sha(await fs.readFile(path.join(run.testsDirectory, item.fileName))) })));
  const results = { protocol: 'constructed-journey-compiler-development-regression',
    caveat: 'The correct-app browser journey was programmatically recorded, not chosen by an AI model. This checks the compiler and replay, not exploration quality or blind detection.',
    target, mutants: { balanceMutant, storageMutant }, independent, sourceRunId: run.runId,
    suiteHashes, contracts: tests.map(item => ({ flowId: item.flowId, criterionContract: item.criterionContract })),
    replays: [] };
  for (const [member, projectPath] of [['correct', target], ['balance-mutant', balanceMutant], ['storage-mutant', storageMutant]]) {
    const replay = await runGeneratedTests({ prototypeRoot, runDirectory: run.runDirectory,
      resultsDirectory: run.resultsDirectory, targetProjectPath: projectPath,
      runtimeConfig, authConfig: { mode: 'guest' } });
    results.replays.push({ member, summary: replay.report.summary,
      tests: replay.report.tests.map(item => ({ title: item.title, status: item.status, failureClass: item.failureClass,
        error: item.error?.slice(0, 1200) || null })) });
    await fs.cp(run.resultsDirectory, path.join(evidenceRoot, `${member}-results`), { recursive: true });
  }
  await writeJson(path.join(evidenceRoot, 'pair-result.json'), results);
  process.stdout.write(`${JSON.stringify(results.replays.map(item => ({ member: item.member, result: item.summary.result,
    tests: item.tests.map(test => ({ title: test.title, status: test.status })) })), null, 2)}\nEvidence: ${evidenceRoot}\n`);
}

async function makeMutant(name, needle, replacement) {
  const directory = path.join(evidenceRoot, name);
  await fs.cp(target, directory, { recursive: true });
  const script = path.join(directory, 'script.js');
  const source = await fs.readFile(script, 'utf8');
  if (!source.includes(needle)) throw new Error(`Mutation location changed: ${needle}`);
  await fs.writeFile(script, source.replace(needle, replacement));
  return directory;
}

async function inspectBehavior(projectPath) {
  const runtime = await startTargetRuntime({ targetProjectPath: projectPath, runtimeConfig });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('dialog', dialog => dialog.dismiss());
    await page.goto(runtime.baseUrl);
    await page.locator('#text').fill('Lunch');
    await page.locator('#amount').fill('42');
    await page.locator('#form button').click();
    const balanceAfterAdd = await page.locator('#balance').innerText();
    await page.reload();
    const persisted = await page.locator('#list li').filter({ hasText: 'Lunch' }).count() === 1;
    return { balanceAfterAdd, persisted };
  } finally { await browser.close(); await runtime.stop(); }
}

async function observeCorrectJourney() {
  const runtime = await startTargetRuntime({ targetProjectPath: target, runtimeConfig });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('dialog', dialog => dialog.dismiss());
    await page.goto(runtime.baseUrl);
    const states = [];
    const steps = [];
    const observe = async () => {
      const state = await capturePageObservation({ page, baseUrl: runtime.baseUrl, disposableLocalProfile: true });
      const saved = { ...state, id: `state-${states.length + 1}`, fingerprint: fingerprintObservation(state) };
      states.push(saved);
      return saved;
    };
    let prior = await observe();
    const actions = [
      { kind: 'fill', name: 'Text', domId: 'text', inputType: 'text', value: 'Lunch', perform: () => page.locator('#text').fill('Lunch') },
      { kind: 'fill', name: 'Amount', domId: 'amount', inputType: 'number', value: '42', perform: () => page.locator('#amount').fill('42') },
      { kind: 'click', name: 'Add transaction', accessibleName: 'Add transaction', role: 'button', accessibleIndex: 0, accessibleCount: 1,
        perform: () => page.locator('#form button').click() },
      { kind: 'reload', name: 'Reload page', perform: () => page.reload() },
    ];
    for (const [index, action] of actions.entries()) {
      await action.perform();
      const after = await observe();
      const { perform, ...recorded } = action;
      steps.push({ step: index + 1, status: 'completed', action: recorded,
        beforeStateId: prior.id, afterStateId: after.id, beforeFingerprint: prior.fingerprint,
        afterFingerprint: after.fingerprint, changed: prior.fingerprint !== after.fingerprint });
      prior = after;
    }
    return { states, steps };
  } finally { await browser.close(); await runtime.stop(); }
}
function sha(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
main().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
