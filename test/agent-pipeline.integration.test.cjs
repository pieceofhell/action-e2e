const test = require('node:test');
const os = require('node:os');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const repo = path.resolve(__dirname, '..');
const calls = [];

test('agent CLI reviews real browser evidence with two configured reviewers and reaches Playwright and the report', { timeout: 60000 }, async (t) => {
  const target = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'agent-smoke-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  await fs.writeFile(path.join(target, 'index.html'), `<!doctype html><title>Details demo</title><h1>Details demo</h1><button id="show">Show details</button><script>document.querySelector('#show').addEventListener('click',function(){this.remove();document.body.insertAdjacentHTML('beforeend','<h2>Details visible</h2>');throw new Error('Controlled page diagnostic');});</script>`);
  const server = http.createServer(async (req, res) => {
    try {
      let text = ''; for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      const schema = body.response_format?.json_schema?.name;
      const sys = body.messages.find(message => message.role === 'system')?.content || '';
      const input = JSON.parse(body.messages.find(message => message.role === 'user').content);
      calls.push({ schema, model: body.model });
      let answer;
      if (schema === 'exploration_decision') {
        const action = input.safeActions.find(item => item.name === 'Show details');
        answer = { decision: action ? 'act' : 'finish', actionId: action?.id || '', value: '', rationale: 'Open the visible details.', expectedOutcome: 'Details visible' };
      } else if (schema === 'e2p_bug_hypotheses') answer = { hypotheses: [] };
      else if (schema === 'e2p_agent_judgment') answer = { label: 'defeito-confirmado', justification: 'A trajetória registra a exceção Controlled page diagnostic após o clique.' };
      else if (schema === 'e2p_flow_plan' || schema === 'e2p_single_flow') {
        const state = input.evidenceContract?.allowedStateIds?.at(-1) || input.transition?.resultingStateId || 'state-2';
        const flow = { id: 'show-details', title: 'Show details', summary: 'Click Show details and see Details visible.', confidence: 'high', evidenceStateIds: [state], sourceSignals: ['Show details', 'Details visible'], assumptions: [], criteria: [{ title: 'Details visible', given: 'Details demo is displayed', when: 'click Show details', then: 'Details visible is shown' }] };
        answer = schema === 'e2p_flow_plan' ? { summary: 'Show details', flows: [flow] } : { flow };
      } else if (sys.includes('execution facts')) answer = { overview: 'The observed journey checks only the Details visible heading.', insights: [], limitations: [], nextSteps: [] };
      else answer = { projectSynopsis: 'A details demo with a Show details button.', userPersona: 'User', mainCapabilities: ['Show details'], confidence: 'high', reasoning: ['Static HTML'], warnings: [] };
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
    } catch (error) { res.statusCode = 500; res.end(error.message); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const config = path.join(target, 'runner.json');
    await fs.writeFile(config, JSON.stringify({ model: { provider: 'llama-cpp', endpoint: `http://127.0.0.1:${server.address().port}/v1`, model: 'fixture-main' }, reviewers: [{ model: 'fixture-a' }, { model: 'fixture-b' }] }));
    const child = spawn(process.execPath, [path.join(repo, 'scripts/run-agent-pipeline.cjs'), target, '--config', config], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const [exit] = await once(child, 'close');
    const result = JSON.parse(stdout);
    assert.equal(exit, 0, stderr);
    assert.equal(result.status, 'completed'); assert.equal(result.summary.passed, 1);
    const log = JSON.parse(await fs.readFile(path.join(result.runDirectory, 'run-log.json'), 'utf8'));
    assert.deepEqual(Object.keys(log.stages), ['inspection', 'exploration', 'agent-review', 'planning', 'generation', 'execution']);
    assert.deepEqual(calls.filter(call => call.schema === 'e2p_agent_judgment').map(call => call.model), ['fixture-a', 'fixture-b']);
    assert.equal(log.stages['agent-review'].data.humanValidation, false);
    assert.ok(log.stages.execution.data.insights);
    assert.equal(log.stages['agent-review'].data.n, 1);
    const expectedRoot = await fs.realpath(path.join(repo, 'prototype-runs'));
    for (const directory of new Set([result.runDirectory, log.stages.generation.data.runDirectory])) {
      const resolved = await fs.realpath(directory);
      const childName = path.relative(expectedRoot, resolved);
      assert.match(childName, /^agent-smoke-[a-z0-9-]+$/i);
      await fs.rm(resolved, { recursive: true, force: true });
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
