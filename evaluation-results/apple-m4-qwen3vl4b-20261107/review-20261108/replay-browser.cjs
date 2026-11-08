// Replays archived Memory Cards specs against the reference and a controlled change, then checks browser observations.
// Usage: node evaluation-results/apple-m4-qwen3vl4b-20261107/review-20261108/replay-browser.cjs [new-output.json]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const requireRepo = createRequire(path.join(root, 'package.json'));
const { chromium } = requireRepo('playwright');
const { startTargetRuntime } = requireRepo('./src/services/runtime-orchestrator');
const candidates = path.join(root, '../candidates/vanillawebprojects');
const run = path.join(root, 'evaluation-results/apple-m4-qwen3vl4b-20261107/full-pipeline/memory-cards-2026-11-08T01-19-59-899Z-99ecdf');
let work;
const result = { platform: process.platform, node: process.version, modelCalled: false, targets: {} };

async function usingRuntime(target, callback) {
  const runtime = await startTargetRuntime({ targetProjectPath: target, runtimeConfig: { mode: 'static' } });
  try { return await callback(runtime.baseUrl); } finally { await runtime.stop(); }
}

async function usingPage(browser, baseURL, callback) {
  const page = await browser.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try { await page.goto(baseURL); return await callback(page, errors); } finally { await page.close(); }
}

async function runSpecs(baseURL, name) {
  const config = path.join(work, `${name}.config.cjs`);
  const report = path.join(work, `${name}-playwright.json`);
  await fs.writeFile(config, `module.exports=${JSON.stringify({ testDir: path.join(run, 'tests'), outputDir: path.join(work, `${name}-playwright`),
    workers: 3, reporter: [['json', { outputFile: report }]], use: { baseURL, headless: true } })};\n`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/playwright/cli.js'), 'test', '--config', config], { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Playwright exit ${code}: ${name}`)));
  });
  const { stats } = JSON.parse(await fs.readFile(report, 'utf8'));
  assert.equal(stats.expected, 3);
  assert.equal(stats.unexpected, 0);
  return stats;
}

async function cardCreation(browser, baseURL) {
  return usingPage(browser, baseURL, async page => {
    await page.locator('#show').click();
    await page.locator('#question').fill('Review question');
    await page.locator('#answer').fill('Review answer');
    await page.locator('#add-card').click();
    const storage = await page.evaluate(() => JSON.parse(localStorage.getItem('cards') || '[]'));
    await page.reload();
    const question = (await page.locator('.inner-card-front').allTextContents()).map(text => text.trim());
    return { storage, afterReload: question };
  });
}

async function main() {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-archive-review-'));
  const browser = await chromium.launch();
  result.browser = browser.version();
  try {
    result.targets.form = await usingRuntime(path.join(candidates, 'form-validator'), async url => {
      const checks = [];
      for (const mode of ['Enter', 'Submit']) checks.push(await usingPage(browser, url, async page => {
        await page.evaluate(() => { window.__reviewSubmits = 0; document.querySelector('form').addEventListener('submit', () => window.__reviewSubmits++); });
        const username = page.locator('#username');
        await username.fill('sampleuser');
        const before = await username.evaluate(input => ({ value: input.value, className: input.parentElement.className, submits: window.__reviewSubmits }));
        if (mode === 'Enter') await username.press('Enter'); else await page.locator('form button').click();
        const after = await username.evaluate(input => ({ className: input.parentElement.className, submits: window.__reviewSubmits }));
        return { mode, before, after, errors: await page.locator('.form-control.error small').allTextContents() };
      }));
      assert.equal(checks[0].before.value, 'sampleuser');
      assert.equal(checks[0].before.submits, 0);
      assert.match(checks[0].after.className, /success/);
      assert.equal(checks[0].after.submits, 1);
      assert.deepEqual(checks[0].after, checks[1].after);
      assert.deepEqual(checks[0].errors, checks[1].errors);
      assert.equal(checks[0].errors.length, 3);
      return checks;
    });
    result.targets.music = await usingRuntime(path.join(candidates, 'music-player'), url => usingPage(browser, url, async (page, errors) => {
      const title = page.locator('#title');
      const before = await title.innerText();
      await Promise.all([
        page.waitForEvent('pageerror', { predicate: error => error.message.includes("Cannot set properties of null (setting 'innerHTML')"), timeout: 10000 }),
        page.locator('#prev').click(),
      ]);
      const after = await title.innerText();
      const missingTimeNodes = await page.locator('#currTime, #durTime').count();
      const playing = await page.locator('#audio').evaluate(el => !el.paused);
      await page.locator('#play').click();
      const paused = await page.locator('#audio').evaluate(el => el.paused);
      assert.deepEqual([before, after, missingTimeNodes, playing, paused], ['ukulele', 'summer', 0, true, true]);
      assert.ok(errors.some(error => error.includes("Cannot set properties of null (setting 'innerHTML')")));
      return { before, after, missingTimeNodes, playing, paused, errors: [...new Set(errors)] };
    }));
    const original = path.join(candidates, 'memory-cards');
    const mutant = await fs.mkdtemp(path.join(work, 'disabled-add-'));
    await fs.cp(original, mutant, { recursive: true });
    const sourcePath = path.join(mutant, 'script.js');
    const source = await fs.readFile(sourcePath, 'utf8');
    const target = 'if (question.trim() && answer.trim()) {';
    assert.equal(source.split(target).length, 2);
    await fs.writeFile(sourcePath, source.replace(target, 'if (false) {'));
    result.targets.memory = {};
    for (const [name, directory] of [['reference', original], ['disabledCreate', mutant]]) {
      result.targets.memory[name] = await usingRuntime(directory, async baseURL => ({
        creation: await cardCreation(browser, baseURL),
        archiveSuite: await runSpecs(baseURL, name),
      }));
    }
    assert.deepEqual(result.targets.memory.reference.creation.afterReload, ['Review question']);
    assert.deepEqual(result.targets.memory.disabledCreate.creation.afterReload, []);
    result.targets.memory.emptyNavigation = await usingRuntime(original, url => usingPage(browser, url, async (page, errors) => {
      assert.equal(await page.locator('.card').count(), 0);
      await Promise.all([
        page.waitForEvent('pageerror', { predicate: error => error.message.includes("Cannot set properties of undefined (setting 'className')"), timeout: 5000 }),
        page.locator('#prev').click(),
      ]);
      assert.ok(errors.some(error => error.includes("Cannot set properties of undefined (setting 'className')")));
      return errors;
    }));
    const react = path.join(root, '../candidates/todomvc/examples/react/dist');
    result.targets.todo = await usingRuntime(react, url => usingPage(browser, url, async page => {
      const input = page.getByTestId('text-input');
      await input.fill('Review todo');
      await input.press('Enter');
      const created = await page.getByTestId('todo-item').allTextContents();
      await page.getByRole('link', { name: 'Active', exact: true }).click();
      const active = await page.getByTestId('todo-item').allTextContents();
      await page.getByRole('link', { name: 'Completed', exact: true }).click();
      const completed = await page.getByTestId('todo-item').allTextContents();
      assert.deepEqual([created, active, completed], [['Review todo'], ['Review todo'], []]);
      return { created, active, completed };
    }));
    const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(work, 'browser-audit.json');
    await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
    console.error(`Evidence: ${output}`);
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
