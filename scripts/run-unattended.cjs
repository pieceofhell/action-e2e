// Owns only the children it starts. Ctrl+C stops both; it never terminates unrelated servers.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'win32' && !process.argv.includes('--application-only')) {
  throw new Error('On Linux start llama-server separately and use --application-only.');
}
const logs = path.join(root, 'logs');
fs.mkdirSync(logs, { recursive: true });
let stopping = false;
const children = new Set();
const timers = new Set();
function log(name, chunk) {
  const file = path.join(logs, `${name}.log`);
  // Bound disk use: one active log and one previous log per service (10 MiB each).
  if (fs.existsSync(file) && fs.statSync(file).size > 10 * 1024 * 1024) {
    const old = `${file}.previous`; if (fs.existsSync(old)) fs.unlinkSync(old);
    fs.renameSync(file, old);
  }
  fs.appendFileSync(file, chunk);
}
function supervise(name, command, args) {
  let failures = 0;
  function start() {
    if (stopping) return;
    const started = Date.now();
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    children.add(child);
    log(name, `\n${new Date().toISOString()} starting\n`);
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
  for (const child of children) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t'], { windowsHide: true, stdio: 'ignore' });
    } else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
supervise('application', process.execPath, ['src/server.js']);
if (!process.argv.includes('--application-only')) {
  supervise('model', 'powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/start-rtx3060.ps1')]);
}
console.log(`E2P supervisor active. Logs: ${logs}. Stop with Ctrl+C.`);
