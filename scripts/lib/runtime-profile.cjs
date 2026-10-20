const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

// These are conservative deployment starting points, not measured quality/performance guarantees.
const PROFILES = [
  { id: 'vision-7b', repository: 'ggml-org/Qwen2.5-VL-7B-Instruct-GGUF:Q4_K_M', vision: true, context: 16384,
    ramMiB: 12288, availableRamMiB: 5120, freeGpuMiB: 9216 },
  { id: 'vision-3b', repository: 'ggml-org/Qwen2.5-VL-3B-Instruct-GGUF:Q4_K_M', vision: true, context: 8192,
    ramMiB: 10240, availableRamMiB: 4096, freeGpuMiB: 6144 },
  { id: 'text-3b', repository: 'Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M', vision: false, context: 8192,
    ramMiB: 6656, availableRamMiB: 3072, freeGpuMiB: 3072 },
  { id: 'text-1.5b', repository: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M', vision: false, context: 8192,
    ramMiB: 6144, availableRamMiB: 2560, freeGpuMiB: 1536 },
];

function parseNvidiaSmi(output) {
  return String(output || '').trim().split(/\r?\n/).filter(Boolean).flatMap(line => {
    const parts = line.split(',').map(item => item.trim());
    const [index, uuid, ...rest] = parts;
    const freeMiB = Number(rest.pop()); const totalMiB = Number(rest.pop());
    if (!/^\d+$/.test(index) || !uuid?.startsWith('GPU-') || !Number.isFinite(totalMiB)
      || !Number.isFinite(freeMiB) || freeMiB < 0 || freeMiB > totalMiB) return [];
    return [{ index: Number(index), uuid, name: rest.join(', ').replace(/^"|"$/g, ''), totalMiB, freeMiB }];
  });
}

function availableLinuxMemory(text, fallbackMiB) {
  const match = String(text || '').match(/^MemAvailable:\s+(\d+)\s+kB/m);
  return match ? Math.floor(Number(match[1]) / 1024) : fallbackMiB;
}

