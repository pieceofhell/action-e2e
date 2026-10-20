const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function quote(value) {
  if (/[\r\n\0]/.test(value)) throw new Error('A service path cannot contain line breaks or NUL.');
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
}
function buildUnit({ root, node, environmentFile }) {
  const nodeDirectory = path.posix.dirname(node);
  return `[Unit]
Description=E2P local exploration and inference
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
WorkingDirectory=${quote(root)}
ExecStart=${quote(node)} ${quote(path.posix.join(root, 'scripts/run-unattended.cjs'))}
Environment=${quote('PATH=' + nodeDirectory + ':/usr/local/bin:/usr/bin:/bin')}
EnvironmentFile=-${quote(environmentFile)}
Restart=on-failure
RestartSec=10
KillMode=control-group
TimeoutStopSec=15
UMask=0077

[Install]
WantedBy=default.target
`;
}
function main(argv = process.argv.slice(2)) {
  if (argv.some(item => !['--install', '--replace'].includes(item))) throw new Error('Usage: node scripts/install-linux-service.cjs [--install] [--replace]');
  const root = path.resolve(__dirname, '..');
  const environmentFile = path.join(os.homedir(), '.config/e2p/environment');
  const content = buildUnit({ root, node: process.execPath, environmentFile });
  if (!argv.includes('--install')) { console.log(content); return; }
  if (process.platform !== 'linux') throw new Error('Install this user service on Linux with systemd.');
  if (process.getuid() === 0) throw new Error('Run as the normal user who owns E2P; do not install this user service with sudo.');
  const unitDirectory = path.join(os.homedir(), '.config/systemd/user');
  const destination = path.join(unitDirectory, 'e2p.service');
  if (fs.existsSync(destination) && !argv.includes('--replace')) throw new Error('e2p.service already exists. Inspect it; --replace explicitly updates it.');
  fs.mkdirSync(unitDirectory, { recursive: true }); fs.mkdirSync(path.dirname(environmentFile), { recursive: true });
  if (!fs.existsSync(environmentFile)) fs.writeFileSync(environmentFile, '# Absolute path to the CUDA llama-server binary\n# E2P_LLAMA_SERVER=/home/your-user/llama.cpp/build/bin/llama-server\n# E2P_RUNTIME_PROFILE=auto\n', { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(destination, content, { mode: 0o600 });
  execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
  execFileSync('systemctl', ['--user', 'enable', 'e2p.service'], { stdio: 'inherit' });
  console.log(`Installed ${destination}\nConfigure ${environmentFile}, then run: systemctl --user start e2p\nFor boot without logon: sudo loginctl enable-linger YOUR_USER`);
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { buildUnit, quote };
