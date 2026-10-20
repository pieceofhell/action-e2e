const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'prototype-runs');
const idsArgument = process.argv.find(item => item.startsWith('--run-ids='));
const selectedIds = idsArgument ? idsArgument.slice('--run-ids='.length).split(',').filter(Boolean) : null;
const batchArgument = process.argv.find(item => item.startsWith('--batch-id='));
const batchId = batchArgument ? batchArgument.slice('--batch-id='.length) : null;
const outputArgument = process.argv.find(item => item.startsWith('--output='));
const output = path.resolve(outputArgument ? outputArgument.slice('--output='.length) : path.join(__dirname, '..', 'evaluation-summary'));

async function main() {
  if (selectedIds && batchId) throw new Error('Choose either --run-ids or --batch-id.');
  if (batchId && !/^[a-f0-9-]+$/.test(batchId)) throw new Error('Invalid batch ID.');
  const batch = batchId ? await readOptional(path.join(root, '.batches', `${batchId}.json`)) : null;
  if (batchId && !batch) throw new Error(`Batch not found: ${batchId}`);
  const names = selectedIds || (batch ? batch.jobs.map(job => job.runId).filter(Boolean) : null) || (await fs.readdir(root, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name);
  const runs = [];
  for (const id of names) {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`Invalid run ID: ${id}`);
    const directory = path.join(root, id);
    const log = await readOptional(path.join(directory, 'run-log.json'));
    if (!log) {
      if (selectedIds) throw new Error(`No run-log.json for requested run: ${id}`);
      continue;
    }
    const generation = log.stages?.generation?.data;
    const generatedTests = generation?.generatedTests || generation?.tests || await readOptional(path.join(directory, 'generated-tests.json')) || [];
    const criteria = generatedTests.flatMap(item => item.criterionContract || []);
    const summary = log.summary || log.stages?.execution?.data?.execution?.report?.summary
      || log.stages?.execution?.data?.report?.summary || {};
    const reviews = await readReviews(path.join(directory, 'human-reviews'));
    const latestReviews = new Map(reviews.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(item => [item.hypothesisId, item]));
    const hypotheses = log.bugHypotheses || log.stages?.exploration?.data?.liveExploration?.bugDiscovery?.hypotheses || [];
    const exploration = log.stages?.exploration?.data?.liveExploration || log.stages?.exploration?.data || {};
    const steps = exploration.agenticExploration?.steps || [];
    const states = exploration.agenticExploration?.states || [];
    runs.push({
      runId: id, project: path.basename(log.projectPath || id), mode: log.mode || 'unknown',
      operationalStatus: log.status || 'unknown', result: log.result || summary.result || 'legacy-unclassified',
      executionState: summary.executionState || 'unknown', reachedExecution: Boolean(log.stages?.execution),
      totalTests: summary.total ?? null, passedTests: summary.passed ?? null, failedTests: summary.failed ?? null,
      completedActions: steps.filter(step => step.status === 'completed').length,
      observedStates: states.length,
      criteria: criteria.length, assertedCriteria: criteria.filter(item => item.status === 'asserted').length,
      unverifiedCriteria: criteria.filter(item => item.status !== 'asserted').length,
      hypotheses: hypotheses.length, adjudicatedHypotheses: hypotheses.filter(item => latestReviews.has(item.id)).length,
      confirmedHypotheses: hypotheses.filter(item => latestReviews.get(item.id)?.decision === 'confirmed').length,
      startedAt: log.createdAt || null, finishedAt: log.completedAt || null,
      elapsedMs: log.completedAt && log.createdAt ? new Date(log.completedAt) - new Date(log.createdAt) : null,
      codeSha256: log.provenance?.codeSha256 || null,
      model: log.model || null,
    });
  }
  const applications = [...new Set(runs.map(run => run.project))].sort().map(project => {
    const items = runs.filter(run => run.project === project);
    return { project, attempts: items.length, reachedExecution: count(items, 'reachedExecution'),
      completed: items.filter(item => item.operationalStatus === 'completed').length,
      passed: items.filter(item => item.result === 'passed').length,
      testsExecuted: sum(items, 'totalTests'), testsPassed: sum(items, 'passedTests'),
      completedActions: sum(items, 'completedActions'), observedStates: sum(items, 'observedStates'),
      infrastructureErrors: items.filter(item => item.result === 'infrastructure-error').length,
      criteria: sum(items, 'criteria'), assertedCriteria: sum(items, 'assertedCriteria'),
      hypotheses: sum(items, 'hypotheses'), adjudicatedHypotheses: sum(items, 'adjudicatedHypotheses') };
  });
  const summary = {
    generatedAt: new Date().toISOString(), source: root, batchId: batchId || null,
    selectedRunIds: runs.map(run => run.runId), plannedAttempts: batch ? batch.jobs.length : runs.length,
    attemptsWithLogs: runs.length, missingRunLogs: batch ? batch.jobs.length - runs.length : 0,
    reachedExecution: count(runs, 'reachedExecution'),
    completed: runs.filter(run => run.operationalStatus === 'completed').length,
    passed: runs.filter(run => run.result === 'passed').length,
    testsExecuted: sum(runs, 'totalTests'), testsPassed: sum(runs, 'passedTests'),
    completedActions: sum(runs, 'completedActions'), observedStates: sum(runs, 'observedStates'),
    criteria: sum(runs, 'criteria'), assertedCriteria: sum(runs, 'assertedCriteria'),
    unverifiedCriteria: sum(runs, 'unverifiedCriteria'),
    hypotheses: sum(runs, 'hypotheses'), adjudicatedHypotheses: sum(runs, 'adjudicatedHypotheses'),
    warning: 'An asserted criterion has a syntactic contract, not a human-validated semantic oracle. Unreviewed hypotheses are not confirmed bugs.',
  };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify({ summary, applications, runs }, null, 2));
  await fs.writeFile(path.join(output, 'executions.csv'), csv(runs));
  await fs.writeFile(path.join(output, 'applications.csv'), csv(applications));
  await fs.writeFile(path.join(output, 'results.md'), markdown(summary, applications));
  process.stdout.write(`${runs.length} run(s) aggregated into ${output}\n`);
}

