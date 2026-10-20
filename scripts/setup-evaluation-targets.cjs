const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const destination = path.resolve(process.argv[2] || path.join(__dirname, '../../candidates'));
const targets = [
  { name: 'vanillawebprojects', url: 'https://github.com/bradtraversy/vanillawebprojects.git', revision: 'adc66a181a67049fb413c8862181ddc6c45ba22b' },
  { name: 'todomvc', url: 'https://github.com/tastejs/todomvc.git', revision: 'ff43b02e59dfa604386bb382034b2cd07c2bcd8a' },
];
fs.mkdirSync(destination, { recursive: true });
for (const target of targets) {
  const directory = path.join(destination, target.name);
  if (fs.existsSync(directory)) {
    console.log(`Preserved existing ${directory}; verify source hashes before collecting comparable evidence.`); continue;
  }
  execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', target.url, directory], { stdio: 'inherit' });
  execFileSync('git', ['-C', directory, 'checkout', '--detach', target.revision], { stdio: 'inherit' });
}
console.log('Targets prepared. For TodoMVC: install its React dependencies and run its build before evaluation.');
