const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspectProject } = require('../src/services/project-inspector');
const { enhanceInspectionWithAi } = require('../src/services/ai-workflows');
const { exploreLiveProject } = require('../src/services/live-explorer');
const { createRunDirectory } = require('../src/services/artifact-store');
const { updateRunLog, stageRecord } = require('../src/services/run-log');
const prototypeRoot = path.resolve(__dirname, '..');
const targets = ['expense-tracker', 'movie-seat-booking', 'modal-menu-slider'];
const output = path.resolve(process.argv[2] || path.join(prototypeRoot, '..', 'output', 'current-validation-20261018', 'exploration'));
const aiConfig = { provider: 'llama-cpp', endpoint: 'http://127.0.0.1:8081/v1', model: 'qwen3.8-vl-27b-iq1m-64k' };
async function save(value) { await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(value, null, 2)); }
async function hashes(directory) {
  const result = {};
  for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) Object.assign(result, await hashes(file));
    else if (item.isFile()) result[path.relative(prototypeRoot, file)] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
  return result;
}
async function main() {
  await fs.mkdir(output, { recursive: true });
  const manifest = { protocol: 'current-version-initial-exploration-v2', targets, repetitions: 2,
    startedAt: new Date().toISOString(), aiConfig, profile: 'disposable-local',
    suppliedJourney: false, suppliedDefectDescription: false, sourceFiles: await hashes(path.join(prototypeRoot, 'src')), attempts: [] };
  await save(manifest);
  for (let repetition = 1; repetition <= 2; repetition++) {
    for (const target of targets) {
      const projectPath = path.join(prototypeRoot, '..', 'candidates', 'vanillawebprojects', target);
      const run = await createRunDirectory(path.join(prototypeRoot, 'prototype-runs'), projectPath);
      const evidenceDirectory = path.join(run.artifactsDirectory, 'exploration');
      await fs.mkdir(evidenceDirectory, { recursive: true });
      const row = { target, repetition, runId: run.runId, status: 'running' };
      console.log('Exploration: ' + target + ', repetition ' + repetition);
      const progress = event => console.log(target + ': ' + event.message);
      try {
        await updateRunLog(run.runDirectory, { runId: run.runId, projectPath, mode: 'initial-exploration-validation',
          model: aiConfig.model, modelConfig: aiConfig });
        const inspected = await inspectProject(projectPath);
        const { inspection } = await enhanceInspectionWithAi({ inspection: inspected, aiConfig });
        await updateRunLog(run.runDirectory, { stages: { inspection: stageRecord(inspection) } });
        const exploration = await exploreLiveProject({ projectPath, inspection,
          runtimeConfig: { ...inspection.runtime, runInstallBeforeExecution: false, disposableLocalProfile: true },
          aiConfig, authConfig: { mode: 'guest' },
          artifactRun: { ...run, evidenceDirectory, artifactBaseUrl: '/artifacts/' + run.runId }, onProgress: progress });
        await fs.writeFile(path.join(run.runDirectory, 'exploration.json'), JSON.stringify(exploration, null, 2));
        row.status = exploration.status;
        row.metrics = exploration.agenticExploration?.metrics || {};
        row.actions = (exploration.agenticExploration?.steps || []).filter(step => step.status === 'completed').map(step => step.action);
        row.hypotheses = exploration.bugDiscovery?.hypotheses || [];
        row.diagnostics = exploration.diagnostics || {};
        row.error = exploration.error || null;
        await updateRunLog(run.runDirectory, { status: exploration.status, completedAt: new Date().toISOString(),
          stages: { exploration: stageRecord({ inspection, liveExploration: exploration }) } });
      } catch (error) {
        row.status = 'error'; row.error = error.message;
        await updateRunLog(run.runDirectory, { status: 'failed', error: error.message, completedAt: new Date().toISOString() });
      }
      manifest.attempts.push(row);
      await save(manifest);
      console.log(JSON.stringify({ target, repetition, status: row.status, actions: row.metrics?.completedActions }));
    }
  }
  manifest.sourceUnchanged = JSON.stringify(await hashes(path.join(prototypeRoot, 'src'))) === JSON.stringify(manifest.sourceFiles);
  manifest.completedAt = new Date().toISOString();
  await save(manifest);
  if (!manifest.sourceUnchanged) throw new Error('Services changed during collection.');
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
