const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateCorpus, measureProject, summarizeRun, aggregateGroups } = require('../src/services/corpus-evaluation');

const manifest = { schemaVersion: 1, groups: [{ id: 'data' }], applications: [
  { id: 'alpha', group: 'data', purpose: 'purpose', behavior: 'behavior', historicalLimit: 'limit' },
  { id: 'beta', group: 'data', purpose: 'purpose', behavior: 'behavior', historicalLimit: 'limit' },
] };

test('corpus rejects traversal, duplicate applications and undefined families', () => {
  for (const patch of [{ id: '../alpha' }, { id: 'alpha' }, { group: 'unknown' }]) {
    const candidate = structuredClone(manifest);
    Object.assign(candidate.applications[1], patch);
    assert.throws(() => validateCorpus(candidate));
  }
});

test('corpus keeps missing attempts and unavailable execution counts visible', () => {
  const run = summarizeRun({ stages: { execution: {} } });
  assert.equal(run.testsExecuted, null);
  const [group] = aggregateGroups(manifest, [{ id: 'alpha', run }, { id: 'beta', run: null }]);
  assert.equal(group.applications, 2);
  assert.equal(group.missingLogs, 1);
  assert.equal(group.reachedExecution, 1);
  assert.equal(group.testsExecuted, null);
  assert.throws(() => aggregateGroups(manifest, [{ id: 'alpha', run }]));
});

test('stopped planning is an attempt without executed tests, not a passing test', () => {
  const run = summarizeRun({ status: 'failed', stages: { planning: {} } });
  assert.equal(run.reachedExecution, false);
  assert.equal(run.testsPassed, null);
  const [group] = aggregateGroups(manifest, [{ id: 'alpha', run }, { id: 'beta', run }]);
  assert.equal(group.testsExecuted, 0);
  assert.equal(group.reachedExecution, 0);
  assert.equal(group.logs, 2);
});

test('source inventory excludes dependencies and media, tracks evidence and detects source changes', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-corpus-'));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'node_modules'));
  await fs.writeFile(path.join(directory, 'node_modules', 'vendor.js'), 'fetch("https://vendor.invalid")');
  await fs.writeFile(path.join(directory, 'vendor.min.js'), 'localStorage.getItem("x")');
  await fs.writeFile(path.join(directory, 'image.png'), Buffer.from([0, 1]));
  await fs.writeFile(path.join(directory, 'index.html'), '<main>Test</main>\n');
  await fs.writeFile(path.join(directory, 'script.js'), 'localStorage.getItem("x");\n\nfetch("https://example.invalid");\n');
  const first = await measureProject(directory);
  const second = await measureProject(directory);
  assert.equal(first.sourceFiles, 2);
  assert.equal(first.nonblankSourceLines, 3);
  assert.deepEqual(first.detectedSignals.browserStorage, ['script.js']);
  assert.deepEqual(first.htmlDocuments, ['index.html']);
  assert.equal(first.sourceSha256, second.sourceSha256);
  await fs.appendFile(path.join(directory, 'script.js'), '// new line\n');
  assert.notEqual(first.sourceSha256, (await measureProject(directory)).sourceSha256);
});
