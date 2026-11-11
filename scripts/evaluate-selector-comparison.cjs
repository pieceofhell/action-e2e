const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { chromium } = require('playwright');
const { runAgenticExploration, validateAgentDecision } = require('../src/services/agentic-explorer');
const { inspectProject } = require('../src/services/project-inspector');
const { capturePageObservation, createRuntimeDiagnosticsCollector } = require('../src/services/live-explorer');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');
const { buildQaCoveragePlan } = require('../src/services/qa-coverage');
const { buildObservedJourneySpecContent } = require('../src/services/test-generator');

const root = path.resolve(__dirname, '..');
const defaultProtocolPath = path.join(root, 'evaluation/protocols/selector-comparison-v1.json');
const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
const sha = data => createHash('sha256').update(data).digest('hex');
const write = (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function sampleNumber(action, preferred) {
  const limits = action.numericConstraints || {};
  const low = Math.max(-1000, limits.min === '' || limits.min == null ? -1000 : Number(limits.min));
  const high = Math.min(1000, limits.max === '' || limits.max == null ? 1000 : Number(limits.max));
  const step = Number(limits.step || 1);
  const base = Number(limits.stepBase || limits.min || 0);
  const bounded = Math.max(low, Math.min(high, Number(preferred)));
  const candidates = [preferred, bounded, low, high, base];
  if (step > 0) for (const round of [Math.floor, Math.ceil]) candidates.push(base + round((bounded - base) / step) * step);
  for (const value of candidates) {
    if (!Number.isFinite(Number(value))) continue;
    const formatted = String(Number(Number(value).toFixed(2)));
    try { return validateAgentDecision({ decision: 'act', actionId: action.id, value: formatted }, [action]).value; }
    catch { /* This candidate conflicts with the shared input policy. */ }
  }
  return null;
}

function randomSelector(seed, preferredNumber = '15') {
  const next = randomSequence(seed);
  return ({ safeActions, steps }) => {
    const eligible = safeActions.map(action => ({ action, number: action.kind === 'fill' && action.inputType === 'number'
      ? sampleNumber(action, preferredNumber) : '' })).filter(candidate => candidate.number !== null);
    if (!eligible.length) return { decision: 'finish', actionId: '', rationale: 'No action has a valid synthetic input.' };
    const { action, number } = eligible[Math.floor(next() * eligible.length)];
    let value = '';
    if (action.kind === 'fill') value = action.inputType === 'number' ? number : `sample${steps.length + 1}`;
    if (action.kind === 'select') {
      const options = (action.options || []).filter(option => option.value !== action.value && option.value);
      value = options[Math.floor(next() * options.length)]?.value ?? action.options?.find(option => option.value)?.value ?? '';
    }
    return { decision: 'act', actionId: action.id, value, rationale: 'Seeded uniform sample from eligible catalog.', expectedOutcome: '' };
  };
}

async function loadExperiment(input = defaultProtocolPath) {
  const protocolPath = path.resolve(input);
  const protocol = JSON.parse(await fs.readFile(protocolPath, 'utf8'));
  if (!validId(protocol.id) || !Number.isInteger(protocol.repetitions) || protocol.repetitions < 1 || !Number.isInteger(protocol.seed)
    || !Number.isInteger(protocol.maxSteps) || protocol.maxSteps < 1 || protocol.maxSteps > 20
    || !Number.isInteger(protocol.maxDurationMs) || protocol.maxDurationMs < 1
    || !Array.isArray(protocol.conditions) || protocol.conditions.length !== 2 || !['llm', 'random'].every(item => protocol.conditions.includes(item))
    || !Array.isArray(protocol.targets) || !protocol.targets.length || !protocol.targets.every(validId)
    || new Set(protocol.targets).size !== protocol.targets.length || typeof protocol.model !== 'string' || !protocol.model.trim()
    || typeof protocol.referenceImplementation !== 'string' || !protocol.referenceImplementation.trim()) throw new Error('Invalid comparison protocol.');
  if (protocol.requirePriorFillForPress != null && typeof protocol.requirePriorFillForPress !== 'boolean') throw new Error('requirePriorFillForPress must be boolean.');
  const evaluatorPath = path.resolve(root, protocol.referenceImplementation);
  const evaluator = require(evaluatorPath);
  if (typeof evaluator?.readDomain !== 'function' || typeof evaluator?.judgeEffects !== 'function') throw new Error('Evaluator must export readDomain and judgeEffects.');
  const legacy = protocolPath === defaultProtocolPath;
  const targetDirs = {};
  for (const target of protocol.targets) {
    const functions = evaluator.reference?.[target];
    if (!Array.isArray(functions) || !functions.length || !functions.every(validId)
      || new Set(functions).size !== functions.length) throw new Error(`Invalid evaluator reference for ${target}.`);
    const targetPath = protocol.targetPaths?.[target] ?? (legacy ? `../candidates/vanillawebprojects/${target}` : null);
    if (typeof targetPath !== 'string' || !targetPath.trim()) throw new Error(`Missing static directory for ${target}.`);
    targetDirs[target] = await fs.realpath(path.resolve(root, targetPath));
    if (!(await fs.stat(targetDirs[target])).isDirectory()) throw new Error(`Target ${target} must be a static directory.`);
  }
  return { protocol, protocolPath, evaluatorPath, evaluator, targetDirs,
    requirePriorFillForPress: protocol.requirePriorFillForPress ?? legacy };
}

async function listHashes(directory, base = directory) {
  const hashes = {};
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, await listHashes(file, base));
    else if (entry.isFile()) hashes[path.relative(base, file).replaceAll('\\', '/')] = sha(await fs.readFile(file));
  }
  return hashes;
}

