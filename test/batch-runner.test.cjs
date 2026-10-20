const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const { createBatchQueue, runPipelineJob } = require('../src/services/batch-runner');
const { selectBatchApprovedFlows } = require('../src/services/batch-auto-approval');
const { readRunLog, updateRunLog } = require('../src/services/run-log');
const { listRuns } = require('../src/services/run-history');

async function eventually(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Condition did not become true in time.');
}

test('batch salvages only a recorded change, never speculative low-confidence criteria', () => {
  const plan = { flows: [{ id: 'invented-validation', confidence: 'low',
    evidenceStateIds: ['state-2'], criteria: [{ title: 'Speculative', given: '', when: '', then: 'Account is created' }] }] };
  const live = { agenticExploration: {
    states: [
      { id: 'state-1', fingerprint: 'before', headings: ['Register'], inputDetails: [] },
      { id: 'state-2', fingerprint: 'after', headings: ['Register'], inputDetails: [{ label: 'Username', value: 'sampleuser' }] },
    ],
    steps: [{ step: 1, status: 'completed', changed: true, beforeStateId: 'state-1', afterStateId: 'state-2',
      action: { kind: 'fill', name: 'Username', domId: 'username', value: 'sampleuser' } }],
  } };
  const result = selectBatchApprovedFlows(plan, live, { mode: 'guest' });
  assert.equal(result.rule, 'observed-transition-only');
  assert.equal(result.flows.length, 1);
  assert.equal(result.flows[0].confidence, 'low');
  assert.equal(result.flows[0].basedOnFlowId, 'invented-validation');
  assert.match(result.flows[0].criteriaText, /sampleuser/);
  assert.doesNotMatch(result.flows[0].criteriaText, /Account is created/);
  assert.deepEqual(selectBatchApprovedFlows(plan, live, { mode: 'authenticated' }).flows, []);
});

test('batch does not salvage a wait, unchanged action, or uncited state', () => {
  const plan = { flows: [{ id: 'low', confidence: 'low', evidenceStateIds: ['state-1'] }] };
  const live = { agenticExploration: {
    states: [{ id: 'state-1', fingerprint: 'before' }, { id: 'state-2', fingerprint: 'after' }],
    steps: [{ step: 1, status: 'completed', changed: true, beforeStateId: 'state-1', afterStateId: 'state-2',
      action: { kind: 'wait', name: 'Wait 3s' } }],
  } };
  assert.deepEqual(selectBatchApprovedFlows(plan, live, { mode: 'guest' }).flows, []);
});

test('batch queue runs projects sequentially and persists statuses without credentials', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-batch-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let active = 0;
  let peak = 0;
  const queue = createBatchQueue({ prototypeRoot: root, runJob: async ({ job, onUpdate }) => {
    active++;
    peak = Math.max(peak, active);
    onUpdate('execution', `Running ${job.projectName}`);
    await new Promise(resolve => setTimeout(resolve, 35));
    active--;
    return { summary: { total: 1, passed: 1, failed: 0 } };
  } });
  await queue.initialize();
  const batch = await queue.enqueue({ projectPaths: ['C:\\sample\\one', 'C:\\sample\\two'],
    aiConfig: { provider: 'remote', model: 'test-model', apiKey: 'super-secret-key' },
    authConfig: { mode: 'guest' }, autoSkipBugReview: true });
  await eventually(() => queue.get(batch.id).jobs.every(job => job.status === 'completed'));
  await eventually(async () => {
    const saved = JSON.parse(await fs.readFile(path.join(root, 'prototype-runs', '.batches', `${batch.id}.json`), 'utf8'));
    return saved.jobs.every(job => job.status === 'completed');
  });
  assert.equal(peak, 1);
  assert.equal(queue.get(batch.id).jobs.length, 2);
  const persisted = await fs.readFile(path.join(root, 'prototype-runs', '.batches', `${batch.id}.json`), 'utf8');
  assert.doesNotMatch(persisted, /super-secret-key/);
  assert.match(persisted, /"status": "completed"/);
});

test('batch failures redact the configured API key from persisted errors', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-batch-redaction-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queue = createBatchQueue({ prototypeRoot: root, runJob: async () => {
    throw new Error('Provider echoed sensitive-key-123 in its failure.');
  } });
  await queue.initialize();
  const batch = await queue.enqueue({ projectPaths: ['C:\\sample\\one'],
    aiConfig: { provider: 'remote', model: 'test-model', apiKey: 'sensitive-key-123' },
    authConfig: { mode: 'guest' }, autoSkipBugReview: true });
  await eventually(() => queue.get(batch.id).jobs[0].status === 'failed');
  await eventually(async () => JSON.parse(await fs.readFile(path.join(root, 'prototype-runs', '.batches', `${batch.id}.json`), 'utf8')).jobs[0].status === 'failed');
  const saved = await fs.readFile(path.join(root, 'prototype-runs', '.batches', `${batch.id}.json`), 'utf8');
  assert.doesNotMatch(saved, /sensitive-key-123/);
});

