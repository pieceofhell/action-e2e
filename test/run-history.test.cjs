const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const { listRuns, readRun, saveReview, projectFeedback } = require('../src/services/run-history');
const { discoverPotentialBugs } = require('../src/services/bug-discovery');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-history-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  async function run(id, projectPath, quarantined = false) {
    const directory = path.join(root, id);
    await fs.mkdir(path.join(directory, 'results'), { recursive: true });
    await fs.writeFile(path.join(directory, 'inspection.json'), JSON.stringify({ project: { name: 'Sample', path: projectPath } }));
    await fs.writeFile(path.join(directory, 'results/potential-bugs.json'), JSON.stringify({
      status: 'completed', hypotheses: [{ id: 'bug-1', title: 'Timer continues', affectedFlow: 'Typing',
        observed: { result: 'Timer continues while typing.' }, expected: { result: 'Timer should stop.' }, evidence: {} }],
    }));
    if (quarantined) await fs.writeFile(path.join(directory, '.quarantine'), 'pending');
    return directory;
  }
  return { root, run };
}
test('history restores legacy reports, preserves review corrections, scopes memory, and excludes quarantine', async t => {
  const { root, run } = await fixture(t);
  const project = path.join(root, 'project-a');
  const directory = await run('run-a', project);
  await run('run-b', path.join(root, 'project-b'));
  await run('run-private', project, true);
  await fs.writeFile(path.join(directory, 'results/playwright-results.json'), JSON.stringify({ suites: [], stats: { expected: 0, unexpected: 0, skipped: 0, flaky: 0, duration: 0 } }));
  assert.equal((await listRuns(root)).length, 2);
  assert.equal((await readRun(root, 'run-a')).stage, 'executed');
  await assert.rejects(readRun(root, '../escape'));
  await assert.rejects(readRun(root, 'run-private'), /quarantined/);
  await assert.rejects(saveReview(root, 'run-a', { hypothesisId: 'invented', decision: 'confirmed', notes: 'Verified.' }), /not found/);
  await assert.rejects(saveReview(root, 'run-a', { hypothesisId: 'bug-1', decision: 'confirmed', notes: ' ' }), /justification/);
  await saveReview(root, 'run-a', { hypothesisId: 'bug-1', decision: 'inconclusive', notes: 'Needs checking.' });
  await new Promise(resolve => setTimeout(resolve, 5));
  await saveReview(root, 'run-a', { hypothesisId: 'bug-1', decision: 'expected-behavior', notes: 'Typing must finish before the timer expires.' });
  await saveReview(root, 'run-b', { hypothesisId: 'bug-1', decision: 'confirmed', notes: 'Different application.' });
  const restored = await readRun(root, 'run-a');
  assert.equal(restored.reviews.length, 2);
  assert.equal(restored.bugReport.hypotheses[0].expected.result, 'Timer should stop.');
  const memory = await projectFeedback(root, project);
  assert.equal(memory.length, 1);
  assert.equal(memory[0].decision, 'expected-behavior');
  assert.deepEqual(await projectFeedback(root, path.join(root, 'other')), []);
});

test('discovery receives prior human reasoning with explicit historical provenance', async t => {
  const { root, run } = await fixture(t);
  const project = path.join(root, 'project-a');
  await run('run-a', project);
  await saveReview(root, 'run-a', { hypothesisId: 'bug-1', decision: 'expected-behavior', notes: 'The countdown is an intentional game rule.' });
  const app = express(); app.use(express.json());
  const requests = [];
  app.post('/v1/chat/completions', (req, res) => {
    requests.push(req.body);
    res.json({ choices: [{ message: { content: JSON.stringify({ hypotheses: [] }) } }] });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const report = await discoverPotentialBugs({
    inspection: { project: { name: 'Sample', path: project } },
    exploration: { states: [{ id: 'state-1', path: '/', visibleText: 'Time left: 10s' }], steps: [] },
    aiConfig: { provider: 'llama-cpp', model: 'test', endpoint: `http://127.0.0.1:${server.address().port}/v1` },
    feedbackRoot: root,
  });
  assert.equal(requests.length, 1);
  assert.match(JSON.stringify(requests[0]), /intentional game rule/);
  assert.match(JSON.stringify(requests[0]), /Never suppress or confirm/);
  assert.equal(report.humanFeedback.count, 1);
  assert.equal(report.mode, 'feedback-informed-model-guided');
  assert.equal(report.status, 'completed');
});

test('history UI opens an old run and persists human review across a page reload', { timeout: 30000 }, async t => {
  const { root, run } = await fixture(t);
  await run('run-a', path.join(root, 'project-a'));
  const app = express(); app.use(express.json());
  app.get('/api/health', (req, res) => res.json({ ok: true, requestToken: 'test' }));
  app.get('/api/ai/status', (req, res) => res.json({ providers: [] }));
  app.get('/api/history', async (req, res) => res.json({ runs: await listRuns(root) }));
  app.get('/api/history/:id', async (req, res) => res.json({ run: await readRun(root, req.params.id) }));
  app.post('/api/history/:id/reviews', async (req, res) => res.json({ review: await saveReview(root, req.params.id, req.body) }));
  app.use(express.static(path.join(__dirname, '../public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => console.error(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  async function open() {
    await page.getByRole('button', { name: 'Run history', exact: true }).click();
    await page.locator('[data-open-run="run-a"]').click();
    await page.locator('.human-review summary').click();
  }
  await open();
  await page.getByLabel('Decision', { exact: true }).selectOption('expected-behavior');
  await page.getByLabel('Justification and supporting evidence').fill('The game requires finishing before time expires.');
  await page.getByRole('button', { name: 'Save human review' }).click();
  await page.getByText('Saved. Future analyses of this project can consult this feedback.').waitFor();
  await page.reload();
  await open();
  assert.equal(await page.getByLabel('Decision', { exact: true }).inputValue(), 'expected-behavior');
  assert.equal(await page.getByLabel('Justification and supporting evidence').inputValue(), 'The game requires finishing before time expires.');
  assert.equal(await page.locator('#projectPathInput').inputValue(), '');
});