async function readOptional(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function readReviews(directory) {
  let files;
  try { files = await fs.readdir(directory); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return (await Promise.all(files.filter(name => /^[a-f0-9-]+\.json$/.test(name))
    .map(name => readOptional(path.join(directory, name))))).filter(Boolean);
}
function sum(items, key) { return items.reduce((total, item) => total + (Number(item[key]) || 0), 0); }
function count(items, key) { return items.filter(item => item[key]).length; }
function csv(rows) {
  if (!rows.length) return ''; const columns = Object.keys(rows[0]);
  return [columns.join(','), ...rows.map(row => columns.map(key => `"${String(row[key] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n') + '\n';
}
function markdown(summary, applications) {
  return `# Derived E2P results\n\n${summary.plannedAttempts} planned attempts; ${summary.attemptsWithLogs} logs; ${summary.reachedExecution} reached execution; ${summary.completed} completed operationally; ${summary.testsPassed}/${summary.testsExecuted} recorded tests passed; ${summary.completedActions} completed exploration actions and ${summary.observedStates} recorded states. ${summary.assertedCriteria}/${summary.criteria} criteria have generated assertions; this is not semantic validation. ${summary.adjudicatedHypotheses}/${summary.hypotheses} hypotheses received human decisions.\n\n| Application | Logs | Reached execution | Tests passed/executed | Actions | States | Asserted/total criteria | Hypotheses adjudicated/total |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${applications.map(item => `| ${item.project} | ${item.attempts} | ${item.reachedExecution} | ${item.testsPassed}/${item.testsExecuted} | ${item.completedActions} | ${item.observedStates} | ${item.assertedCriteria}/${item.criteria} | ${item.adjudicatedHypotheses}/${item.hypotheses} |`).join('\n')}\n\n${summary.warning}\n`;
}

main().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
