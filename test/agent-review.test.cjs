const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReviewPacket, runAgentReviews, compareAgentReviews } = require('../src/services/agent-review');
const { runtimeOptions, reviewerConfigs } = require('../scripts/lib/agent-config.cjs');

const models = ['model-a', 'model-b'].map(model => ({ model, provider: 'llama-cpp' }));
const makePacket = () => buildReviewPacket([{ runId: 'archived-run', exploration: {
  agenticExploration: { steps: [{ step: 1, status: 'completed', action: { kind: 'click', name: 'Prev' }, beforeStateId: 's1', afterStateId: 's2' }],
    states: [{ id: 's1', visibleTextExcerpt: 'canary-secret', inputDetails: [{ domId: 'password', type: 'password', value: 'secret-input' }] }, { id: 's2', visibleTextExcerpt: 'summer' }] },
  bugDiscovery: {
    hypotheses: [{ id: 'internal-a', title: 'Track title changes', criticReview: { verdict: 'retain' } }],
    rejectedHypotheses: [{ id: 'internal-b', title: 'Play click fails', reason: 'verdict-text', verdict: 'reject', claim: { title: 'Play click fails',
      observed: { result: 'summer', facts: [{ statement: 'Title changed', evidenceRefs: ['s2'] }] }, expected: { result: 'No exception', source: 'runtime-diagnostic' } } }],
  },
} }], { secretValues: ['canary-secret'] });

test('packet includes nested evidence for discarded cases without exposing labels, private ids or secrets', () => {
  const { packet, mapping } = makePacket();
  assert.equal(packet.cases.length, 2);
  const claim = packet.cases.find(item => item.summary === 'Play click fails');
  assert.equal(claim.observedFacts[0].evidenceRefs[0], 's2');
  assert.equal(claim.expected, 'No exception');
  assert.equal(mapping[claim.id].hypothesisId, 'internal-b');
  assert.doesNotMatch(JSON.stringify(packet), /verdict-text|criticReview|internal-[ab]|archived-run|canary-secret|secret-input/);
});

test('two reviewer calls use the same evidence and disagreements remain unresolved', async () => {
  const { packet } = makePacket();
  const prompts = []; const reviews = [];
  const result = await runAgentReviews(packet, models, {
    onReview: async review => reviews.push(review),
    request: async ({ aiConfig, userPrompt }) => {
      prompts.push(userPrompt);
      return { label: aiConfig.model === 'model-a' ? 'nao-sustentado' : 'inconclusivo', justification: 'Cita estado s2.' };
    },
  });
  assert.deepEqual(prompts.slice(0, 2), prompts.slice(2));
  assert.deepEqual(reviews.map(review => review.model), ['model-a', 'model-b']);
  assert.equal(result.humanValidation, false);
  assert.equal(result.n, 2);
  assert.equal(result.disagreements.length, 2);
  assert.ok(result.cases.every(item => item.status === 'unresolved-disagreement' && item.label === null));
  assert.throws(() => compareAgentReviews(packet, { ...reviews[0], labels: [] }, reviews[1]), /Missing agent judgments/);
  assert.throws(() => compareAgentReviews({ ...packet, cases: [] }, ...reviews), /hash/);
});

test('missing cases do not call a reviewer or invent an agreement measurement', async () => {
  const { packet } = buildReviewPacket([]);
  assert.deepEqual(await runAgentReviews(packet, models, { request: () => assert.fail('model called without evidence') }),
    { status: 'not-applicable', reason: 'no-candidates', humanValidation: false });
});

test('automation requires explicit startup commands and opt-in for external reviewers', () => {
  assert.equal(runtimeOptions({}).mode, 'static');
  assert.throws(() => runtimeOptions({ runtime: { mode: 'command', baseUrl: 'http://127.0.0.1:7000', startCommand: 'npm start' } }), /allowCommand/);
  assert.throws(() => runtimeOptions({ runtime: { mode: 'external', baseUrl: 'http://example.test' } }), /loopback/);
  const model = { model: 'm', provider: 'openai-compatible', endpoint: 'https://example.test/v1' };
  assert.throws(() => reviewerConfigs({}, model), /loopback/);
  assert.equal(reviewerConfigs({ allowRemoteReview: true }, model).length, 2);
});
