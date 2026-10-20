const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
async function check(relative, expected) {
  const file = path.resolve(root, relative);
  if (path.relative(root, file).startsWith('..') || path.isAbsolute(path.relative(root, file))) throw new Error('Manifest path leaves the repository.');
  const actual = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  if (actual !== expected) throw new Error(`Evidence hash differs: ${relative}`);
}
async function main() {
  const records = JSON.parse(await fs.readFile(path.join(root, 'evaluation-results/current-20261020/evidence-manifest.json'), 'utf8'));
  for (const row of records) await check(row.path, row.sha256);
  const versions = JSON.parse(await fs.readFile(path.join(root, 'paper/versions.json'), 'utf8'));
  let count = records.length;
  for (const version of versions) {
    await check(`paper/${version.path}`, version.sha256); count++;
    for (const [name, sha] of Object.entries(version.sources)) {
      await check(`paper/${path.posix.dirname(version.path)}/${name}`, sha); count++;
    }
  }
  console.log(`${count} evidence, paper and source hashes verified.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
