const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const sum = values => values.reduce((total, value) => total + value, 0);

function summarize(manifest, result) {
  assert.equal(result.unchanged, true, 'Results must refer to frozen inputs');
  assert.deepEqual(result.attempts.map(row => row.id), manifest.schedule.map(row => row.id));
  assert.equal(new Set(result.attempts.map(row => row.id)).size, result.attempts.length);
  for (const row of result.attempts) {
    const domain = new Set(manifest.reference[row.target]);
    assert.ok(row.effects.every(effect => domain.has(effect)));
    assert.ok(row.verified.every(effect => row.effects.includes(effect)));
  }
  const metrics = rows => ({
    attempts: rows.length, completed: rows.filter(row => row.status === 'completed').length,
    actions: sum(rows.map(row => row.actions)), possible: sum(rows.map(row => manifest.reference[row.target].length)),
    observed: sum(rows.map(row => row.effects.length)), rechecked: sum(rows.map(row => row.verified.length)),
    medianExplorationMs: median(rows.map(row => row.explorationMs)), medianActions: median(rows.map(row => row.actions)),
    elapsedMsAvailable: rows.filter(row => Number.isFinite(row.explorationMs)).length,
    withRuntimeException: rows.filter(row => row.exceptionSignatures.length).length,
  });
  const aggregate = rows => Object.fromEntries(manifest.protocol.conditions.map(condition => [condition, metrics(rows.filter(row => row.condition === condition))]));
  const pairs = [];
  for (const llm of result.attempts.filter(row => row.condition === 'llm')) {
    const random = result.attempts.find(row => row.condition === 'random' && row.target === llm.target && row.repetition === llm.repetition);
    assert.ok(random, `Missing control for ${llm.id}`);
    pairs.push({ target: llm.target, repetition: llm.repetition, deltaObserved: llm.effects.length - random.effects.length,
      deltaRechecked: llm.verified.length - random.verified.length });
  }
  const byTarget = Object.fromEntries([...new Set(result.attempts.map(row => row.target))].map(target =>
    [target, aggregate(result.attempts.filter(row => row.target === target))]));
  return { byTarget, overall: aggregate(result.attempts), pairs, pairedObserved: {
    higher: pairs.filter(pair => pair.deltaObserved > 0).length,
    equal: pairs.filter(pair => pair.deltaObserved === 0).length,
    lower: pairs.filter(pair => pair.deltaObserved < 0).length,
    meanDifference: sum(pairs.map(pair => pair.deltaObserved)) / pairs.length,
  } };
}

if (require.main === module) {
  try {
    const root = path.resolve(process.argv[2]);
    const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const summary = summarize(read('manifest.json'), read('result.json'));
    const output = JSON.stringify(summary, null, 2) + '\n';
    if (process.argv[3]) fs.writeFileSync(process.argv[3], output, { flag: 'wx' });
    process.stdout.write(output);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { summarize };
