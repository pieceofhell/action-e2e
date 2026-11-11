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
  const evidenceRoot = path.join(root, 'evaluation-results');
  let count = 0;
  for (const directory of await fs.readdir(evidenceRoot, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    let text;
    try { text = await fs.readFile(path.join(evidenceRoot, directory.name, 'evidence-manifest.json'), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const row of JSON.parse(text)) {
      await check(row.path, row.sha256);
      count++;
    }
  }
  const versions = JSON.parse(await fs.readFile(path.join(root, 'paper/versions.json'), 'utf8'));
  for (const version of versions) {
    await check(`paper/${version.path}`, version.sha256); count++;
    for (const [name, sha] of Object.entries(version.sources)) {
      await check(`paper/${path.posix.dirname(version.path)}/${name}`, sha); count++;
    }
  }
  console.log(`${count} evidence, paper and source hashes verified.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
