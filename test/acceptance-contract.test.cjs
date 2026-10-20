const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeApprovedFlow, buildAcceptanceContract } = require('../src/services/acceptance-contract');
const { buildObservedJourneySpecContent } = require('../src/services/test-generator');

test('edited criteria replace stale structured criteria and malformed edits are rejected', () => {
  const flow = { title: 'Example', criteria: [{ title: 'Old', given: 'old', when: 'old', then: 'old' }],
    criteriaText: 'New behavior\nGiven the item exists\nWhen the user clicks Save\nThen the item remains visible' };
  assert.equal(normalizeApprovedFlow(flow).criteria[0].then, 'the item remains visible');
  assert.throws(() => normalizeApprovedFlow({ ...flow, criteriaText: 'New behavior\nGiven context\nThen outcome' }), /incomplete/);
});

test('Music Player regression assertion checks the changed track immediately after Prev', () => {
  const directory = path.join(__dirname, 'fixtures', 'music-player-journey');
  const flow = JSON.parse(fs.readFileSync(path.join(directory, 'approved-flows.json'), 'utf8'))[0];
  const inspection = JSON.parse(fs.readFileSync(path.join(directory, 'inspection.json'), 'utf8'));
  let contract;
  const source = buildObservedJourneySpecContent(flow, inspection, result => { contract = result; });
  assert.equal(contract[0].status, 'asserted');
  assert.equal(contract[0].expectationSource.kind, 'inferred-from-observation');
  assert.equal(contract[0].expectedValue, 'summer');
  assert.ok(source.indexOf('getByText("summer"') > source.indexOf('locator("#prev").click()'));
  assert.ok(source.indexOf('getByText("summer"') < source.indexOf('locator("#play").click()'));
});

test('unsupported domain calculation remains unverified', () => {
  const contract = buildAcceptanceContract({ id: 'expense', evidenceStateIds: ['state-2'], criteria: [{
    title: 'Correct balance', given: 'a balance of 100', when: 'Add is clicked',
    then: 'The balance obeys the accounting rule for the entered transaction.',
  }] }, [{ step: 1, action: { kind: 'click', domId: 'add', name: 'Add' }, afterFingerprint: 'after' }], [
    { id: 'state-2', fingerprint: 'after', visibleTextExcerpt: 'Balance 125' },
  ]);
  assert.equal(contract[0].status, 'unverified');
  assert.equal(contract[0].assertionId, null);
});

test('a criterion about an unexecuted action cannot borrow the only observed step', () => {
  const contract = buildAcceptanceContract({ id: 'form', criteria: [{
    title: 'Submit form', given: 'The form is open', when: 'The user clicks Submit',
    then: "The confirmation 'Saved' appears",
  }] }, [{ step: 1, action: { kind: 'click', name: 'Open form' }, afterFingerprint: 'after' }], [
    { id: 'state-2', fingerprint: 'after', visibleTextExcerpt: 'Saved' },
  ]);
  assert.equal(contract[0].status, 'unverified');
  assert.equal(contract[0].actionStep, null);
});
