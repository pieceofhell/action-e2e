// Owns only the children it starts. Profiles are fixed at startup, not changed during an evaluation.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { parseOptions, preparePlan } = require('./lib/runtime-profile.cjs');
const root = path.resolve(__dirname, '..');
const logs = path.resolve(process.env.E2P_LOG_DIRECTORY || path.join(root, 'logs'));
let stopping = false;
const children = new Set();
const timers = new Set();
function log(name, chunk) {
  const file = path.join(logs, `${name}.log`);
  if (fs.existsSync(file) && fs.statSync(file).size > 10 * 1024 * 1024) {
    const old = `${file}.previous`; if (fs.existsSync(old)) fs.unlinkSync(old);
    fs.renameSync(file, old);
  }
  fs.appendFileSync(file, chunk);
}
function portOccupied(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(1000); socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false)); socket.once('timeout', () => finish(false));
  });
}
function killChild(child, force = false) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])], { windowsHide: true, stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
function supervise(name, command, args, environment = {}) {
  let failures = 0;
  function start() {
    if (stopping) return;
    const started = Date.now();
    const child = spawn(command, args, { cwd: root, windowsHide: true, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...environment } });
    children.add(child);
    log(name, `\n${new Date().toISOString()} starting pid=${child.pid || 'unavailable'}\n`);
    child.stdout.on('data', data => log(name, data)); child.stderr.on('data', data => log(name, data));
    child.on('error', error => log(name, `${error.message}\n`));
    child.once('close', code => {
      children.delete(child);
      if (stopping) return;
      failures = Date.now() - started > 300000 ? 1 : failures + 1;
      const delay = Math.min(60000, 2000 * 2 ** Math.min(failures - 1, 5));
      log(name, `${new Date().toISOString()} exit=${code}; restart in ${delay}ms\n`);
      const timer = setTimeout(() => { timers.delete(timer); start(); }, delay); timers.add(timer);
    });
  }
  start();
}
function stop() {
  if (stopping) return; stopping = true;
  for (const timer of timers) clearTimeout(timer);
  for (const child of children) killChild(child);
  const deadline = setTimeout(() => { for (const child of children) killChild(child, true); }, 5000); deadline.unref();
}
async function main() {
  const options = parseOptions(process.argv.slice(2));
  const plan = options.applicationOnly
    ? { profile: 'separate-provider', launchModel: false, reason: 'Application-only mode requested.' }
    : preparePlan(options);
  if (options.dryRun) { console.log(JSON.stringify(plan, null, 2)); return; }
  if (await portOccupied(Number(process.env.PORT || 4318))) throw new Error('E2P port is already occupied. Stop the existing instance or choose another PORT.');
  if (plan.launchModel && await portOccupied(8081)) {
    plan.launchModel = false; plan.reason = 'Port 8081 is already occupied. Preserve that process and use its model through E2P if compatible.';
    plan.reusedModelPort = true;
  }
  if (plan.launchModel) {
    if (!plan.server || !plan.runtime.available) throw new Error('llama-server unavailable. Set E2P_LLAMA_SERVER or use --application-only for an existing provider.');
    for (const asset of [options.modelPath, options.projectorPath].filter(Boolean)) {
      if (!fs.existsSync(asset)) throw new Error(`Missing model asset: ${asset}`);
    }
  }
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(logs, 'runtime-plan.json'), JSON.stringify({ ...plan, startedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify(plan, null, 2));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  supervise('application', process.execPath, ['src/server.js']);
  if (plan.launchModel) supervise('model', plan.server, plan.args, plan.modelEnvironment);
  console.log(`E2P supervisor active. Logs: ${logs}. Stop with Ctrl+C.`);
  if (!plan.launchModel) console.log('A working inference provider is still required for exploration.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
