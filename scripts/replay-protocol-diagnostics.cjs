const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { reproduceHypotheses } = require('../src/services/hypothesis-reproducer');
const { capturePageObservation } = require('../src/services/live-explorer');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');
const root = path.resolve(__dirname, '..');
async function main() {
  const source = path.resolve(process.argv[2] || path.join(root, 'evaluation-results/current-20261020/diverse-contexts/validation.json'));
  const output = path.resolve(process.argv[3] || path.join(path.dirname(source), '../replay-after-fix'));
  await fs.mkdir(output, { recursive: true });
  const destination = path.join(output, 'result.json');
  const original = JSON.parse(await fs.readFile(source, 'utf8'));
  const result = { protocol: 'recorded-diagnostic-replay-no-new-exploration', startedAt: new Date().toISOString(),
    sourceManifestSha256: crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'),
    reproducerSha256: crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'src/services/hypothesis-reproducer.js'))).digest('hex'),
    originalCollectionUnmodified: true, attempts: [] };
  await fs.writeFile(destination, JSON.stringify(result, null, 2), { flag: 'wx' });
  for (const row of original.attempts) {
    const hypotheses = (row.hypotheses || []).filter(item => item.expected?.source === 'runtime-diagnostic');
    if (!hypotheses.length) continue;
    const target = original.targets.find(item => item.id === row.target);
    const exploration = JSON.parse(await fs.readFile(path.join(root, 'prototype-runs', row.runId, 'exploration.json'), 'utf8'));
    const runtime = await startTargetRuntime({ targetProjectPath: target.projectPath, runtimeConfig: { mode: 'static' } });
    const browser = await chromium.launch({ headless: true });
    try {
      const replay = await reproduceHypotheses({ browser, baseUrl: runtime.baseUrl,
        exploration: exploration.agenticExploration, hypotheses,
        observeCurrentPage: page => capturePageObservation({ page, baseUrl: runtime.baseUrl, disposableLocalProfile: true }),
        evidenceDirectory: path.join(output, row.runId), artifactBaseUrl: '' });
      result.attempts.push({ target: row.target, repetition: row.repetition, sourceRunId: row.runId,
        originalStatuses: hypotheses.map(item => item.reproduction?.status),
        replays: replay.map(item => ({ id: item.id, reproduction: item.reproduction })) });
      await fs.writeFile(destination, JSON.stringify(result, null, 2));
    } finally { await browser.close(); await runtime.stop(); }
  }
  result.completedAt = new Date().toISOString(); await fs.writeFile(destination, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.attempts, null, 2));
  if (result.attempts.some(row => row.replays.some(item => item.reproduction.status !== 'runtime-diagnostic-reproduced'))) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