test('run log consolidates stages, preserves all events, and redacts obvious secrets', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-run-log-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await updateRunLog(root, { stages: { inspection: { data: { name: 'Example' } } },
    events: [{ message: 'Inspecting' }], apiKey: 'unsafe-key' });
  await updateRunLog(root, { stages: { execution: { data: { summary: { passed: 1 } } } },
    events: [{ message: 'Executing' }], status: 'completed' });
  const log = await readRunLog(root);
  assert.equal(log.stages.inspection.data.name, 'Example');
  assert.equal(log.stages.execution.data.summary.passed, 1);
  assert.equal(log.events.length, 2);
  assert.equal(log.apiKey, '[REDACTED]');
  const index = JSON.parse(await fs.readFile(path.join(root, 'run-index.json'), 'utf8'));
  assert.equal(index.stage, 'executed');
});

test('history lists indexed runs without loading their complete log', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-indexed-history-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runDirectory = path.join(root, 'indexed-run');
  await fs.mkdir(runDirectory);
  await fs.writeFile(path.join(runDirectory, 'run-log.json'), 'not parsed by listRuns');
  await fs.writeFile(path.join(runDirectory, 'run-index.json'), JSON.stringify({
    id: 'indexed-run', projectName: 'Example', projectPath: 'C:\\example',
    createdAt: '2026-01-01T00:00:00.000Z', stage: 'executed', model: 'test',
    summary: { total: 1, passed: 1, failed: 0 }, hypothesisCount: 2,
  }));
  const runs = await listRuns(root);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].hypothesisCount, 2);
  assert.equal(runs[0].summary.passed, 1);
});

test('failed live exploration still saves inspection, observed evidence, and the failure reason', { timeout: 120000 }, async t => {
  const previous = process.env.E2P_ENABLE_BASELINE_MODE;
  process.env.E2P_ENABLE_BASELINE_MODE = '1';
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-batch-target-'));
  const runsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-batch-runs-'));
  t.after(async () => {
    if (previous === undefined) delete process.env.E2P_ENABLE_BASELINE_MODE;
    else process.env.E2P_ENABLE_BASELINE_MODE = previous;
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(runsRoot, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(project, 'index.html'), '<!doctype html><html><head><title>Batch fixture</title></head><body><h1>Batch fixture</h1><button>Start</button></body></html>');
  const job = { projectPath: project, projectName: path.basename(project), stage: 'queued', runId: null };
  const batch = { id: 'test-batch', autoSkipBugReview: true };
  await assert.rejects(runPipelineJob({ prototypeRoot: path.resolve(__dirname, '..'), runsRoot, job, batch,
    aiConfig: { provider: 'heuristic' }, authConfig: { mode: 'guest' }, onUpdate: (stage) => { job.stage = stage; } }),
  /useful live interface exploration/);
  const log = await readRunLog(path.join(runsRoot, job.runId));
  assert.equal(log.status, 'failed');
  assert.ok(log.stages.inspection);
  assert.ok(log.stages.exploration);
  assert.equal(log.stages.exploration.data.status, 'failed');
  assert.match(log.error, /useful live interface exploration/);
});

test('batch UI queues multiple paths and exposes the saved per-run log', { timeout: 30000 }, async t => {
  const app = express(); app.use(express.json());
  let submitted;
  let batches = [];
  app.get('/api/health', (req, res) => res.json({ ok: true, requestToken: 'test' }));
  app.get('/api/ai/status', (req, res) => res.json({ providers: [] }));
  app.get('/api/batches', (req, res) => res.json({ batches }));
  app.post('/api/batches', (req, res) => {
    submitted = req.body;
    const batch = { id: 'batch-1', createdAt: new Date().toISOString(), model: 'test-model',
      autoSkipBugReview: submitted.autoSkipBugReview,
      jobs: submitted.projectPaths.map((projectPath, index) => ({ id: `job-${index}`, projectPath,
        projectName: `project-${index}`, status: 'completed', stage: 'execution', message: 'Pipeline finished.',
        runId: `run-${index}`, summary: { total: 1, passed: 1, failed: 0 } })) };
    batches = [batch];
    res.status(202).json({ batch });
  });
  app.use(express.static(path.join(__dirname, '../public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#batchPathsInput').fill('C:\\projects\\one\nC:\\projects\\two');
  await page.getByRole('button', { name: 'Queue projects' }).click();
  await page.getByText('project-0', { exact: true }).waitFor({ state: 'attached' });
  assert.deepEqual(submitted.projectPaths, ['C:\\projects\\one', 'C:\\projects\\two']);
  assert.equal(submitted.autoSkipBugReview, true);
  assert.equal(await page.locator('#batchList a[href$="run-log.json"]').count(), 2);
});
