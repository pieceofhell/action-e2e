const fs = require('node:fs/promises');
const { normalizeAiConfig } = require('../../src/services/llm-provider');

async function readConfig(file) {
  const raw = file ? JSON.parse(await fs.readFile(file, 'utf8')) : {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The agent configuration must be a JSON object.');
  return raw;
}

function readEndpoint(value, { loopback = false } = {}) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP(S) URL without credentials, a query or a fragment.');
  }
  if (loopback && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use a loopback URL for this operation.');
  return value;
}

function resolveModel(input = {}, fallback = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || 'apiKey' in input) throw new Error('Model configuration must use apiKeyEnv, not inline credentials.');
  const { apiKeyEnv = 'E2P_AI_API_KEY', provider, endpoint, model, contextLength, criticModel } = { ...fallback, ...input };
  if (!/^E2P_[A-Z0-9_]+$/.test(apiKeyEnv)) throw new Error('apiKeyEnv must name an E2P_ environment variable.');
  const config = normalizeAiConfig({ provider, endpoint, model, contextLength, apiKey: process.env[apiKeyEnv] });
  if (!config.enabled) throw new Error('Configure a model, endpoint and any required key; set E2P_AI_MODEL or use a JSON configuration.');
  readEndpoint(config.endpoint);
  return { ...config, criticModel };
}

function reviewerConfigs(config, fallback) {
  const list = config.reviewers === undefined ? [{}, {}] : config.reviewers;
  if (!Array.isArray(list) || list.length !== 2) throw new Error('Configure exactly two reviewers.');
  return list.map(input => {
    const reviewer = resolveModel(input, fallback);
    readEndpoint(reviewer.endpoint, { loopback: config.allowRemoteReview !== true });
    return reviewer;
  });
}

function modelDefaults(config) {
  return { provider: process.env.E2P_AI_PROVIDER || 'llama-cpp', endpoint: process.env.E2P_AI_ENDPOINT,
    model: process.env.E2P_AI_MODEL, ...config.model };
}

function runtimeOptions(config) {
  const runtime = config.runtime || {};
  const mode = runtime.mode || 'static';
  if (!['static', 'external', 'command'].includes(mode)) throw new Error('Runtime mode must be static, external or command.');
  if (mode === 'external' || mode === 'command') readEndpoint(runtime.baseUrl, { loopback: true });
  if (mode === 'command' && (config.allowCommand !== true || typeof runtime.startCommand !== 'string' || !runtime.startCommand.trim())) {
    throw new Error('Command mode requires allowCommand: true and an explicit startCommand.');
  }
  if (runtime.runInstallBeforeExecution && (mode !== 'command' || typeof runtime.installCommand !== 'string' || !runtime.installCommand.trim())) {
    throw new Error('Automatic installation requires command mode and an explicit installCommand.');
  }
  return { mode, baseUrl: runtime.baseUrl || '', workingDirectory: runtime.workingDirectory || '.',
    startCommand: mode === 'command' ? runtime.startCommand : '', installCommand: runtime.installCommand || '',
    runInstallBeforeExecution: runtime.runInstallBeforeExecution === true, disposableLocalProfile: runtime.disposableLocalProfile === true };
}

module.exports = { readConfig, resolveModel, reviewerConfigs, modelDefaults, runtimeOptions };
