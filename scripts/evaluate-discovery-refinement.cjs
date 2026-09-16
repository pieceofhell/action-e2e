const fs = require('node:fs/promises');
const path = require('node:path');
const { createRunDirectory, ensureDirectory, writeJson } = require('../src/services/artifact-store');
const { exploreLiveProject, mergeLiveExplorationIntoInspection } = require('../src/services/live-explorer');
const { generateFlowPlan } = require('../src/services/flow-planner');
const { enhanceFlowPlanWithAi } = require('../src/services/ai-workflows');
const root = path.resolve(__dirname, '..');
async function main() {
  const original = JSON.parse(await fs.readFile(path.join(root, 'prototype-runs/form-validator-2026-09-13T13-41-32-014Z/inspection.json'), 'utf8'));
  const aiConfig = { provider: 'llama-cpp', endpoint: 'http://127.0.0.1:8081/v1', model: 'qwen3.8-vl-27b-iq1m-64k' };
  const run = await createRunDirectory(path.join(root, 'prototype-runs'), original.project.path);
  const evidenceDirectory = path.join(run.artifactsDirectory, 'exploration');
  await ensureDirectory(evidenceDirectory);
  const artifactRun = { ...run, evidenceDirectory, artifactBaseUrl: `/artifacts/${run.runId}` };
  console.log('RUN', run.runId);
  const inspection = { ...original, liveExploration: undefined };
  const liveExploration = await exploreLiveProject({ projectPath: original.project.path, inspection,
    runtimeConfig: { mode: 'static' }, aiConfig, authConfig: { mode: 'guest' }, artifactRun,
    onProgress: event => console.log(event.phase, event.message),
  });
  await writeJson(path.join(run.runDirectory, 'exploration.json'), liveExploration);
  const merged = mergeLiveExplorationIntoInspection({ inspection, liveExploration });
  await writeJson(path.join(run.runDirectory, 'inspection.json'), merged);
  if (liveExploration.bugDiscovery) await writeJson(path.join(run.resultsDirectory, 'potential-bugs.json'), liveExploration.bugDiscovery);
  console.log('ACTIONS', JSON.stringify(liveExploration.agenticExploration?.steps.map(s => ({ kind: s.action?.kind, name: s.action?.name, value: s.action?.value, status: s.status }))));
  try {
    const { plan } = await enhanceFlowPlanWithAi({ inspection: merged, basePlan: generateFlowPlan(merged), aiConfig });
    await writeJson(path.join(run.runDirectory, 'flow-plan.json'), plan);
    console.log('FLOWS', plan.flows.map(flow => flow.title));
  } catch (error) {
    await writeJson(path.join(run.runDirectory, 'flow-planning-error.json'), { message: error.message, diagnostics: error.diagnostics });
    throw error;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
