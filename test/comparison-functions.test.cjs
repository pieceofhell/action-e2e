const test = require('node:test');
const assert = require('node:assert/strict');
const { judgeEffects } = require('../scripts/lib/comparison-functions.cjs');
const { compileEffect } = require('../scripts/evaluate-selector-comparison.cjs');

const state = index => ({ id: `s${index}`, fingerprint: `fingerprint-${index}` });
const step = (index, action) => ({ step: index, status: 'completed', action, beforeStateId: state(index - 1).id,
  afterStateId: state(index).id, afterFingerprint: state(index).fingerprint });

test('card restoration requires an earlier creation and the same question and answer after reload', () => {
  const initial = { items: [], question: 'Name?', answer: 'Ada' };
  const card = { question: 'Name?', answer: 'Ada' };
  const after = { items: [card] };
  const steps = [step(1, { kind: 'click', domId: 'add-card', name: 'Add Card' }), step(2, { kind: 'reload' })];
  const wrong = { items: [{ ...card, answer: 'Wrong answer' }] };
  assert.deepEqual(judgeEffects('memory-cards', steps, [initial, initial, initial]), []);
  assert.deepEqual(judgeEffects('memory-cards', steps, [initial, after, wrong]).map(effect => effect.id), ['create-card']);
  const effects = judgeEffects('memory-cards', steps, [initial, after, after]);
  assert.deepEqual(effects.map(effect => effect.id), ['create-card', 'restore-card']);
  const compiled = compileEffect({ id: 'example', target: 'memory-cards', exploration: { steps, states: [state(0), state(1), state(2)] } }, effects[1]);
  assert.equal(compiled.contract[0].actionStep, 1);
  assert.equal(compiled.contract[1].actionStep, 2);
  assert.match(compiled.source, /inner-card-front.*toHaveText\("Name\?"/);
  assert.match(compiled.source, /inner-card-back.*toHaveText\("Ada"/);
  assert.ok(compiled.source.indexOf(compiled.contract[0].assertionId) < compiled.source.indexOf('currentPage.reload'));
  assert.ok(compiled.source.lastIndexOf(compiled.contract[1].assertionId) > compiled.source.indexOf('currentPage.reload'));
});
