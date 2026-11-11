const test = require('node:test');
const assert = require('node:assert/strict');
const { PROFILES, parseNvidiaSmi, availableLinuxMemory, detectHardware, chooseProfile, buildPlan, parseOptions } = require('../scripts/lib/runtime-profile.cjs');
const { buildUnit, quote } = require('../scripts/install-linux-service.cjs');
const { supportsVisionInput, normalizeAiConfig } = require('../src/services/llm-provider');
const hardware = (ramMiB = 16384, availableRamMiB = 12000, freeMiB = 11000) => ({
  platform: 'linux', logicalCpus: 12, ramMiB, availableRamMiB, warnings: [],
  gpus: [{ index: 0, uuid: 'GPU-example', name: 'NVIDIA', totalMiB: 12288, freeMiB }],
});

test('3060 12GB and 16GB RAM selects the vision profile from free resources', () => {
  const plan = buildPlan({ hardware: hardware(), runtime: { available: true, cuda: true } });
  assert.equal(plan.profile, 'vision-7b'); assert.equal(plan.contextTokens, 16384);
  assert.equal(plan.modelEnvironment.CUDA_VISIBLE_DEVICES, 'GPU-example');
  assert.ok(plan.args.includes('CUDA0')); assert.equal(plan.args[plan.args.indexOf('--parallel') + 1], '1');
});

test('8GB laptop with 4GB GPU prefers text even when a larger GPU name is reported', () => {
  const plan = buildPlan({ hardware: hardware(7936, 4096, 3500), runtime: { available: true, cuda: true } });
  assert.equal(plan.profile, 'text-3b'); assert.equal(plan.vision, false);
  assert.ok(plan.args.includes('--no-mmproj')); assert.ok(!plan.args.includes('--mmproj'));
  assert.ok(plan.warnings.some(item => item.includes('Text/DOM')));
});

test('free VRAM and available RAM can downgrade otherwise powerful machines', () => {
  assert.equal(chooseProfile(hardware(16384, 12000, 2000)).profile.id, 'text-1.5b');
  assert.equal(chooseProfile(hardware(16384, 2800, 11000)).profile.id, 'text-1.5b');
  assert.equal(chooseProfile(hardware(7936, 1800, 3500)).profile, null);
});

test('CPU fallback is small and insufficient memory requests a separate provider', () => {
  const cpu = buildPlan({ hardware: { ...hardware(7936, 5000), gpus: [] } });
  assert.equal(cpu.profile, 'text-1.5b'); assert.equal(cpu.backend, 'cpu');
  assert.equal(cpu.args[cpu.args.indexOf('--n-gpu-layers') + 1], '0');
  const small = buildPlan({ hardware: hardware(4096, 2200) });
  assert.equal(small.launchModel, false); assert.equal(small.profile, 'separate-provider');
});

test('a CPU-only runtime cannot silently claim it will use the NVIDIA GPU', () => {
  const plan = buildPlan({ hardware: hardware(), runtime: { available: true, cuda: false } });
  assert.equal(plan.backend, 'cpu'); assert.equal(plan.profile, 'text-1.5b');
  assert.ok(plan.warnings.some(item => item.includes('CUDA')));
});

test('auto selection uses the GPU with most free memory without adding GPU memories', () => {
  const machine = hardware();
  machine.gpus = [
    { index: 0, uuid: 'GPU-a', totalMiB: 8192, freeMiB: 6200 },
    { index: 1, uuid: 'GPU-b', totalMiB: 8192, freeMiB: 7000 },
  ];
  const plan = buildPlan({ hardware: machine });
  assert.equal(plan.profile, 'vision-3b'); assert.equal(plan.gpu.index, 1);
  assert.equal(plan.modelEnvironment.CUDA_VISIBLE_DEVICES, 'GPU-b');
});

test('Linux memory uses MemAvailable, not MemFree, and GPU output rejects unknown values', () => {
  assert.equal(availableLinuxMemory('MemFree: 1024 kB\nMemAvailable: 4194304 kB\n', 1), 4096);
  assert.equal(availableLinuxMemory('MemFree: 1024 kB\n', 123), 123);
  assert.deepEqual(parseNvidiaSmi('0, GPU-a, RTX 3060, 12288, 11000'), [
    { index: 0, uuid: 'GPU-a', name: 'RTX 3060', totalMiB: 12288, freeMiB: 11000 },
  ]);
  assert.deepEqual(parseNvidiaSmi('0, GPU-a, GPU, 4096, N/A\n1, GPU-b, GPU, 4096, 6000'), []);
});

