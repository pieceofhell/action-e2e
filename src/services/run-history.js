const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isArtifactRunQuarantined } = require('./artifact-store');
const { parsePlaywrightReport } = require('./test-runner');
const { redactSecrets } = require('./auth-config');

const DECISIONS = ['confirmed', 'expected-behavior', 'environment', 'inconclusive'];
async function optionalJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
}
function projectKey(value) {
  if (!value) return '';
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
async function runPath(root, id) {
  if (!/^[a-z0-9-]+$/i.test(id || '')) throw new Error('Invalid run identifier.');
  const directory = path.join(root, id);
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid run directory.');
  if (await isArtifactRunQuarantined(directory)) throw new Error('Artifacts are quarantined until secret validation completes.');
  return directory;
}
async function readRun(root, id) {
  const directory = await runPath(root, id);
  const [metadata, inspection, exploration, generatedTests, rawReport, insights, savedExecution, bugs, auth] = await Promise.all([
    'run-metadata.json', 'inspection.json', 'exploration.json', 'generated-tests.json',
    'results/playwright-results.json', 'results/insights.json', 'results/execution.json', 'results/potential-bugs.json', 'auth-metadata.json',
  ].map(file => optionalJson(path.join(directory, file))));
  const live = exploration || inspection?.liveExploration;
  const report = savedExecution?.report || (rawReport ? parsePlaywrightReport(rawReport, { runDirectory: directory }) : null);
  const bugReport = bugs || live?.bugDiscovery || null;
  const stat = await fs.stat(directory);
  return {
    id, projectPath: metadata?.projectPath || inspection?.project?.path || '',
    projectName: inspection?.project?.name || path.basename(metadata?.projectPath || '') || id,
    createdAt: metadata?.createdAt || stat.birthtime.toISOString(),
    stage: report ? 'executed' : generatedTests ? 'generated' : live ? live.status === 'failed' ? 'failed' : 'explored' : 'incomplete',
    model: bugReport?.model || inspection?.ai?.model || '',
    artifactBaseUrl: `/artifacts/${id}`, report, insights, bugReport,
    authMode: savedExecution?.auth?.mode || auth?.mode || 'guest',
    qaCoverage: live?.agenticExploration?.qaCoverage || null,
    explorationSummary: live?.summary || live?.error || '',
    generatedTests: generatedTests || [],
    reviews: await readReviews(directory),
  };
}
async function readReviews(directory) {
  const reviewDirectory = path.join(directory, 'human-reviews');
  const files = await fs.readdir(reviewDirectory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const events = (await Promise.all(files.filter(name => /^[a-f0-9-]+\.json$/.test(name)).map(name => optionalJson(path.join(reviewDirectory, name))))).filter(Boolean);
  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
async function listRuns(root) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const runs = [];
  // Read sequentially to avoid flooding disk when historical runs contain large reports.
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/i.test(entry.name)) continue;
    try {
      const run = await readRun(root, entry.name);
      runs.push({ id: run.id, projectName: run.projectName, projectPath: run.projectPath, createdAt: run.createdAt,
        stage: run.stage, model: run.model, summary: run.report?.summary || null,
        hypothesisCount: run.bugReport?.hypotheses?.length || 0, reviewCount: new Set(run.reviews.map(r => r.hypothesisId)).size });
    } catch { /* A quarantined, removed, or unreadable run must not prevent listing the rest. */ }
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function saveReview(root, runId, input) {
  if (!DECISIONS.includes(input?.decision)) throw new Error('Choose a valid human decision.');
  if (typeof input.notes !== 'string' || !input.notes.trim() || input.notes.length > 3000) throw new Error('A justification between 1 and 3000 characters is required.');
  const run = await readRun(root, runId);
  const hypothesis = run.bugReport?.hypotheses?.find(item => item.id === input.hypothesisId);
  if (!hypothesis) throw new Error('Hypothesis not found in this run.');
  const review = {
    id: crypto.randomUUID(), runId, hypothesisId: hypothesis.id, projectPath: run.projectPath,
    title: hypothesis.title, affectedFlow: hypothesis.affectedFlow || '',
    expected: hypothesis.expected?.result || hypothesis.expected?.summary || '',
    decision: input.decision, notes: redactSecrets(input.notes.trim()), createdAt: new Date().toISOString(),
  };
  const directory = path.join(await runPath(root, runId), 'human-reviews');
  await fs.mkdir(directory, { recursive: true });
  // Each correction creates an immutable event, so concurrent reviews cannot overwrite one another.
  await fs.writeFile(path.join(directory, `${review.id}.json`), JSON.stringify(review, null, 2), { flag: 'wx' });
  return review;
}
async function projectFeedback(root, projectPath) {
  const key = projectKey(projectPath);
  if (!key) return [];
  const runs = await listRuns(root);
  const reviews = [];
  for (const run of runs.filter(item => projectKey(item.projectPath) === key)) {
    try { reviews.push(...await readReviews(await runPath(root, run.id))); } catch { /* Unavailable feedback is never fabricated. */ }
  }
  reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set();
  return reviews.filter(review => {
    const fingerprint = `${review.title}|${review.affectedFlow}|${review.expected}`.toLowerCase();
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint); return true;
  }).slice(0, 20).map(({ id, runId, title, affectedFlow, expected, decision, notes, createdAt }) => ({ id, runId, title, affectedFlow, expected, decision, notes, createdAt }));
}
module.exports = { readRun, listRuns, saveReview, projectFeedback, projectKey };