async function frozenInputs({ protocol, protocolPath, evaluatorPath, targetDirs }) {
  const files = ['scripts/evaluate-selector-comparison.cjs', 'package-lock.json'];
  return {
    protocol: sha(await fs.readFile(protocolPath)),
    evaluator: sha(await fs.readFile(evaluatorPath)),
    files: Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await fs.readFile(path.join(root, file)))]))),
    services: await listHashes(path.join(root, 'src/services')),
    targets: Object.fromEntries(await Promise.all(protocol.targets.map(async target => [target, await listHashes(targetDirs[target])]))),
  };
}

function schedule(protocol) {
  const next = randomSequence(protocol.seed);
  return Array.from({ length: protocol.repetitions }, (_, round) => protocol.targets.flatMap(target => {
    const seed = Math.floor(next() * 2 ** 32);
    const order = next() < 0.5 ? protocol.conditions : [...protocol.conditions].reverse();
    return order.map(condition => ({ target, repetition: round + 1, condition, seed, id: `${target}-r${round + 1}-${condition}` }));
  })).flat();
}

async function collect({ browser, row, experiment, aiConfig, runtime, inspection }) {
  const { protocol, evaluator, requirePriorFillForPress } = experiment;
  const context = await browser.newContext({ baseURL: runtime.baseUrl, viewport: { width: 1180, height: 760 }, serviceWorkers: 'block' });
  const origin = new URL(runtime.baseUrl).origin;
  const started = Date.now();
  try {
    await context.route('**/*', route => new URL(route.request().url()).origin === origin && ['GET', 'HEAD'].includes(route.request().method())
      ? route.continue() : route.abort('blockedbyclient'));
    const diagnostics = createRuntimeDiagnosticsCollector(context);
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(runtime.baseUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
    const observe = page => capturePageObservation({ page, baseUrl: runtime.baseUrl, disposableLocalProfile: true });
    const initialObservation = await observe(page);
    const observations = { 0: await evaluator.readDomain(page, row.target) };
    let stepNumber;
    const exploration = await runAgenticExploration({
      page, initialObservation, aiConfig: row.condition === 'llm' ? aiConfig : undefined,
      selectDecision: row.condition === 'random' ? randomSelector(row.seed, protocol.baselineNumber) : null,
      coveragePlan: buildQaCoveragePlan({ inspection, initialObservation }),
      fixedBudget: true, maxSteps: protocol.maxSteps, maxDurationMs: protocol.maxDurationMs,
      requirePriorFillForPress,
      visionEnabled: true, allowVisualPreview: true, isolateModelThinkTime: true,
      onActionStart(step, action) { stepNumber = step; diagnostics.beginAction(step, action); },
      onActionEnd() { diagnostics.endAction(); },
      async observeCurrentPage(page) {
        const observation = await observe(page);
        observations[stepNumber] = await evaluator.readDomain(page, row.target);
        return observation;
      },
    });
    const effects = evaluator.judgeEffects(row.target, exploration.steps, observations);
    const expected = evaluator.reference[row.target];
    if (!Array.isArray(effects) || effects.some(effect => !expected.includes(effect?.id))
      || new Set(effects.map(effect => effect.id)).size !== effects.length) throw new Error('Evaluator returned unknown or duplicate effects.');
    return { ...row, protocolId: protocol.id, status: exploration.status, elapsedMs: Date.now() - started, exploration, observations,
      diagnostics: diagnostics.snapshot(), effects };
  } finally { await context.close(); }
}

function compileEffect(run, effect) {
  const criterion = hit => ({ title: hit.id, given: 'Recorded isolated session', when: `Recorded action ${hit.step}`,
    then: 'The preregistered domain effect holds', actionStep: hit.step, domainChecks: hit.checks,
    expectationSource: 'project-requirement', sourceReference: `${run.protocolId || 'selector-comparison-v1'}/${run.target}/${hit.id}` });
  const title = `${run.id}--${effect.id}`;
  const flow = { id: title, title, evidenceStateIds: [effect.afterStateId], observedStepNumber: effect.step, localOnly: true,
    criteria: [effect.prerequisite, effect].filter(Boolean).map(criterion) };
  let contract;
  const source = buildObservedJourneySpecContent(flow, { liveExploration: { agenticExploration: run.exploration } }, value => { contract = value; });
  if (!source || contract?.length !== flow.criteria.length || contract.some(item => item.status !== 'asserted')) return null;
  return { title, source, contract, specSha256: sha(source) };
}

function collectStatuses(suites, statuses) {
  for (const suite of suites) {
    for (const spec of suite.specs || []) {
      if (statuses.has(spec.title)) throw new Error(`Duplicate replay result: ${spec.title}`);
      const test = spec.tests.length === 1 ? spec.tests[0] : null;
      const result = test?.results?.length === 1 ? test.results[0] : null;
      statuses.set(spec.title, result?.status ?? 'no-result');
    }
    collectStatuses(suite.suites || [], statuses);
  }
}

async function verify(output, runs, runtimes) {
  const specs = path.join(output, 'specs');
  const tests = [];
  for (const run of runs) for (const effect of run.effects) {
    const compiled = compileEffect(run, effect);
    if (!compiled) { tests.push({ runId: run.id, target: run.target, functionId: effect.id, status: 'unsupported-journey' }); continue; }
    const dir = path.join(specs, run.target);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${compiled.title}.spec.cjs`), compiled.source, { flag: 'wx' });
    tests.push({ runId: run.id, target: run.target, functionId: effect.id, title: compiled.title, specSha256: compiled.specSha256, contract: compiled.contract });
  }
  if (!tests.some(test => test.title)) return tests;
  const config = path.join(output, 'replay.config.cjs');
  const resultPath = path.join(output, 'playwright.json');
  const projects = Object.entries(runtimes).filter(([target]) => tests.some(test => test.title && test.target === target))
    .map(([name, runtime]) => ({ name, testDir: path.join(specs, name), use: { baseURL: runtime.baseUrl, viewport: { width: 1180, height: 760 } } }));
  await fs.writeFile(config, `module.exports = ${JSON.stringify({ projects, workers: 3, timeout: 30000, retries: 0,
    outputDir: path.join(output, 'test-artifacts'), reporter: [['json', { outputFile: resultPath }]] })};\n`, { flag: 'wx' });
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js'), 'test', '--config', config], { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (![0, 1].includes(exitCode)) throw new Error(`Replay runner exited with code ${exitCode}.`);
  const report = JSON.parse(await fs.readFile(resultPath, 'utf8'));
  if (report.errors?.length) throw new Error('Replay reported global errors. See playwright.json.');
  const statuses = new Map();
  collectStatuses(report.suites, statuses);
  return tests.map(test => ({ ...test, status: test.title ? statuses.get(test.title) || 'no-result' : test.status }));
}

async function main() {
  const { positionals: [id, ...extra], values } = parseArgs({ allowPositionals: true,
    options: { target: { type: 'string' }, protocol: { type: 'string' } } });
  if (!validId(id) || extra.length) throw new Error('Usage: node scripts/evaluate-selector-comparison.cjs unique-collection-id [--protocol=path] [--target=id]');
  const output = path.join(root, 'evaluation-results', id);
  const experiment = await loadExperiment(values.protocol);
  const { protocol, evaluator: { reference }, targetDirs, requirePriorFillForPress } = experiment;
  const targetOnly = values.target;
  if (targetOnly != null && !protocol.targets.includes(targetOnly)) throw new Error(`Unknown protocol target: ${targetOnly}`);
  const endpoint = new URL(process.env.E2P_COMPARISON_ENDPOINT || 'http://127.0.0.1:18081/v1');
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password) throw new Error('Use a local loopback llama.cpp server.');
  const available = await fetch(`${endpoint.href.replace(/\/$/, '')}/models`, { signal: AbortSignal.timeout(5000) });
  if (!available.ok || !(await available.json()).data?.some(item => item.id === protocol.model)) throw new Error('The preregistered model is unavailable.');
  const aiConfig = { provider: 'llama-cpp', endpoint: endpoint.href, model: protocol.model };
  const inputs = await frozenInputs(experiment);
  // Filter after building the schedule to retain the same paired seeds and order in follow-up collections.
  const rows = schedule(protocol).filter(row => !targetOnly || row.target === targetOnly);
  await fs.mkdir(output);
  const runtimes = {};
  const inspections = {};
  const browser = await chromium.launch();
  try {
    await write(path.join(output, 'manifest.json'), { protocol, reference, inputs, aiConfig, schedule: rows, requirePriorFillForPress,
      scope: targetOnly ? { target: targetOnly, kind: 'targeted-follow-up' } : { kind: 'complete-protocol' },
      startedAt: new Date().toISOString(), browser: browser.version(), node: process.version, platform: process.platform,
      cpu: os.cpus()[0]?.model, ramBytes: os.totalmem(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() });
    await fs.mkdir(path.join(output, 'runs'));
    for (const target of protocol.targets) {
      if (targetOnly && target !== targetOnly) continue;
      const projectPath = targetDirs[target];
      inspections[target] = await inspectProject(projectPath);
      runtimes[target] = await startTargetRuntime({ targetProjectPath: projectPath, runtimeConfig: { mode: 'static' } });
    }
    const runs = [];
    for (const row of rows) {
      console.log(`Starting ${row.id}`);
      let run;
      try { run = await collect({ browser, row, experiment, aiConfig, runtime: runtimes[row.target], inspection: inspections[row.target] }); }
      catch (error) { run = { ...row, status: 'infrastructure-error', error: error.message, effects: [] }; }
      await write(path.join(output, 'runs', `${row.id}.json`), run);
      runs.push(run);
      console.log(`${row.id}: ${run.status}, ${run.effects.length}/${reference[row.target].length} functions, ${run.exploration?.metrics?.completedActions ?? 0} actions`);
    }
    const replay = await verify(output, runs, runtimes);
    const unchanged = JSON.stringify(inputs) === JSON.stringify(await frozenInputs(experiment));
    await write(path.join(output, 'result.json'), { completedAt: new Date().toISOString(), unchanged, replay,
      attempts: runs.map(run => ({ id: run.id, target: run.target, condition: run.condition, repetition: run.repetition, status: run.status,
        actions: run.exploration?.metrics?.completedActions ?? 0, explorationMs: run.exploration?.metrics?.durationMs ?? null,
        elapsedMs: run.elapsedMs ?? null, stop: run.exploration?.terminationReason ?? null, effects: run.effects.map(effect => effect.id),
        verified: replay.filter(item => item.runId === run.id && item.status === 'passed').map(item => item.functionId),
        exceptionSignatures: [...new Set((run.diagnostics?.pageErrors || []).map(item => item.message))] })) });
    if (!unchanged) throw new Error('Inputs changed during the experiment. Preserve the results and investigate.');
    console.log(`Finished ${runs.length} attempts in ${output}`);
  } finally {
    await browser.close();
    await Promise.allSettled(Object.values(runtimes).map(runtime => runtime.stop()));
  }
}

if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { compileEffect, collectStatuses, loadExperiment, collect, verify, randomSelector };