test('hardware detection respects CUDA visibility instead of selecting a hidden GPU', () => {
  const machine = detectHardware({ platform: 'linux', env: { CUDA_VISIBLE_DEVICES: '1' },
    execute: () => '0, GPU-a, GPU, 12288, 11000\n1, GPU-b, GPU, 4096, 3500',
    read: () => 'MemAvailable: 4194304 kB\n' });
  assert.equal(machine.gpus.length, 1); assert.equal(machine.gpus[0].uuid, 'GPU-b');
  assert.equal(machine.availableRamMiB, 4096);
});

test('text and vision aliases expose the actual input mode and reserved context', async () => {
  for (const profile of PROFILES) {
    const plan = buildPlan({ hardware: hardware(), profile: profile.id });
    const ai = { provider: 'llama-cpp', endpoint: 'http://127.0.0.1:8081/v1', model: plan.alias };
    assert.equal(await supportsVisionInput(ai), profile.vision);
    assert.equal(normalizeAiConfig(ai).contextLength, profile.context);
  }
});

test('custom weights require an explicit profile and vision requires its projector', () => {
  assert.throws(() => buildPlan({ hardware: hardware(), modelPath: '/models/unknown.gguf' }), /explicit/);
  assert.throws(() => buildPlan({ hardware: hardware(), profile: 'vision-3b', modelPath: '/models/model.gguf' }), /projector/);
  assert.throws(() => buildPlan({ hardware: hardware(), profile: 'text-3b', projectorPath: '/models/projector.gguf' }), /text profile/);
  assert.throws(() => buildPlan({ hardware: hardware(), context: 'bad' }), /Context/);
  assert.throws(() => buildPlan({ hardware: hardware(), context: 2048 }), /Context/);
  assert.throws(() => buildPlan({ hardware: hardware(), context: 10000 }), /multiple/);
  assert.throws(() => buildPlan({ hardware: hardware(), device: 'Vulkan0' }), /explicit profile/);
});

test('separate provider mode does not start or download a local model', () => {
  const plan = buildPlan({ hardware: hardware(4096, 1024), remoteEndpoint: 'http://127.0.0.1:8081/v1' });
  assert.equal(plan.launchModel, false); assert.equal(plan.backend, 'separate-provider');
  assert.throws(() => buildPlan({ remoteEndpoint: 'https://user:secret@example.com' }), /credentials/);
});

test('runtime options reject typos and honor explicit CPU and context overrides', () => {
  const options = parseOptions(['--profile', 'text-3b', '--context', '4096', '--cpu'], {});
  assert.equal(options.profile, 'text-3b'); assert.equal(options.cpu, true);
  assert.throws(() => parseOptions(['--context'], {}), /Missing/);
  assert.throws(() => parseOptions(['--unknown'], {}), /Unknown/);
  assert.throws(() => parseOptions(['--cpu', '--device', 'Vulkan0'], {}), /not both/);
});

test('Linux unit starts the supervisor directly with reboot/restart and process-group cleanup', () => {
  const unit = buildUnit({ root: '/home/test/My E2P', node: '/opt/node/bin/node', environmentFile: '/home/test/.config/e2p/environment' });
  assert.ok(unit.includes('WorkingDirectory=/home/test/My E2P\n'));
  assert.ok(unit.includes('ExecStart="/opt/node/bin/node" "/home/test/My E2P/scripts/run-unattended.cjs"'));
  assert.ok(unit.includes('KillMode=control-group')); assert.ok(unit.includes('WantedBy=default.target'));
  assert.ok(unit.includes('Restart=on-failure')); assert.ok(!unit.includes('User=root'));
  assert.equal(quote('/tmp/100%'), '"/tmp/100%%"'); assert.throws(() => quote('/tmp/a\nb'), /line breaks/);
});

