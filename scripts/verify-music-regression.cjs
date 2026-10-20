const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createRunDirectory, writeJson } = require('../src/services/artifact-store');
const { generateTestBundle } = require('../src/services/test-generator');
const { runGeneratedTests } = require('../src/services/test-runner');
const { startTargetRuntime } = require('../src/services/runtime-orchestrator');

const prototypeRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(prototypeRoot, '..');
const target = path.join(workspaceRoot, 'candidates', 'vanillawebprojects', 'music-player');
const legacy = path.join(prototypeRoot, 'test', 'fixtures', 'music-player-journey');
const outputRoot = path.join(workspaceRoot, 'output', 'e2p-evolution-20261006', 'regression-pairs',
  `music-player-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const runtimeConfig = { mode: 'static', runInstallBeforeExecution: false };

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });
  const mutant = path.join(outputRoot, 'music-player-prev-disabled');
  await fs.cp(target, mutant, { recursive: true });
  const scriptFile = path.join(mutant, 'script.js');
  const original = await fs.readFile(scriptFile, 'utf8');
  const needle = "prevBtn.addEventListener('click', prevSong);";
  if (!original.includes(needle)) throw new Error('Reference mutation location changed; stop instead of guessing.');
  await fs.writeFile(scriptFile, original.replace(needle, '// prev listener intentionally disabled for regression verification'));

  const independent = {
    correct: await inspectTrackTransition(target),
    defective: await inspectTrackTransition(mutant),
  };
  if (independent.correct.before !== 'ukulele' || independent.correct.after !== 'summer'
    || independent.defective.before !== 'ukulele' || independent.defective.after !== 'ukulele') {
    throw new Error('Independent browser validation of the correct/defective pair failed.');
  }

  const inspection = JSON.parse(await fs.readFile(path.join(legacy, 'inspection.json'), 'utf8'));
  inspection.liveExploration.artifactRun = null;
  const approvedFlows = JSON.parse(await fs.readFile(path.join(legacy, 'approved-flows.json'), 'utf8'));
  const v1 = await generateTestBundle({ prototypeRoot, projectPath: target, inspection, approvedFlows,
    runtimeConfig, aiConfig: { provider: 'llama-cpp', model: 'frozen-observed-journey', endpoint: 'http://127.0.0.1:8081/v1' },
    authConfig: { mode: 'guest' } });
  const old = await createRunDirectory(path.join(prototypeRoot, 'prototype-runs'), target);
  await fs.copyFile(path.join(legacy, 'tests', 'track-navigation-prev.spec.cjs'), path.join(old.testsDirectory, 'track-navigation-prev.spec.cjs'));
  await fs.copyFile(path.join(legacy, 'playwright.config.cjs'), path.join(old.runDirectory, 'playwright.config.cjs'));
  await writeJson(path.join(old.runDirectory, 'generated-tests.json'), [{ title: approvedFlows[0].title, flowId: approvedFlows[0].id }]);

  const results = { protocol: 'frozen-journey-compiler-development-regression', independent,
    sourceRunId: path.basename(legacy), mutation: needle, target, mutant,
    suites: {
      V0: { runId: old.runId, sha256: sha(await fs.readFile(path.join(old.testsDirectory, 'track-navigation-prev.spec.cjs'))) },
      V1: { runId: v1.runId, sha256: sha(await fs.readFile(path.join(v1.testsDirectory, 'track-navigation-prev.spec.cjs'))),
        criterionContract: v1.generatedTests[0].criterionContract },
    }, replays: [] };
  for (const [version, run] of [['V0', old], ['V1', v1]]) {
    for (const [member, projectPath] of [['correct', target], ['defective', mutant]]) {
      const beforeHash = sha(await fs.readFile(path.join(run.testsDirectory, 'track-navigation-prev.spec.cjs')));
      const replay = await runGeneratedTests({ prototypeRoot, runDirectory: run.runDirectory,
        resultsDirectory: run.resultsDirectory, targetProjectPath: projectPath,
        runtimeConfig, authConfig: { mode: 'guest' } });
      const afterHash = sha(await fs.readFile(path.join(run.testsDirectory, 'track-navigation-prev.spec.cjs')));
      if (beforeHash !== afterHash) throw new Error('The frozen suite changed during replay.');
      results.replays.push({ version, member, suiteSha256: afterHash, summary: replay.report.summary,
        failures: replay.report.tests.flatMap(test => test.errors || []) });
      await fs.cp(run.resultsDirectory, path.join(outputRoot, `${version}-${member}-results`), { recursive: true });
    }
  }
  await writeJson(path.join(outputRoot, 'pair-result.json'), results);
  process.stdout.write(`${JSON.stringify(results.replays.map(({ version, member, summary }) => ({ version, member, result: summary.result })), null, 2)}\nEvidence: ${outputRoot}\n`);
}

async function inspectTrackTransition(projectPath) {
  const runtime = await startTargetRuntime({ targetProjectPath: projectPath, runtimeConfig });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(runtime.baseUrl);
    const before = await page.locator('#title').innerText();
    await page.locator('#prev').click();
    const after = await page.locator('#title').innerText();
    return { before, after };
  } finally { await browser.close(); await runtime.stop(); }
}
function sha(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
main().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
