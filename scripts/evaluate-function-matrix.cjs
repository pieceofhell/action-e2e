// Function × execution matrix over recorded runs. Usage:
//   npm run evaluate:functions -- --reference=evaluation/reference-functions/diverse-contexts-v1.json \
//     --runs-root=evaluation-results/current-20261020/runs --output=../output/function-matrix [--run-ids=a,b] [--target=id]
// Read-only: does not start targets or models and does not modify the runs.
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateReference, evaluateRun, aggregateByTarget } = require('../src/services/function-matrix');

const root = path.resolve(__dirname, '..');
function argument(name, fallback) {
  const found = process.argv.find(item => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function readTests(runDirectory) {
  let files;
  try { files = await fs.readdir(path.join(runDirectory, 'tests')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const specs = files.filter(file => /\.spec\.[cm]?[jt]s$/.test(file)).sort();
  if (!specs.length) return null;
  return Promise.all(specs.map(async file => ({ file, source: await fs.readFile(path.join(runDirectory, 'tests', file), 'utf8') })));
}
async function loadExploration(runDirectory) {
  const direct = await readJson(path.join(runDirectory, 'exploration.json'));
  if (direct?.agenticExploration) return direct;
  const log = await readJson(path.join(runDirectory, 'run-log.json'));
  const stage = log?.stages?.exploration;
  return [stage, stage?.liveExploration, stage?.output].find(item => item?.agenticExploration) || null;
}
const symbol = { 'not-attempted': '—', attempted: 'T', exercised: 'E', verified: 'V' };
function cell(value) { return String(value ?? 'n/d').replaceAll('|', '\\|'); }

async function main() {
  const referencePath = path.resolve(argument('reference', path.join(root, 'evaluation/reference-functions/diverse-contexts-v1.json')));
  const runsRoot = path.resolve(argument('runs-root', path.join(root, 'prototype-runs')));
  const output = path.resolve(argument('output', path.join(root, '..', 'output', 'function-matrix')));
  const target = argument('target', null);
  const reference = validateReference(JSON.parse(await fs.readFile(referencePath, 'utf8')));
  const requested = argument('run-ids', '');
  const runIds = requested ? requested.split(',').map(item => item.trim()).filter(Boolean)
    : (await fs.readdir(runsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name).sort();
  const runs = [];
  const skipped = [];
  for (const runId of runIds) {
    if (!/^[a-z0-9._-]+$/i.test(runId)) throw new Error(`Invalid run ID: ${runId}`);
    const directory = path.join(runsRoot, runId);
    const exploration = await loadExploration(directory);
    if (!exploration) { skipped.push({ runId, reason: 'no recorded agentic exploration' }); continue; }
    const result = evaluateRun({ reference, runId, exploration, tests: await readTests(directory), targetId: target });
    if (!result.target) { skipped.push({ runId, reason: result.error }); continue; }
    runs.push(result);
  }
  const targets = aggregateByTarget(reference, runs);
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), reference: { id: reference.id, path: referencePath,
    definedAt: reference.definedAt, provenance: reference.provenance, levels: reference.levels }, runsRoot, runs, skipped, targets };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'function-matrix.json'), `${JSON.stringify(report, null, 2)}\n`);
  const sections = targets.filter(item => item.runs).map(item => {
    const targetRuns = runs.filter(run => run.target === item.target);
    const header = `| Função | ${targetRuns.map((run, index) => `R${index + 1}`).join(' | ')} | Exercitada em |\n|---|${targetRuns.map(() => '---').join('|')}|---|`;
    const rows = item.functions.map(fn => `| ${cell(fn.label)} | ${fn.levels.map(level => symbol[level]).join(' | ')} | ${fn.exercisedIn}/${item.runs} |`).join('\n');
    const provenance = targetRuns.map((run, index) => `R${index + 1} = \`${run.runId}\` (modelo ${cell(run.model)}, ${run.actions} ações, testes gerados: ${run.testsAvailable ? 'sim' : 'não'})`).join('; ');
    return `### ${item.target}\n\n${header}\n${rows}\n\n${provenance}.\n`;
  });
  const totals = runs.map(run => `| \`${run.runId}\` | ${run.target} | ${run.totals.functions} | ${run.totals.attempted} | ${run.totals.exercised} | ${cell(run.totals.verified)} |`).join('\n');
  await fs.writeFile(path.join(output, 'function-matrix.md'), `# Matriz função × execução\n\nReferência: \`${reference.id}\` (definida em ${reference.definedAt}). ${reference.provenance}\n\nLegenda: **—** não tentada; **T** tentada; **E** exercitada com mudança de estado citada; **V** verificada por asserção gerada. Níveis são cumulativos. Contagens de ações ou de objetivos QA internos não entram nesta matriz.\n\n${sections.join('\n')}\n## Totais por execução\n\n| Run | Alvo | Funções | Tentadas | Exercitadas | Verificadas |\n|---|---|---|---|---|---|\n${totals}\n\n${skipped.length ? `Execuções sem correspondência: ${skipped.map(item => `\`${item.runId}\` (${item.reason})`).join(', ')}.\n` : ''}`);
  console.log(`Function matrix: ${runs.length} runs, ${skipped.length} skipped. Output: ${output}`);
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
