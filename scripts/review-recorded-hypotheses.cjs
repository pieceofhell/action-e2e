const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { screenHypotheses } = require('../src/services/bug-discovery');
const prototypeRoot = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(prototypeRoot, '..', 'output', 'current-validation-20261018'));
async function main() {
  const data = JSON.parse(await fs.readFile(path.join(output, 'exploration', 'validation.json'), 'utf8'));
  const runs = [];
  for (const run of data.attempts) {
    if (!/^[a-z0-9-]+$/i.test(run.runId)) throw new Error('Invalid recorded run ID.');
    const exploration = JSON.parse(await fs.readFile(path.join(prototypeRoot, 'prototype-runs', run.runId, 'exploration.json'), 'utf8'));
    runs.push({ target: run.target, repetition: run.repetition, runId: run.runId,
      ...screenHypotheses(run.hypotheses, { states: exploration.agenticExploration.states,
        steps: exploration.agenticExploration.steps, nativeDialogs: exploration.diagnostics?.nativeDialogs || [] }) });
  }
  await fs.writeFile(path.join(output, 'hypothesis-review.json'), JSON.stringify({
    protocol: 'recorded-hypotheses-current-evidence-contract',
    source: 'The original trajectories and hypotheses remain preserved in exploration/validation.json.',
    serviceSha256: crypto.createHash('sha256').update(await fs.readFile(path.join(prototypeRoot, 'src/services/bug-discovery.js'))).digest('hex'),
    runs,
  }, null, 2));
  console.log(JSON.stringify({ retained: runs.reduce((n, run) => n + run.retained.length, 0),
    rejected: runs.reduce((n, run) => n + run.rejected.length, 0) }));
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
