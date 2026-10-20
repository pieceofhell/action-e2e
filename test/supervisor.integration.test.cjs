const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');

async function eventually(predicate, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await predicate()) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Supervisor state did not converge within its test deadline.');
}
test('portable supervisor refuses duplicate startup, recovers its application, and stops its children', { timeout: 45000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'e2p-supervisor-'));
  const environment = { ...process.env, PORT: String(port), E2P_LOG_DIRECTORY: directory };
  const supervisor = spawn(process.execPath, ['scripts/run-unattended.cjs', '--application-only'], {
    cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errors = ''; supervisor.stderr.on('data', data => { errors += data.toString(); });
  const stop = () => {
    if (supervisor.exitCode !== null || supervisor.signalCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(supervisor.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else supervisor.kill('SIGTERM');
  };
  t.after(async () => {
    stop();
    if (supervisor.exitCode === null && supervisor.signalCode === null) await once(supervisor, 'close');
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const healthy = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok && (await response.json()).ok === true;
  };
  const lastWorker = async () => [...(await fs.readFile(path.join(directory, 'application.log'), 'utf8')).matchAll(/starting pid=(\d+)/g)].at(-1)?.[1];
  await eventually(healthy);
  const firstWorker = await lastWorker(); assert.ok(firstWorker);
  const duplicate = spawnSync(process.execPath, ['scripts/run-unattended.cjs', '--application-only'], {
    cwd: root, env: environment, windowsHide: true, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(duplicate.status, 1); assert.match(duplicate.stderr, /already occupied/);
  process.kill(Number(firstWorker), 'SIGTERM');
  await eventually(async () => (await lastWorker()) !== firstWorker && await healthy());
  assert.equal(errors, '');
  const closed = once(supervisor, 'close'); stop(); await closed;
  await eventually(async () => { try { await healthy(); return false; } catch { return true; } });
});
