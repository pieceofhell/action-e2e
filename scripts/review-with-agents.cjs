const fs = require('node:fs/promises');
const path = require('node:path');
const { buildReviewPacket, saveReviewJson, judgePacket, compareAgentReviews } = require('../src/services/agent-review');
const { redactSecrets } = require('../src/services/auth-config');
const { readConfig, reviewerConfigs, modelDefaults } = require('./lib/agent-config.cjs');

const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'prepare' && args.length === 2) {
    const [root, out] = args.map(value => path.resolve(value));
    const files = (await fs.readdir(root, { withFileTypes: true })).some(entry => entry.name === 'exploration.json' && entry.isFile())
      ? [root] : (await fs.readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => path.join(root, entry.name));
    const runs = [];
    for (const directory of files.sort()) {
      const exploration = await read(path.join(directory, 'exploration.json'));
      if (exploration.access?.mode === 'authenticated' || exploration.bugDiscovery?.evidenceMode === 'disabled-for-authenticated-session') throw new Error('Defect review is unavailable for authenticated explorations.');
      runs.push({ runId: path.basename(directory), exploration });
    }
    if (!runs.length) throw new Error('No exploration records found.');
    const { packet, mapping } = buildReviewPacket(runs, { secretValues: [process.env.E2P_AI_API_KEY] });
    await saveReviewJson(out, 'packet.json', packet);
    await saveReviewJson(out, 'mapping.json', mapping);
    return { cases: packet.cases.length, evidenceSha256: packet.evidenceSha256, packet: path.join(out, 'packet.json') };
  }
  if (command === 'judge' && (args.length === 2 || args.length === 3)) {
    const config = await readConfig(args[2]);
    return judgePacket(await read(args[0]), reviewerConfigs(config, modelDefaults(config)), path.resolve(args[1]));
  }
  if (command === 'compare' && args.length === 3) return compareAgentReviews(...await Promise.all(args.map(read)));
  throw new Error('Usage: review:agents -- prepare <run-or-runs-dir> <out> | judge <packet> <out> [config.json] | compare <packet> <agent-a> <agent-b>');
}

main().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch(error => { process.stderr.write(`${redactSecrets(error.message, [process.env.E2P_AI_API_KEY])}\n`); process.exitCode = 1; });
