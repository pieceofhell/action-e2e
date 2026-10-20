const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspectProject } = require('./project-inspector');
const { exploreLiveProject, mergeLiveExplorationIntoInspection } = require('./live-explorer');
const { generateFlowPlan } = require('./flow-planner');
const { generateTestBundle } = require('./test-generator');
const { runGeneratedTests } = require('./test-runner');
const { buildInsights } = require('./insight-builder');
const { enhanceInspectionWithAi, enhanceFlowPlanWithAi, enhanceInsightsWithAi } = require('./ai-workflows');
const { createRunDirectory, ensureDirectory, readJson, writeJson } = require('./artifact-store');
const { readRun } = require('./run-history');
const { stageRecord, updateRunLog } = require('./run-log');
const { isExplicitBaseline, requireAiForStage, requireCompletedAiExploration } = require('./pipeline-policy');
const { redactSecrets } = require('./auth-config');
const { selectBatchApprovedFlows } = require('./batch-auto-approval');

function createBatchQueue({ prototypeRoot, runJob = runPipelineJob }) {
  const runsRoot = path.join(prototypeRoot, 'prototype-runs');
  const stateRoot = path.join(runsRoot, '.batches');
  const batches = new Map();
  const configurations = new Map();
  let working = false;

  async function initialize() {
    await ensureDirectory(stateRoot);
    for (const name of await fs.readdir(stateRoot)) {
      if (!/^[a-f0-9-]+\.json$/.test(name)) continue;
      try {
        const batch = await readJson(path.join(stateRoot, name));
        for (const job of batch.jobs || []) {
          if (['running', 'queued', 'awaiting-review'].includes(job.status)) {
            job.status = 'interrupted';
            job.error = 'Server restarted before this job finished. Requeue this project with its model settings. Saved evidence and reviews remain in Run history.';
            if (job.runId && /^[a-z0-9-]+$/i.test(job.runId)) {
              await updateRunLog(path.join(runsRoot, job.runId), { status: 'interrupted', error: job.error }).catch(() => {});
            }
          }
        }
        batches.set(batch.id, batch);
        await persist(batch);
      } catch { /* A corrupt batch file must not block the application. */ }
    }
  }

  async function persist(batch) {
    const destination = path.join(stateRoot, `${batch.id}.json`);
    const temporary = `${destination}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
    const contents = `${JSON.stringify(batch, null, 2)}\n`;
    await fs.writeFile(temporary, contents, 'utf8');
    for (let attempt = 0; attempt < 5; attempt++) {
      try { await fs.rename(temporary, destination); return; }
      catch (error) {
        if (!['EPERM', 'EACCES'].includes(error.code) || attempt === 4) break;
        await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
    // Windows may hold an already-open JSON destination while the UI reads it.
    await fs.writeFile(destination, contents, 'utf8');
    await fs.rm(temporary, { force: true });
  }

  function publicBatch(batch) { return JSON.parse(JSON.stringify(batch)); }
  function list() { return [...batches.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicBatch); }
  function get(id) { return batches.has(id) ? publicBatch(batches.get(id)) : null; }

  async function enqueue({ projectPaths, aiConfig, authConfig, autoSkipBugReview }) {
    const id = crypto.randomUUID();
    const batch = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      autoSkipBugReview: Boolean(autoSkipBugReview),
      model: aiConfig?.model || '',
      provider: aiConfig?.provider || '',
      jobs: projectPaths.map((projectPath, index) => ({
        id: `${id}-${index + 1}`,
        projectPath,
        projectName: path.basename(projectPath),
        status: 'queued',
        stage: 'queued',
        message: 'Waiting in the sequential queue.',
        runId: null,
        error: null,
        summary: null,
        result: null,
      })),
    };
    batches.set(id, batch);
    // Credentials are deliberately memory-only and are never written into batch metadata.
    configurations.set(id, { aiConfig, authConfig });
    await persist(batch);
    void drain().catch(error => console.error(`[batch] Queue stopped: ${redactSecrets(error?.message || error)}`));
    return publicBatch(batch);
  }

  async function resumeAfterReview(batchId, jobId) {
    const batch = batches.get(batchId);
    const job = batch?.jobs.find(item => item.id === jobId);
    if (!job || job.status !== 'awaiting-review') throw new Error('This job is not awaiting bug feedback.');
    if (!configurations.has(batchId)) throw new Error('Model settings are no longer in memory; requeue this project.');
    const run = await readRun(runsRoot, job.runId);
    const hypotheses = run.bugReport?.hypotheses || [];
    const reviewed = new Set(run.reviews.map(item => item.hypothesisId));
    const missing = hypotheses.filter(item => !reviewed.has(item.id));
    if (missing.length) throw new Error(`Review all ${missing.length} remaining hypothesis/hypotheses before continuing, or create a new batch with auto-skip.`);
    job.status = 'queued';
    job.stage = 'planning';
    job.message = 'Human bug feedback saved; waiting to continue.';
    batch.updatedAt = new Date().toISOString();
    await persist(batch);
    void drain().catch(error => console.error(`[batch] Queue stopped: ${redactSecrets(error?.message || error)}`));
    return publicBatch(batch);
  }

  async function drain() {
    if (working) return;
    working = true;
    try {
      while (true) {
        const batch = [...batches.values()].find(item => item.jobs.some(job => job.status === 'queued') && configurations.has(item.id));
        if (!batch) break;
        const job = batch.jobs.find(item => item.status === 'queued');
        job.status = 'running';
        job.startedAt ||= new Date().toISOString();
        batch.updatedAt = new Date().toISOString();
        await persist(batch);
        const configuration = configurations.get(batch.id);
        try {
          const result = await runJob({
            prototypeRoot, runsRoot, job, batch,
            ...configuration,
            onUpdate: (stage, message) => {
              job.stage = stage;
              job.message = redactSecrets(message || '', [configuration?.aiConfig?.apiKey]);
              batch.updatedAt = new Date().toISOString();
            },
            onCheckpoint: () => persist(batch),
          });
          job.status = result?.awaitingReview ? 'awaiting-review' : 'completed';
          job.message = result?.awaitingReview ? 'Review bug hypotheses in Run history, then continue this job.'
            : `Pipeline finished; test result: ${result?.summary?.result || 'unavailable'}.`;
          job.summary = result?.summary || null;
          job.result = result?.summary?.result || null;
        } catch (error) {
          job.status = 'failed';
          job.error = redactSecrets(error?.message || error, [configuration?.aiConfig?.apiKey]);
          job.message = job.error;
          if (job.runId) await updateRunLog(path.join(runsRoot, job.runId), {
            status: 'failed', failedStage: job.stage, error: job.error,
          }).catch(() => {});
        }
        job.finishedAt = job.status === 'awaiting-review' ? null : new Date().toISOString();
        batch.updatedAt = new Date().toISOString();
        await persist(batch);
      }
    } finally { working = false; }
  }

  return { initialize, enqueue, get, list, resumeAfterReview };
}

async function runPipelineJob({ prototypeRoot, runsRoot, job, batch, aiConfig, authConfig, onUpdate, onCheckpoint = async () => {} }) {
  requireAiForStage(aiConfig, 'batch pipeline');
  let run;
  let inspection;
  let liveExploration;
  let plan;
  let approvedFlows;
  let generated;
  let execution;
  let insights;
  const resuming = Boolean(job.runId && job.stage === 'planning');
  if (resuming) {
    run = workspace(runsRoot, job.runId);
    inspection = await readJson(path.join(run.runDirectory, 'inspection.json'));
    liveExploration = await readJson(path.join(run.runDirectory, 'exploration.json'));
  } else {
    run = await createRunDirectory(runsRoot, job.projectPath);
    job.runId = run.runId;
    await onCheckpoint();
  }
  const log = (patch) => updateRunLog(run.runDirectory, patch, { secretValues: [aiConfig?.apiKey] });
  const stage = async (name, task) => {
    const events = [];
    onUpdate(name, `Running ${name}...`);
    try {
      const data = await task(event => {
        const clean = { at: new Date().toISOString(), phase: event.phase || name,
          message: redactSecrets(event.message || ''), progress: event.progress ?? null };
        events.push(clean);
        onUpdate(name, clean.message);
      });
      await log({ stages: { [name]: stageRecord(data, events) }, events: events.map(event => ({ stage: name, ...event })) });
      await onCheckpoint();
      return data;
    } catch (error) {
      const partialFile = name === 'exploration' ? 'exploration.json'
        : name === 'inspection' ? 'inspection.json'
          : name === 'execution' ? path.join('results', 'execution.json') : null;
      const partialData = partialFile
        ? await readJson(path.join(run.runDirectory, partialFile)).catch(() => null) : null;
      await log({ status: 'failed', failedStage: name, error: redactSecrets(error?.message || error),
        stages: { [name]: { failedAt: new Date().toISOString(), error: redactSecrets(error?.message || error), data: partialData, events } },
        events: events.map(event => ({ stage: name, ...event })) });
      throw error;
    }
  };
  await log({ runId: run.runId, projectPath: job.projectPath, batchId: batch.id,
    mode: 'batch', provider: aiConfig.provider, model: aiConfig.model,
    modelConfig: { provider: aiConfig.provider, endpoint: aiConfig.endpoint || '',
      model: aiConfig.model, criticModel: aiConfig.criticModel || '' },
    reviewPolicy: batch.autoSkipBugReview ? 'skipped-by-user' : 'human-review-required' });

  if (!resuming) {
    inspection = await stage('inspection', async onProgress => {
      const base = await inspectProject(job.projectPath, { onProgress });
      const enhanced = (await enhanceInspectionWithAi({ inspection: base, aiConfig })).inspection;
      return enhanced;
    });
    await writeJson(path.join(run.runDirectory, 'inspection.json'), inspection);

    const explorationOutput = await stage('exploration', async onProgress => {
      const evidenceDirectory = path.join(run.artifactsDirectory, 'exploration');
      await ensureDirectory(evidenceDirectory);
      const artifactRun = { ...run, evidenceDirectory, artifactBaseUrl: `/artifacts/${run.runId}` };
      const live = await exploreLiveProject({ projectPath: job.projectPath, inspection,
        runtimeConfig: {}, aiConfig, authConfig, artifactRun, onProgress });
      await writeJson(path.join(run.runDirectory, 'exploration.json'), live);
      if (live.bugDiscovery) await writeJson(path.join(run.resultsDirectory, 'potential-bugs.json'), live.bugDiscovery);
      if (live.status !== 'completed') throw new Error(live.error || `Live exploration ended with status ${live.status}.`);
      const merged = mergeLiveExplorationIntoInspection({ inspection, liveExploration: live });
      await writeJson(path.join(run.runDirectory, 'inspection.json'), merged);
      return { inspection: merged, liveExploration: live };
    });
    inspection = explorationOutput.inspection;
    liveExploration = explorationOutput.liveExploration;
    if (!batch.autoSkipBugReview && liveExploration.bugDiscovery?.hypotheses?.length) {
      await log({ status: 'awaiting-review' });
      return { awaitingReview: true };
    }
  }

  plan = await stage('planning', async onProgress => {
    if (!isExplicitBaseline(aiConfig)) requireCompletedAiExploration(inspection, 'flow planning');
    const basePlan = isExplicitBaseline(aiConfig) ? generateFlowPlan(inspection, { authConfig }) : {
      mode: 'ai-first', access: inspection.liveExploration?.access || { mode: 'guest' },
      summary: 'Model-authored flows from completed live exploration.', flows: [],
    };
    onProgress({ phase: 'flow-discovery', message: 'Generating grounded flows and criteria...', progress: 30 });
    const result = (await enhanceFlowPlanWithAi({ inspection, basePlan, aiConfig, authConfig })).plan;
    await writeJson(path.join(run.runDirectory, 'plan.json'), result);
    return result;
  });
  const selection = selectBatchApprovedFlows(plan, liveExploration, plan.access || inspection.liveExploration?.access);
  approvedFlows = selection.flows;
  if (!approvedFlows.length) throw new Error('No flow met batch auto-approval and no stable, changed browser transition with a cited observed outcome was available.');
  await log({ autoApproval: { rule: selection.rule, approvedFlowIds: approvedFlows.map(flow => flow.id) },
    approvedFlows });

  generated = await stage('generation', async onProgress => generateTestBundle({
    prototypeRoot, projectPath: job.projectPath, inspection, approvedFlows,
    runtimeConfig: {}, aiConfig, authConfig, onProgress,
  }));

  const result = await stage('execution', async onProgress => {
    if (!isExplicitBaseline(aiConfig)) {
      requireCompletedAiExploration(inspection, 'test execution');
      const invalid = (generated.generatedTests || []).find(test => !['model-assisted', 'model-journey-compiled', 'model-assisted-structured'].includes(test.generationMode));
      if (invalid) throw new Error(`Test ${invalid.title} did not originate from the model journey.`);
    }
    const executed = await runGeneratedTests({ prototypeRoot, runDirectory: generated.runDirectory,
      resultsDirectory: generated.resultsDirectory, targetProjectPath: job.projectPath,
      runtimeConfig: generated.runtimeConfig, authConfig, actionPlans: generated.actionPlans, onProgress });
    await writeJson(path.join(run.resultsDirectory, 'execution.json'), executed);
    const baseInsights = buildInsights({ inspection, approvedFlows, report: executed.report,
      runtime: executed.runtime, auth: executed.auth, policy: executed.policy,
      generatedTests: generated.generatedTests || [] });
    const finalInsights = (await enhanceInsightsWithAi({ inspection, approvedFlows,
      report: executed.report, baseInsights, generatedTests: generated.generatedTests || [], aiConfig })).insights;
    await writeJson(path.join(run.resultsDirectory, 'insights.json'), finalInsights);
    return { execution: executed, insights: finalInsights };
  });
  execution = result.execution;
  insights = result.insights;
  await log({ status: 'completed', result: execution.report?.summary?.result || 'unavailable', completedAt: new Date().toISOString(),
    testResults: execution.report?.tests || [], summary: execution.report?.summary || null,
    bugHypotheses: liveExploration.bugDiscovery?.hypotheses || [],
    bugVerdict: 'AI hypotheses only; no human confirmation implied.' });
  return { summary: execution.report?.summary || null, insights };
}

function workspace(runsRoot, runId) {
  if (!/^[a-z0-9-]+$/i.test(runId)) throw new Error('Invalid run identifier.');
  const runDirectory = path.join(runsRoot, runId);
  return { runId, runDirectory, testsDirectory: path.join(runDirectory, 'tests'),
    resultsDirectory: path.join(runDirectory, 'results'), artifactsDirectory: path.join(runDirectory, 'artifacts') };
}

module.exports = { createBatchQueue, runPipelineJob };
