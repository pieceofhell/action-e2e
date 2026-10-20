const fs = require('node:fs/promises');
const path = require('node:path');
const { validateCorpus, measureProject, summarizeRun, aggregateGroups } = require('../src/services/corpus-evaluation');

function argument(name, fallback) {
  const found = process.argv.find(item => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}
const prototypeRoot = path.resolve(__dirname, '..');
const manifestPath = path.resolve(argument('manifest', path.join(prototypeRoot, 'evaluation', 'corpus.json')));
const output = path.resolve(argument('output', path.join(prototypeRoot, '..', 'output', 'evaluation-corpus')));
const runsRoot = path.resolve(argument('runs-root', path.join(prototypeRoot, 'prototype-runs')));

async function readOptional(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function cell(value) { return String(value ?? 'não disponível').replaceAll('|', '\\|').replaceAll('\n', ' '); }
function table(headers, rows) {
  return `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')}\n`;
}

async function testEvidence(runId) {
  if (!runId) return [];
  const directory = path.join(runsRoot, runId, 'tests');
  let files;
  try { files = await fs.readdir(directory); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const name of files.filter(file => /\.spec\.[cm]?[jt]s$/.test(file)).sort()) {
    const source = await fs.readFile(path.join(directory, name), 'utf8');
    result.push({ file: `${runId}/tests/${name}`,
      assertions: source.split(/\r?\n/).flatMap((line, index) => /\bexpect\(/.test(line) ? [{ line: index + 1, text: line.trim() }] : []) });
  }
  return result;
}

async function main() {
  const manifest = validateCorpus(JSON.parse(await fs.readFile(manifestPath, 'utf8')));
  if (!/^[a-f0-9-]+$/i.test(manifest.batchId)) throw new Error('Invalid batch ID.');
  const batch = await readOptional(path.join(runsRoot, '.batches', `${manifest.batchId}.json`));
  if (!batch) throw new Error('The declared batch is missing; no historical result can be derived.');
  const expected = new Set(manifest.applications.map(app => app.id));
  if (batch.jobs.length !== expected.size || new Set(batch.jobs.map(job => job.projectName)).size !== expected.size
    || batch.jobs.some(job => !expected.has(job.projectName))) throw new Error('Batch and corpus application sets differ.');
  const targetRoot = path.resolve(path.dirname(manifestPath), manifest.targetRoot);
  const records = [];
  for (const app of manifest.applications) {
    const job = batch.jobs.find(item => item.projectName === app.id);
    if (job.runId && !/^[a-z0-9-]+$/i.test(job.runId)) throw new Error('Invalid run ID.');
    const log = job.runId ? await readOptional(path.join(runsRoot, job.runId, 'run-log.json')) : null;
    let profile = null;
    try { profile = await measureProject(path.join(targetRoot, app.id)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    records.push({ ...app, runId: job.runId || null, stopStage: job.stage, stopReason: job.error || null,
      profile, run: log ? summarizeRun(log) : null, testEvidence: await testEvidence(job.runId) });
  }
  const groups = aggregateGroups(manifest, records);
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), manifestPath, targetRoot,
    corpus: manifest, batch: { id: batch.id, createdAt: batch.createdAt, model: batch.model }, groups, applications: records };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'corpus-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const grouped = table(['Família', 'Aplicações', 'Com log', 'Chegaram à execução', 'Testes aprovados/executados', 'Hipóteses', 'Linhas não vazias (mín.–máx.)'],
    groups.map(group => [group.label, group.applications, group.logs, `${group.reachedExecution}/${group.applications}`,
      `${cell(group.testsPassed)}/${cell(group.testsExecuted)}`, group.hypotheses, group.sourceLineRange?.join('–')]));
  const inventory = table(['Aplicação', 'Família', 'Finalidade', 'Arquivos-fonte', 'Linhas', 'Documentos HTML', 'Sinais no código'], records.map(item => [
    item.id, manifest.groups.find(group => group.id === item.group).label, item.purpose, item.profile?.sourceFiles,
    item.profile?.nonblankSourceLines, item.profile?.htmlDocuments.length,
    item.profile ? Object.entries(item.profile.detectedSignals).filter(([, files]) => files.length).map(([signal]) => signal).join(', ') || 'nenhum dos sinais rastreados' : null]));
  const depth = table(['Aplicação', 'Comportamento de referência para avaliação', 'Limite da evidência histórica', 'Run ID'],
    records.map(item => [item.id, item.behavior, item.historicalLimit, item.runId]));
  await fs.writeFile(path.join(output, 'corpus-report.md'), `# Caracterização do corpus e alcance dos resultados\n\n${manifest.selection}\n\n${manifest.classification}\n\n${manifest.evidencePolicy}\n\n## Método de medição\n\nContam-se arquivos HTML, CSS, JS e TS e linhas físicas não vazias, incluindo comentários. Dependências, builds, arquivos minificados, links simbólicos e mídia ficam fora da contagem. Linhas não medem complexidade ciclomática, esforço ou cobertura. Documentos HTML não equivalem a rotas ou estados dinâmicos. Sinais de APIs são buscas textuais com arquivos de evidência; podem ocorrer em comentários e não comprovam comportamento executado. URLs incluem recursos e documentação, não somente APIs. O relatório JSON preserva hashes e inventário. As descrições funcionais são interpretação de pesquisa, não critérios aprovados automaticamente nem um conjunto-ouro independente.\n\n## Estrutura e finalidade\n\n${inventory}\n## Resultado por família\n\nLote de referência: ${batch.id}. Modelo: ${batch.model}. Data de coleta: ${batch.createdAt}. A data identifica a proveniência, não um tratamento experimental. Não se agregam execuções de outros modelos ou revisões. Falta de log permanece explícita no denominador; nenhuma aprovação prova correção funcional.\n\n${grouped}\n## Profundidade que precisa ser demonstrada\n\nAs limitações abaixo são anotações de auditoria histórica; não são inferidas apenas da aprovação dos testes.\n\n${depth}\n## Próxima avaliação\n\nAntes de nova coleta, congelar versão e requisitos, selecionar comportamentos de referência por família e controlar dados, relógio e dependências necessários. Separar exploração autônoma, compilação de trajetória fornecida e replay de suíte congelada. Para cada comportamento registrar alcance, critério, asserção, aprovação no correto, falha pelo motivo esperado no mutante e julgamento humano. Casos não alcançados e bloqueados permanecem no denominador. Este relatório não calcula precisão, revocação ou porte médio automaticamente.\n`);
  console.log(`Corpus: ${records.length} applications, ${groups.length} groups. Output: ${output}`);
  if (records.some(item => !item.run || !item.profile)) {
    console.error('Incomplete evidence: missing source profiles or run logs are marked in the report.');
    process.exitCode = 2;
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
