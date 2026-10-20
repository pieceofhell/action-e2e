const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { redactSecrets } = require('./auth-config');

function safeValue(value, secretValues = []) {
  if (Array.isArray(value)) return value.map(item => safeValue(item, secretValues));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      /^(apiKey|password|secret|authorization|accessToken|refreshToken)$/i.test(key)
        ? '[REDACTED]' : safeValue(item, secretValues)]));
  }
  return typeof value === 'string' ? redactSecrets(value, secretValues) : value;
}

async function readRunLog(runDirectory) {
  try { return JSON.parse(await fs.readFile(path.join(runDirectory, 'run-log.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function updateRunLog(runDirectory, patch, { secretValues = [] } = {}) {
  const previous = await readRunLog(runDirectory);
  const current = previous || {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    status: 'running',
    stages: {},
    events: [],
    provenance: await buildRunProvenance(patch.projectPath),
  };
  const knownSecrets = [...secretValues,
    ...Object.entries(process.env).filter(([key]) => key.startsWith('E2P_AUTH_')).map(([, value]) => value)]
    .filter(value => typeof value === 'string' && value.length >= 4);
  const safe = safeValue(patch, knownSecrets);
  const next = {
    ...current,
    ...safe,
    stages: { ...current.stages, ...(safe.stages || {}) },
    events: [...current.events, ...(safe.events || [])],
    updatedAt: new Date().toISOString(),
  };
  if (next.runId && /^[a-z0-9-]+$/i.test(next.runId)) next.artifactBaseUrl = `/artifacts/${next.runId}`;
  const destination = path.join(runDirectory, 'run-log.json');
  const temporary = `${destination}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  const contents = `${JSON.stringify(next, null, 2)}\n`;
  await fs.writeFile(temporary, contents, 'utf8');
  let replaced = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { await fs.rename(temporary, destination); replaced = true; break; }
    catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code) || attempt === 4) break;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  if (!replaced) {
    await fs.writeFile(destination, contents, 'utf8');
    await fs.rm(temporary, { force: true });
  }
  await fs.writeFile(path.join(runDirectory, 'run-status.json'), `${JSON.stringify({
    status: next.status,
    updatedAt: next.updatedAt,
    failedStage: next.failedStage || null,
    summary: next.summary || null,
  }, null, 2)}\n`, 'utf8');
  const explorationData = next.stages.exploration?.data;
  const bugHypotheses = next.bugHypotheses || explorationData?.liveExploration?.bugDiscovery?.hypotheses
    || explorationData?.bugDiscovery?.hypotheses || [];
  const stage = ['failed', 'interrupted'].includes(next.status) ? next.status
    : next.stages.execution ? 'executed'
      : next.stages.generation ? 'generated'
        : next.stages.exploration ? 'explored' : 'incomplete';
  await fs.writeFile(path.join(runDirectory, 'run-index.json'), `${JSON.stringify({
    id: next.runId || path.basename(runDirectory),
    projectName: path.basename(next.projectPath || '') || path.basename(runDirectory),
    projectPath: next.projectPath || '',
    createdAt: next.createdAt,
    stage,
    model: next.model || '',
    summary: next.summary || null,
    hypothesisCount: bugHypotheses.length,
  }, null, 2)}\n`, 'utf8');
  return next;
}

async function buildRunProvenance(projectPath) {
  const root = path.resolve(__dirname, '../..');
  const codeHash = crypto.createHash('sha256');
  for (const directory of ['src', 'public', 'scripts', 'test']) {
    for (const file of await listSourceFiles(path.join(root, directory))) {
      codeHash.update(path.relative(root, file).replaceAll('\\', '/'));
      codeHash.update(await fs.readFile(file));
    }
  }
  for (const name of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    const file = path.join(root, name);
    try { codeHash.update(name); codeHash.update(await fs.readFile(file)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  return {
    codeSha256: codeHash.digest('hex'),
    packageVersion: packageJson.version,
    nodeVersion: process.version,
    platform: process.platform,
    playwrightVersion: require('playwright/package.json').version,
    targetGitCommit: projectPath ? readGitValue(projectPath, ['rev-parse', 'HEAD']) : null,
    targetGitStatus: projectPath ? readGitValue(projectPath, ['status', '--porcelain', '-uno']) : null,
    modelWeightsSha256: null,
    note: 'A model alias does not prove the weight hash; use the evaluation manifest for local model/projection hashes.',
  };
}

async function listSourceFiles(directory) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const output = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listSourceFiles(fullPath));
    else if (entry.isFile() && /\.(?:js|cjs|json|html|css|yaml|md)$/.test(entry.name)) output.push(fullPath);
  }
  return output;
}

function readGitValue(cwd, args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, maxBuffer: 1024 * 1024 }).trim(); }
  catch { return null; }
}

function stageRecord(data, events = []) {
  return { completedAt: new Date().toISOString(), data, events };
}

module.exports = { readRunLog, safeValue, stageRecord, updateRunLog };
