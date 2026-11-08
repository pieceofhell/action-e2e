// Independent human adjudication of defect hypotheses.
//   Template:  npm run evaluate:agreement -- --template=<run-dir> --reviewer=A --output=labels-A.json
//   Agreement: npm run evaluate:agreement -- --first=labels-A.json --second=labels-B.json --output=agreement.json
const fs = require('node:fs/promises');
const path = require('node:path');
const { compareReviewers, buildTemplate } = require('../src/services/reviewer-agreement');
function argument(name) { const found = process.argv.find(item => item.startsWith(`--${name}=`)); return found ? found.slice(name.length + 3) : null; }
async function main() {
  const output = argument('output');
  if (argument('template')) {
    const runDirectory = path.resolve(argument('template'));
    const exploration = JSON.parse(await fs.readFile(path.join(runDirectory, 'exploration.json'), 'utf8'));
    const template = buildTemplate(exploration, path.basename(runDirectory), argument('reviewer') || '');
    const text = `${JSON.stringify(template, null, 2)}\n`;
    if (output) await fs.writeFile(output, text, { flag: 'wx' }); else process.stdout.write(text);
    console.error(`Template with ${template.labels.length} items.`);
    return;
  }
  if (!argument('first') || !argument('second')) throw new Error('Use --template=<run-dir> or --first=<labels> --second=<labels>.');
  const read = async file => JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  const result = compareReviewers(await read(argument('first')), await read(argument('second')));
  const text = `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`;
  if (output) await fs.writeFile(output, text); else process.stdout.write(text);
  console.error(`n=${result.n}, observed=${result.observed}, kappa=${result.kappa} (${result.interpretation}), unpaired=${result.unpaired.length}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
