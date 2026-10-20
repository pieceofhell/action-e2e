const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAcceptanceContract } = require('../src/services/acceptance-contract');
const { validateCriticReview, screenHypotheses } = require('../src/services/bug-discovery');
const { normalizeAiConfig } = require('../src/services/llm-provider');

test('8k deployment alias respects its small context instead of inheriting the 16k default', () => {
  assert.equal(normalizeAiConfig({ provider: 'llama-cpp', model: 'e2p-vl-rtx3060-8k' }).contextLength, 8192);
  assert.equal(normalizeAiConfig({ provider: 'llama-cpp', model: 'e2p-vl-rtx3060-16k' }).contextLength, 16384);
});

function inputContract({ outcome = "The field value should be '99'.", inputs, statesMissing = false, steps } = {}) {
  return buildAcceptanceContract({ id: 'amount-check', criteria: [{
    title: 'Approved amount', given: 'The form is open', when: 'The user enters Amount', then: outcome,
    expectationSource: 'project-requirement', sourceReference: 'Explicit test requirement',
  }] }, steps || [{ step: 1, action: { kind: 'fill', name: 'Amount', domId: 'amount', value: '42' }, afterFingerprint: 'after' }],
  statesMissing ? [{ fingerprint: 'unrelated', inputDetails: [{ domId: 'amount', value: '42' }] }]
    : [{ fingerprint: 'after', inputDetails: inputs || [{ domId: 'amount', value: '42' }] }])[0];
}

test('approved expected value survives disagreement with the recorded application', () => {
  const item = inputContract();
  assert.equal(item.status, 'asserted');
  assert.equal(item.expectedValue, '99');
  assert.equal(item.assertion.value, '99');
  assert.equal(item.expectationSource.kind, 'project-requirement');
  assert.equal(inputContract({ outcome: 'The field value should be 99.' }).expectedValue, '99');
});

test('unrelated fields with the same observed value cannot establish the target input', () => {
  assert.equal(inputContract({ inputs: [{ domId: 'other', label: 'Other', value: '42' }] }).status, 'unverified');
});

test('missing action state cannot borrow the last available state', () => {
  assert.equal(inputContract({ statesMissing: true }).status, 'unverified');
});

test('ambiguous approved alternatives stay unverified', () => {
  assert.equal(inputContract({ outcome: "The field contains '99' or '100'." }).status, 'unverified');
});

test('click criteria do not bind to a similarly labelled fill action', () => {
  const item = buildAcceptanceContract({ id: 'click', criteria: [{ given: 'Form', when: 'The user clicks Amount',
    then: "The text 'Saved' appears" }] }, [{ step: 1, action: { kind: 'fill', name: 'Amount', value: '42' }, afterFingerprint: 'after' }],
  [{ fingerprint: 'after', visibleTextExcerpt: 'Saved' }])[0];
  assert.equal(item.status, 'unverified');
  assert.equal(item.actionStep, null);
});

test('approved visible result is compiled even when missing from the observed text', () => {
  const item = buildAcceptanceContract({ id: 'save', criteria: [{ given: 'Form', when: 'The user clicks Save',
    then: "The text 'Saved' appears" }] }, [{ step: 1, action: { kind: 'click', name: 'Save' }, afterFingerprint: 'after' }],
  [{ fingerprint: 'after', visibleTextExcerpt: 'Unexpected failure' }])[0];
  assert.equal(item.expectedValue, 'Saved');
});

const gates = { actionExecuted: true, expectationGrounded: true, evidenceSufficient: true,
  expectationSatisfied: false, confidence: 'high', observedOutcome: 'The saved item disappears after reload.' };

test('a candidate cannot describe the same outcome as expected and observed and claim a defect', () => {
  const outcome = 'The modal opens with fields but no submission feedback is visible.';
  const result = screenHypotheses([{ id: 'same', title: 'Form feedback', confidence: 'high',
    expected: { source: 'cross-state-consistency', result: outcome }, observed: { result: ` ${outcome.toUpperCase()} ` } }]);
  assert.equal(result.retained.length, 0);
  assert.match(result.rejected[0].reason, /outcomes are identical/);
  const labelled = screenHypotheses([{ id: 'labelled', title: 'Form feedback', triggerActionName: 'Sign Up',
    expected: { source: 'cross-state-consistency', result: 'The Sign Up modal opens but no feedback is visible.' },
    observed: { result: 'The modal opens but no feedback is visible.' } }]);
  assert.match(labelled.rejected[0].reason, /outcomes are identical/);
});

test('a recorded runtime violation remains eligible when expected and observed outcomes differ', () => {
  const item = { id: 'runtime', title: 'Uncaught TypeError',
    expected: { source: 'runtime-diagnostic', result: 'No uncaught exception occurs.' },
    observed: { result: 'An uncaught TypeError occurs.', facts: [{ statement: 'The browser raised a TypeError', evidenceRefs: ['page-error-1'] }] },
    evidence: { pageErrors: [{ id: 'page-error-1', message: 'TypeError: missing element' }] } };
  assert.equal(screenHypotheses([item]).retained.length, 1);
});

for (const reason of ['The evidence does support the hypothesis.', 'The observations do support the claim.', 'The facts did support the allegation.']) {
  test(`critic preserves affirmative evidence: ${reason}`, () => {
    assert.equal(validateCriticReview({ ...gates, reason }).verdict, 'retain');
  });
}
for (const reason of ['The evidence does not support the hypothesis.', 'The observations do not support the claim.',
  'The facts did not support the allegation.', 'The evidence cannot support the claim.', 'The evidence fails to support the anomaly.']) {
  test(`critic detects genuinely contradictory reasoning: ${reason}`, () => {
    assert.throws(() => validateCriticReview({ ...gates, reason }), /observations reject/);
  });
}
