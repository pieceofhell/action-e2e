const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', 'vendor']);
const sourceExtensions = new Set(['.html', '.css', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);

function validateCorpus(manifest) {
  if (manifest.schemaVersion !== 1 || !manifest.applications?.length || !manifest.groups?.length) {
    throw new Error('Corpus requires schemaVersion 1, applications and groups.');
  }
  const groups = new Set(manifest.groups.map(group => group.id));
  if (groups.size !== manifest.groups.length) throw new Error('Duplicate corpus group.');
  const ids = new Set();
  for (const app of manifest.applications) {
    if (!/^[a-z0-9_-]+$/.test(app.id) || ids.has(app.id)) throw new Error(`Invalid or duplicate application: ${app.id}`);
    if (!groups.has(app.group)) throw new Error(`Unknown group for ${app.id}`);
    for (const key of ['purpose', 'behavior', 'historicalLimit']) {
      if (typeof app[key] !== 'string' || !app[key].trim()) throw new Error(`Missing ${key} for ${app.id}`);
    }
    ids.add(app.id);
  }
  return manifest;
}

async function measureProject(directory) {
  const sources = [];
  const evidence = [];
  const skipped = [];
  async function walk(current) {
    const entries = (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(directory, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) { skipped.push(relative); continue; }
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) skipped.push(relative);
        else await walk(absolute);
        continue;
      }
      const isSource = sourceExtensions.has(path.extname(entry.name).toLowerCase()) && !/\.min\.(js|css)$/i.test(entry.name);
      const isDocument = /^(readme(?:\.md)?|package\.json)$/i.test(entry.name);
      if (!isSource && !isDocument) continue;
      const bytes = await fs.readFile(absolute);
      const text = bytes.toString('utf8');
      const item = { path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
      evidence.push(item);
      if (isSource) sources.push({ ...item, lines: text.split(/\r?\n/).filter(line => line.trim()).length, text });
    }
  }
  await walk(directory);
  const signals = {
    browserStorage: /\b(?:localStorage|sessionStorage)\s*\./,
    fetch: /\bfetch\s*\(/,
    timers: /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/,
    speech: /\b(?:speechSynthesis|SpeechRecognition|webkitSpeechRecognition)\b/,
    dragAndDrop: /\b(?:dragstart|dragover|drop)\b/,
  };
  const detectedSignals = Object.fromEntries(Object.entries(signals).map(([name, pattern]) => [name,
    sources.filter(file => /\.(?:[cm]?js|jsx|tsx?)$/i.test(file.path) && pattern.test(file.text)).map(file => file.path)]));
  const networkUrls = [...new Set(sources.flatMap(file => [...file.text.matchAll(/https?:\/\/[^\s'"`<>)}]+/g)].map(match => match[0])))].sort();
  return {
    measuredAt: new Date().toISOString(), sourceFiles: sources.length,
    nonblankSourceLines: sources.reduce((sum, file) => sum + file.lines, 0),
    htmlDocuments: sources.filter(file => file.path.endsWith('.html')).map(file => file.path),
    javascriptFiles: sources.filter(file => /\.[cm]?jsx?$/.test(file.path)).length,
    declaredPackageManifests: evidence.filter(file => path.basename(file.path) === 'package.json').map(file => file.path),
    detectedSignals, networkUrls, skipped,
    sourceSha256: crypto.createHash('sha256').update(JSON.stringify(evidence.map(file => [file.path, file.sha256]))).digest('hex'),
    files: evidence,
  };
}

function summarizeRun(log) {
  const exploration = log.stages?.exploration?.data?.liveExploration || log.stages?.exploration?.data || {};
  const summary = log.summary || log.stages?.execution?.data?.execution?.report?.summary
    || log.stages?.execution?.data?.report?.summary || null;
  const reachedExecution = Boolean(log.stages?.execution);
  const tests = summary?.total;
  const passed = summary?.passed;
  return {
    reachedExecution, executionCountsAvailable: Number.isInteger(tests) && Number.isInteger(passed),
    testsExecuted: Number.isInteger(tests) ? tests : null, testsPassed: Number.isInteger(passed) ? passed : null,
    completedActions: (exploration.agenticExploration?.steps || []).filter(step => step.status === 'completed').length,
    observedStates: (exploration.agenticExploration?.states || []).length,
    hypotheses: (log.bugHypotheses || exploration.bugDiscovery?.hypotheses || []).length,
    status: log.status || 'unknown', model: log.model || null,
  };
}

function aggregateGroups(manifest, records) {
  validateCorpus(manifest);
  const recordMap = new Map(records.map(record => [record.id, record]));
  if (recordMap.size !== records.length || records.length !== manifest.applications.length
    || manifest.applications.some(app => !recordMap.has(app.id))) {
    throw new Error('Exactly one record per planned application is required; do not silently drop missing cases.');
  }
  return manifest.groups.map(group => {
    const items = manifest.applications.filter(app => app.group === group.id).map(app => recordMap.get(app.id));
    const logged = items.filter(item => item.run);
    const measured = items.filter(item => item.profile);
    const lineCounts = measured.map(item => item.profile.nonblankSourceLines);
    const countsIncomplete = logged.some(item => item.run.reachedExecution && !item.run.executionCountsAvailable);
    return {
      ...group, applications: items.length, logs: logged.length, missingLogs: items.length - logged.length,
      reachedExecution: logged.filter(item => item.run.reachedExecution).length,
      testsExecuted: countsIncomplete ? null : logged.reduce((sum, item) => sum + (item.run.testsExecuted || 0), 0),
      testsPassed: countsIncomplete ? null : logged.reduce((sum, item) => sum + (item.run.testsPassed || 0), 0),
      hypotheses: logged.reduce((sum, item) => sum + item.run.hypotheses, 0),
      completedActions: logged.reduce((sum, item) => sum + item.run.completedActions, 0),
      observedStates: logged.reduce((sum, item) => sum + item.run.observedStates, 0),
      measuredApplications: measured.length,
      sourceLineRange: lineCounts.length ? [Math.min(...lineCounts), Math.max(...lineCounts)] : null,
    };
  });
}

module.exports = { validateCorpus, measureProject, summarizeRun, aggregateGroups };