// Apple Silicon / Metal (unified memory)
const { availableDarwinMemory, parseMetalDevices } = require('../scripts/lib/runtime-profile.cjs');
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                     5674.
Pages active:                                 220723.
Pages inactive:                               210605.
Pages speculative:                              9366.
Pages wired down:                             188379.
Pages purgeable:                                   7.
`;
const mac = (ramMiB = 16384, availableRamMiB = 9000) => ({ platform: 'darwin', arch: 'arm64', cpu: 'Apple M4', logicalCpus: 10,
  ramMiB, availableRamMiB, gpus: [], warnings: [], unifiedMemory: { backend: 'metal', estimatedWorkingSetMiB: Math.floor(ramMiB * 0.66), source: 'estimate' } });
const metalRuntime = (freeMiB = 12123) => ({ available: true, cuda: false, metal: [{ id: 'MTL0', name: 'Apple M4', totalMiB: 12124, freeMiB }] });

test('macOS available memory counts reclaimable inactive and speculative pages, not only free pages', () => {
  assert.equal(availableDarwinMemory(VM_STAT, 1), Math.floor((5674 + 210605 + 9366) * 16384 / 1048576));
  assert.equal(availableDarwinMemory('garbage', 77), 77);
});

test('Metal devices are parsed from llama.cpp inventory', () => {
  assert.deepEqual(parseMetalDevices('Available devices:\n  BLAS: Accelerate (0 MiB, 0 MiB free)\n  MTL0: Apple M4 (12124 MiB, 12123 MiB free)'),
    [{ id: 'MTL0', name: 'Apple M4', totalMiB: 12124, freeMiB: 12123 }]);
  assert.deepEqual(parseMetalDevices('CUDA0: NVIDIA (12288 MiB, 11000 MiB free)'), []);
});

test('hardware detection on Apple Silicon uses vm_stat and does not call nvidia-smi', () => {
  const calls = [];
  const machine = detectHardware({ platform: 'darwin', arch: 'arm64', env: {}, execute: (command) => { calls.push(command); return VM_STAT; } });
  assert.deepEqual(calls, ['vm_stat']);
  assert.equal(machine.unifiedMemory.backend, 'metal'); assert.deepEqual(machine.warnings, []);
  assert.ok(machine.availableRamMiB > 3000);
});

test('16GB Apple Silicon selects a Qwen3-VL Metal profile from reclaimable memory', () => {
  const roomy = buildPlan({ hardware: mac(16384, 9000), runtime: metalRuntime() });
  assert.equal(roomy.profile, 'vision-qwen3-8b'); assert.equal(roomy.backend, 'metal'); assert.equal(roomy.vision, true);
  assert.equal(roomy.args[roomy.args.indexOf('--device') + 1], 'MTL0');
  assert.equal(roomy.args[roomy.args.indexOf('--n-gpu-layers') + 1], 'all');
  assert.deepEqual(roomy.modelEnvironment, {});
  const busy = buildPlan({ hardware: mac(16384, 3300), runtime: metalRuntime() });
  assert.equal(busy.profile, 'vision-qwen3-4b');
  const tight = buildPlan({ hardware: mac(8192, 2600), runtime: metalRuntime(5300) });
  assert.equal(tight.profile, 'text-1.5b');
  const none = buildPlan({ hardware: mac(8192, 1200), runtime: metalRuntime(5300) });
  assert.equal(none.launchModel, false);
});

test('Metal estimate is used and disclosed when llama.cpp is not installed yet', () => {
  const plan = buildPlan({ hardware: mac(16384, 9000) });
  assert.equal(plan.backend, 'metal'); assert.equal(plan.gpu.source, 'estimate');
  assert.ok(plan.warnings.some(item => item.includes('estimated')));
});

test('an installed runtime without a Metal device falls back to CPU or a separate provider', () => {
  const runtime = { available: true, cuda: false, metal: null };
  const roomy = buildPlan({ hardware: mac(16384, 9000), runtime });
  assert.equal(roomy.backend, 'cpu');
  assert.equal(roomy.args[roomy.args.indexOf('--device') + 1], 'none');
  assert.ok(roomy.warnings.some(item => item.includes('did not list a Metal device')));
  const tight = buildPlan({ hardware: mac(8192, 2600), runtime });
  assert.equal(tight.launchModel, false);
});

test('Metal-only profiles never change automatic CUDA selection', () => {
  const plan = buildPlan({ hardware: hardware(32768, 30000, 24000), runtime: { available: true, cuda: true } });
  assert.equal(plan.profile, 'vision-7b');
});
