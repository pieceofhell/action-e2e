const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseOptions, preparePlan } = require('./lib/runtime-profile.cjs');
function main() {
  const options = parseOptions(process.argv.slice(2));
  const plan = preparePlan(options);
  console.log(JSON.stringify(plan, null, 2));
  if (options.dryRun) return;
  if (!plan.launchModel) throw new Error('No local model selected. Configure a separate provider or run E2P with npm start.');
  if (!plan.server || !plan.runtime.available) throw new Error('llama-server is unavailable. Set E2P_LLAMA_SERVER to a working binary.');
  for (const asset of [options.modelPath, options.projectorPath].filter(Boolean)) {
    if (!fs.existsSync(asset)) throw new Error(`Missing local model asset: ${asset}`);
  }
  const directory = path.resolve(__dirname, '../logs'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'runtime-plan.json'), JSON.stringify({ ...plan, startedAt: new Date().toISOString() }, null, 2));
  const child = spawn(plan.server, plan.args, { stdio: 'inherit', windowsHide: true, env: { ...process.env, ...plan.modelEnvironment } });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
