const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { inspectProject } = require('../src/services/project-inspector');
const { enhanceInspectionWithAi } = require('../src/services/ai-workflows');
const { exploreLiveProject } = require('../src/services/live-explorer');
const { createRunDirectory } = require('../src/services/artifact-store');
const { updateRunLog, stageRecord } = require('../src/services/run-log');

const root = path.resolve(__dirname, '..');
const protocolPath = path.resolve(process.argv[2] || path.join(root, 'evaluation/protocols/diverse-contexts.json'));
const output = path.resolve(process.argv[3] || path.join(root, 'evaluation-results', 'protocols', new Date().toISOString().replace(/[:.]/g, '-')));
const aiConfig = { provider: process.env.E2P_AI_PROVIDER || 'llama-cpp',
  endpoint: process.env.E2P_AI_ENDPOINT || 'http://127.0.0.1:8081/v1',
  model: process.env.E2P_AI_MODEL || 'qwen3.8-vl-27b-iq1m-64k' };

async function sourceHashes(directory, relativeRoot = directory) {
  const result = {};
  for (const item of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', 'dist', 'build', 'coverage', 'prototype-runs'].includes(item.name)) continue;
    const file = path.join(directory, item.name);
    if (item.isDirectory()) Object.assign(result, await sourceHashes(file, relativeRoot));
    else if (item.isFile() && /\.(?:[cm]?js|jsx|tsx?|html|css|json|md)$/i.test(file)) {
      result[path.relative(relativeRoot, file).replace(/\\/g, '/')] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    }
  }
  return result;
}
function gitRevision(directory) {
  try { return execFileSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, '-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}
async function main() {
  const protocol = JSON.parse(await fs.readFile(protocolPath, 'utf8'));
  if (!Number.isInteger(protocol.repetitions) || protocol.repetitions < 1 || !protocol.targets?.length) throw new Error('Invalid protocol.');
  // Never overwrite a previous collection, even when the caller supplies its directory.
  await fs.mkdir(output, { recursive: true });
  const destination = path.join(output, 'validation.json');
  const manifest = { protocol, protocolSha256: crypto.createHash('sha256').update(await fs.readFile(protocolPath)).digest('hex'),
    startedAt: new Date().toISOString(), aiConfig, suppliedJourney: false, suppliedDefectDescription: false,
    host: { platform: process.platform, node: process.version, cpu: os.cpus()[0]?.model, ramBytes: os.totalmem() },
    implementation: { revision: gitRevision(root), sourceFiles: await sourceHashes(path.join(root, 'src')) }, targets: [], attempts: [] };
  for (const target of protocol.targets) {
    const projectPath = path.resolve(path.dirname(protocolPath), target.path);
    manifest.targets.push({ id: target.id, projectPath, revision: gitRevision(projectPath), sourceFiles: await sourceHashes(projectPath) });
  }
  await fs.writeFile(destination, JSON.stringify(manifest, null, 2), { flag: 'wx' });
  const checkpoint = () => fs.writeFile(destination, JSON.stringify(manifest, null, 2));
  // Interleave repetitions rather than collecting all repetitions of one application first.
  for (let repetition = 1; repetition <= protocol.repetitions; repetition++) {
    for (const target of protocol.targets) {
      const projectPath = manifest.targets.find(item => item.id === target.id).projectPath;
      const run = await createRunDirectory(path.join(root, 'prototype-runs'), projectPath);
      const evidenceDirectory = path.join(run.artifactsDirectory, 'exploration');
      await fs.mkdir(evidenceDirectory, { recursive: true });
      const row = { target: target.id, repetition, runId: run.runId, startedAt: new Date().toISOString(), status: 'running' };
      manifest.attempts.push(row); await checkpoint();
      const progress = event => console.log(`${target.id} [${repetition}]: ${event.message}`);
      try {
        const inspected = await inspectProject(projectPath);
        const { inspection } = await enhanceInspectionWithAi({ inspection: inspected, aiConfig });
        await updateRunLog(run.runDirectory, { runId: run.runId, projectPath, mode: 'protocol-initial-exploration',
          modelConfig: aiConfig, stages: { inspection: stageRecord(inspection) } });
        const exploration = await exploreLiveProject({ projectPath, inspection,
          runtimeConfig: { ...inspection.runtime, ...target.runtime, runInstallBeforeExecution: false, disposableLocalProfile: true },
          aiConfig, authConfig: { mode: 'guest' },
          artifactRun: { ...run, evidenceDirectory, artifactBaseUrl: `/artifacts/${run.runId}` }, onProgress: progress });
        await fs.writeFile(path.join(run.runDirectory, 'exploration.json'), JSON.stringify(exploration, null, 2));
        row.status = exploration.status;
        row.metrics = exploration.agenticExploration?.metrics || {};
        row.actions = (exploration.agenticExploration?.steps || []).filter(step => step.status === 'completed').map(step => ({ step: step.step, ...step.action }));
        row.hypotheses = exploration.bugDiscovery?.hypotheses || [];
        row.diagnostics = exploration.diagnostics || {};
        row.error = exploration.error || null;
        await updateRunLog(run.runDirectory, { status: row.status, completedAt: new Date().toISOString(),
          stages: { exploration: stageRecord({ inspection, liveExploration: exploration }) } });
      } catch (error) { row.status = 'error'; row.error = error.message; }
      row.completedAt = new Date().toISOString();
      row.elapsedMs = Date.parse(row.completedAt) - Date.parse(row.startedAt);
      await checkpoint(); console.log(JSON.stringify(row));
    }
  }
  manifest.sourceUnchanged = JSON.stringify(await sourceHashes(path.join(root, 'src'))) === JSON.stringify(manifest.implementation.sourceFiles);
  manifest.targetsUnchanged = true;
  for (const target of manifest.targets) {
    target.unchanged = JSON.stringify(await sourceHashes(target.projectPath)) === JSON.stringify(target.sourceFiles);
    if (!target.unchanged) manifest.targetsUnchanged = false;
  }
  manifest.completedAt = new Date().toISOString(); await checkpoint();
  if (!manifest.sourceUnchanged || !manifest.targetsUnchanged) throw new Error('Sources changed during collection; inspect manifest.');
  if (manifest.attempts.some(row => row.status !== 'completed')) process.exitCode = 1;
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
