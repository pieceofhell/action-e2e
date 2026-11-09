const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseArgs } = require('node:util');
const { runPipelineJob } = require('../src/services/batch-runner');
const { normalizeAuthConfig, redactSecrets } = require('../src/services/auth-config');
const { updateRunLog } = require('../src/services/run-log');
const { readConfig, resolveModel, reviewerConfigs, modelDefaults, runtimeOptions } = require('./lib/agent-config.cjs');

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { config: { type: 'string' } } });
  if (positionals.length !== 1) throw new Error('Usage: npm run agent:run -- <project-directory> [--config config.json]');
  const projectPath = await fs.realpath(positionals[0]);
  if (!(await fs.stat(projectPath)).isDirectory()) throw new Error('The project path must be a directory.');
  const config = await readConfig(values.config);
  const defaults = modelDefaults(config);
  const aiConfig = resolveModel(defaults);
  const authConfig = normalizeAuthConfig(config.auth);
  const agentReviewers = authConfig.mode === 'authenticated' ? [] : reviewerConfigs(config, defaults);
  const runtimeConfig = runtimeOptions(config);
  const prototypeRoot = path.resolve(__dirname, '..');
  const runsRoot = path.join(prototypeRoot, 'prototype-runs');
  const job = { projectPath, runId: null, stage: 'starting' };
  const secrets = [aiConfig.apiKey, ...agentReviewers.map(reviewer => reviewer.apiKey)];
  const output = () => ({ runId: job.runId, runDirectory: job.runId ? path.join(runsRoot, job.runId) : null });
  try {
    const result = await runPipelineJob({ prototypeRoot, runsRoot, job, batch: { id: randomUUID() },
      aiConfig, authConfig, runtimeConfig, agentReviewers, onUpdate: (stage, message) => {
        job.stage = stage;
        process.stderr.write(`[${stage}] ${redactSecrets(message, secrets)}\n`);
      } });
    const summary = result.summary;
    process.stdout.write(`${JSON.stringify({ status: 'completed', ...output(), summary }, null, 2)}\n`);
    if (summary?.result !== 'passed') process.exitCode = 2;
  } catch (error) {
    const message = redactSecrets(error.message, secrets);
    if (job.runId) await updateRunLog(path.join(runsRoot, job.runId), { status: 'failed', failedStage: job.stage, error: message }).catch(() => {});
    process.stdout.write(`${JSON.stringify({ status: 'failed', ...output(), stage: job.stage, error: message }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

main().catch(error => { process.stderr.write(`${redactSecrets(error.message, [process.env.E2P_AI_API_KEY])}\n`); process.exitCode = 1; });
