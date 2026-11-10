const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');
const { readDomain, judgeEffects } = require('./lib/comparison-functions.cjs');
const { compileEffect } = require('./evaluate-selector-comparison.cjs');

const root = path.resolve(__dirname, '..');
const target = 'memory-cards';
const source = path.join(root, '..', 'candidates', 'vanillawebprojects', target);
const sha = data => createHash('sha256').update(data).digest('hex');
const options = { waitUntil: 'domcontentloaded', timeout: 10000 };

async function recordReference(baseURL) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    const origin = new URL(baseURL).origin;
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto('/', options);
    const observations = { 0: await readDomain(page, target) };
    const actions = [
      { kind: 'click', domId: 'show' },
      { kind: 'fill', domId: 'question', value: 'What is persisted?' },
      { kind: 'fill', domId: 'answer', value: 'This exact card' },
      { kind: 'click', domId: 'add-card' },
      { kind: 'reload' },
    ];
    const states = actions.map((_, index) => ({ id: `control-${index}`, fingerprint: `control-${index}` }));
    states.push({ id: 'control-5', fingerprint: 'control-5' });
    const steps = [];
    for (const [index, action] of actions.entries()) {
      const locator = action.domId && page.locator(`#${action.domId}`);
      if (action.kind === 'fill') await locator.fill(action.value);
      else if (action.kind === 'reload') await page.reload(options);
      else if (action.domId === 'add-card') await Promise.all([page.waitForEvent('load', { timeout: 10000 }), locator.click()]);
      else await locator.click();
      observations[index + 1] = await readDomain(page, target);
      steps.push({ step: index + 1, status: 'completed', action: { ...action, name: action.domId || 'reload' },
        beforeStateId: states[index].id, afterStateId: states[index + 1].id, afterFingerprint: states[index + 1].fingerprint });
    }
    const effects = judgeEffects(target, steps, observations);
    assert.deepEqual(effects.map(effect => effect.id), ['create-card', 'restore-card']);
    return { id: 'card-control', target, exploration: { steps, states }, observations, effects, browser: browser.version() };
  } finally { await browser.close(); }
}

async function mutant(original, directory, needle, replacement) {
  assert.equal(original.split(needle).length, 2, 'Mutation must match exactly once');
  await fs.mkdir(directory);
  for (const file of ['index.html', 'style.css']) await fs.copyFile(path.join(source, file), path.join(directory, file));
  const script = original.replace(needle, replacement);
  await fs.writeFile(path.join(directory, 'script.js'), script, { flag: 'wx' });
  return { needle, replacement, scriptSha256: sha(script) };
}

async function main() {
  const name = process.argv[2];
  if (!/^[a-z0-9][a-z0-9-]+$/.test(name || '')) throw new Error('Usage: node scripts/verify-card-function.cjs unique-control-id');
  const output = path.join(root, 'evaluation-results', name);
  const specDirectory = path.join(output, 'specs');
  await fs.mkdir(output);
  await fs.mkdir(specDirectory);
  const baseScript = await fs.readFile(path.join(source, 'script.js'), 'utf8');
  const definitions = { reference: source, 'create-disabled': path.join(output, 'create-disabled'), 'restore-disabled': path.join(output, 'restore-disabled') };
  const mutations = {
    'create-disabled': await mutant(baseScript, definitions['create-disabled'], 'if (question.trim() && answer.trim()) {', 'if (false) {'),
    'restore-disabled': await mutant(baseScript, definitions['restore-disabled'], "const cards = JSON.parse(localStorage.getItem('cards'));",
      "const visits = Number(sessionStorage.getItem('e2pControlVisits') || 0) + 1;\n  sessionStorage.setItem('e2pControlVisits', String(visits));\n  const cards = visits >= 3 ? null : JSON.parse(localStorage.getItem('cards'));"),
  };
  const runtimes = {};
  try {
    for (const [key, directory] of Object.entries(definitions)) runtimes[key] = await startTargetRuntime({ targetProjectPath: directory, runtimeConfig: { mode: 'static' } });
    const run = await recordReference(runtimes.reference.baseUrl);
    const compiled = compileEffect(run, run.effects.at(-1));
    assert.ok(compiled, 'Creation and restoration must compile to one frozen test');
    const spec = path.join(specDirectory, 'creation-and-restore.spec.cjs');
    await fs.writeFile(spec, compiled.source, { flag: 'wx' });
    const report = path.join(output, 'playwright.json');
    const config = path.join(output, 'control.config.cjs');
    const projects = Object.entries(runtimes).map(([name, runtime]) => ({ name, use: { baseURL: runtime.baseUrl } }));
    await fs.writeFile(config, `module.exports = ${JSON.stringify({ testDir: specDirectory, projects, workers: 3, retries: 0, timeout: 25000,
      outputDir: path.join(output, 'test-artifacts'), reporter: [['json', { outputFile: report }]] })};\n`, { flag: 'wx' });
    const exit = await new Promise((resolve, reject) => {
      const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
      const processHandle = spawn(process.execPath, [cli, 'test', '--config', config], { cwd: root, stdio: 'inherit', windowsHide: true });
      processHandle.on('error', reject);
      processHandle.on('exit', resolve);
    });
    const pw = JSON.parse(await fs.readFile(report, 'utf8'));
    assert.equal(exit, 1, 'The deliberately defective versions should fail the same test');
    assert.deepEqual(pw.errors, []);
    const executions = pw.suites.flatMap(suite => suite.specs).flatMap(spec => spec.tests.map(test => ({
      variant: test.projectName, status: test.results[0]?.status, message: test.results[0]?.error?.message || '',
    })));
    assert.equal(executions.length, 3);
    assert.equal(executions.find(run => run.variant === 'reference')?.status, 'passed');
    for (const [index, variant] of ['create-disabled', 'restore-disabled'].entries()) {
      const observed = executions.find(run => run.variant === variant);
      assert.equal(observed?.status, 'failed');
      assert.ok(observed.message.includes(compiled.contract[index].assertionId), `Expected assertion did not fail: ${variant}`);
    }
    assert.equal(sha(await fs.readFile(spec)), compiled.specSha256);
    assert.equal(await fs.readFile(path.join(source, 'script.js'), 'utf8'), baseScript);
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ protocol: 'controlled-creation-and-explicit-reload', modelCalled: false,
      targetScriptSha256: sha(baseScript), specSha256: compiled.specSha256, contract: compiled.contract, run, mutations, executions }, null, 2), { flag: 'wx' });
    console.log('Frozen test passed on the reference and failed at the intended assertion in both variants.');
  } finally { await Promise.allSettled(Object.values(runtimes).map(runtime => runtime.stop())); }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