function detectHardware({ platform = process.platform, env = process.env, execute = execFileSync, read = fs.readFileSync } = {}) {
  const hardware = { platform, cpu: os.cpus()[0]?.model || 'unknown', logicalCpus: os.cpus().length,
    ramMiB: Math.floor(os.totalmem() / 1048576), availableRamMiB: Math.floor(os.freemem() / 1048576), gpus: [], warnings: [] };
  if (platform === 'linux') {
    try { hardware.availableRamMiB = availableLinuxMemory(read('/proc/meminfo', 'utf8'), hardware.availableRamMiB); } catch {}
  }
  try {
    hardware.gpus = parseNvidiaSmi(execute('nvidia-smi', ['--query-gpu=index,uuid,name,memory.total,memory.free', '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
    if (env.CUDA_VISIBLE_DEVICES !== undefined) {
      const allowed = env.CUDA_VISIBLE_DEVICES.split(',').map(item => item.trim());
      hardware.gpus = hardware.gpus.filter(gpu => allowed.includes(String(gpu.index)) || allowed.some(item => item.startsWith('GPU-') && gpu.uuid.startsWith(item)));
    }
  } catch { hardware.warnings.push('NVIDIA free VRAM could not be measured. Automatic selection uses CPU or a separate inference server.'); }
  return hardware;
}

function findExecutable(requested, env = process.env, platform = process.platform) {
  if (path.isAbsolute(requested) || requested.includes('/') || requested.includes('\\')) return fs.existsSync(requested) ? path.resolve(requested) : null;
  for (const directory of String(env.PATH || '').split(platform === 'win32' ? ';' : ':')) {
    const candidate = path.join(directory.replace(/^"|"$/g, ''), requested);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function inspectRuntime(server) {
  if (!server) return { available: false, cuda: null, version: null };
  try {
    const result = spawnSync(server, ['--list-devices'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    if (result.status !== 0) throw result.error || new Error(`exit ${result.status}`);
    const devices = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    const version = spawnSync(server, ['--version'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    return { available: true, cuda: /\bCUDA\d+\b/.test(devices),
      version: `${version.stdout || ''}\n${version.stderr || ''}`.trim().slice(0, 1000), devices: devices.slice(0, 3000) };
  } catch (error) {
    // Some builds print the inventory on stderr. It still must be a successful invocation.
    return { available: false, cuda: null, version: null, error: `Runtime inventory failed (${error.code || error.status || 'unknown'}). Check the binary and its libraries.` };
  }
}

function chooseProfile(hardware, { profile = 'auto', cuda = null, cpu = false } = {}) {
  if (profile !== 'auto' && !PROFILES.some(item => item.id === profile)) throw new Error(`Unknown profile: ${profile}`);
  const gpu = !cpu && cuda !== false ? [...hardware.gpus].sort((a, b) => b.freeMiB - a.freeMiB)[0] : null;
  const fitsRam = item => hardware.ramMiB >= item.ramMiB && hardware.availableRamMiB >= item.availableRamMiB;
  let selected = profile === 'auto'
    ? PROFILES.find(item => gpu && fitsRam(item) && gpu.freeMiB >= item.freeGpuMiB)
    : PROFILES.find(item => item.id === profile);
  if (!selected && hardware.ramMiB >= 6144 && hardware.availableRamMiB >= 4096) selected = PROFILES.at(-1);
  if (!selected) return { profile: null, gpu: null, backend: 'separate-provider',
    reason: 'Available memory is below the local starting profiles. Run the interface/browser here and use another inference server.' };
  const useGpu = Boolean(gpu && (profile !== 'auto' || gpu.freeMiB >= selected.freeGpuMiB));
  return { profile: selected, gpu: useGpu ? gpu : null, backend: useGpu ? 'cuda' : 'cpu',
    reason: profile === 'auto' ? 'Selected from available RAM, free VRAM and runtime capabilities at startup.' : 'Explicit profile; memory estimates are advisory.' };
}

function buildPlan({ hardware, runtime = { available: false, cuda: null }, server = null, profile = 'auto', cpu = false,
  context, modelPath, projectorPath, device, remoteEndpoint } = {}) {
  if (remoteEndpoint) {
    const url = new URL(remoteEndpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) endpoint without embedded credentials.');
    return { profile: 'separate-provider', backend: 'separate-provider', hardware, endpoint: remoteEndpoint,
      launchModel: false, reason: 'Existing inference server selected. Only E2P is started on this machine.' };
  }
  if (device && profile === 'auto') throw new Error('An unmeasured GPU device requires an explicit profile.');
  if (context !== undefined && (!Number.isInteger(Number(context)) || Number(context) < 4096 || Number(context) > 32768 || Number(context) % 1024 !== 0)) {
    throw new Error('Context must be a multiple of 1024 from 4096 through 32768.');
  }
  if (modelPath && profile === 'auto') throw new Error('Local GGUF paths require an explicit --profile; their size cannot be inferred from the machine.');
  const selected = chooseProfile(hardware, { profile, cuda: device ? true : runtime.cuda, cpu });
  const warnings = [...(hardware.warnings || [])];
  if (!selected.profile) return { ...selected, profile: 'separate-provider', hardware, launchModel: false, warnings };
  const config = selected.profile;
  const contextTokens = Number(context || config.context);
  if (!Number.isInteger(contextTokens) || contextTokens < 4096 || contextTokens > 32768 || contextTokens % 1024 !== 0) throw new Error('Context must be a multiple of 1024 from 4096 through 32768.');
  if (modelPath && config.vision && !projectorPath) throw new Error('Vision with local weights requires a matching projector.');
  if (projectorPath && !config.vision) throw new Error('A text profile does not load a vision projector.');
  if (projectorPath && !modelPath) throw new Error('A local projector requires a local model path.');
  if (device && profile === 'auto') throw new Error('An unmeasured GPU device requires an explicit profile.');
  const backend = device ? 'explicit-device' : selected.backend;
  const alias = `e2p-${config.vision ? 'vl' : 'text'}-${config.id.replace(/^(vision|text)-/, '')}-${contextTokens / 1024}k`;
  const args = ['--alias', alias, '--ctx-size', String(contextTokens), '--parallel', '1', '--split-mode', 'none',
    '--n-gpu-layers', backend === 'cpu' ? '0' : 'all', '--device', device || (backend === 'cuda' ? 'CUDA0' : 'none'),
    '--flash-attn', 'on', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0', '--fit', 'off',
    '--threads', String(Math.max(1, Math.min(6, Math.floor(hardware.logicalCpus / 2)))),
    '--batch-size', '256', '--ubatch-size', '128', '--host', '127.0.0.1', '--port', '8081', '--no-webui'];
  if (modelPath) {
    args.push('--model', path.resolve(modelPath));
    if (projectorPath) args.push('--mmproj', path.resolve(projectorPath));
    warnings.push('Custom weights/projector may have different memory requirements from this profile.');
  } else args.push('-hf', config.repository);
  if (!config.vision) args.push('--no-mmproj');
  if (runtime.available && runtime.cuda === false && hardware.gpus.length && !device && !cpu) warnings.push('This llama.cpp binary did not expose CUDA. Install a CUDA build to use the detected NVIDIA GPU.');
  if (contextTokens > config.context) warnings.push('Context exceeds the starting profile budget; check memory during startup.');
  if (profile !== 'auto' && (hardware.ramMiB < config.ramMiB || hardware.availableRamMiB < config.availableRamMiB)) {
    warnings.push('Available system memory is below this profile starting budget. Choose a smaller profile or a separate provider.');
  }
  if (!config.vision) warnings.push('Text/DOM-only inference: screenshots are not supplied to this model. Exploration quality must be evaluated separately.');
  return { profile: config.id, hardware, backend, gpu: selected.gpu, server, runtime, args, alias,
    contextTokens, vision: config.vision, modelSource: modelPath ? 'local-files' : config.repository,
    launchModel: true, reason: selected.reason, warnings,
    modelEnvironment: backend === 'cuda' ? { CUDA_VISIBLE_DEVICES: selected.gpu.uuid } : {} };
}

function parseOptions(argv = [], env = process.env) {
  const options = { profile: env.E2P_RUNTIME_PROFILE || 'auto', server: env.E2P_LLAMA_SERVER || (process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'),
    modelPath: env.E2P_MODEL_PATH, projectorPath: env.E2P_PROJECTOR_PATH, device: env.E2P_GPU_DEVICE,
    remoteEndpoint: env.E2P_AI_ENDPOINT || undefined, context: env.E2P_RUNTIME_CONTEXT || undefined, cpu: false, dryRun: false, applicationOnly: false };
  const flags = { '--profile': 'profile', '--server': 'server', '--context': 'context', '--model': 'modelPath', '--projector': 'projectorPath', '--device': 'device', '--remote': 'remoteEndpoint' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--cpu') options.cpu = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--application-only') options.applicationOnly = true;
    else if (flags[flag]) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}.`);
      options[flags[flag]] = argv[++i];
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (options.cpu && options.device) throw new Error('Choose --cpu or --device, not both.');
  return options;
}

function preparePlan(options) {
  const hardware = detectHardware();
  const server = findExecutable(options.server);
  const runtime = inspectRuntime(server);
  return buildPlan({ ...options, hardware, runtime, server });
}

module.exports = { PROFILES, parseNvidiaSmi, availableLinuxMemory, detectHardware, findExecutable, inspectRuntime,
  chooseProfile, buildPlan, parseOptions, preparePlan };
