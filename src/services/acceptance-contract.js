function formatCriteria(criteria = []) {
  return criteria.map(item => [item.title, `Given ${item.given}`, `When ${item.when}`, `Then ${item.then}`].join('\n')).join('\n\n');
}

function normalizeApprovedFlow(flow) {
  const text = String(flow.criteriaText || '').trim();
  if (!text || text === formatCriteria(flow.criteria || []).trim()) return flow;
  const criteria = text.split(/\n\s*\n/).map((block, index) => {
    const lines = block.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const title = lines.shift();
    const fields = {};
    for (const line of lines) {
      const match = /^(Given|When|Then)\s+(.+)$/i.exec(line);
      if (!match || fields[match[1].toLowerCase()]) {
        throw new Error(`Acceptance criterion ${index + 1} in "${flow.title}" must use a title and one Given, When and Then line.`);
      }
      fields[match[1].toLowerCase()] = match[2].trim();
    }
    if (!title || !fields.given || !fields.when || !fields.then) {
      throw new Error(`Acceptance criterion ${index + 1} in "${flow.title}" is incomplete; edit the Given, When and Then lines before generating tests.`);
    }
    return { title, ...fields };
  });
  if (!criteria.length || criteria.length > 6) throw new Error(`"${flow.title}" must have between one and six acceptance criteria.`);
  return { ...flow, criteria, criteriaText: formatCriteria(criteria) };
}

function criterionSource(flow, criterion) {
  if (criterion.expectationSource === 'project-requirement' && criterion.sourceReference) {
    return { kind: 'project-requirement', reference: criterion.sourceReference };
  }
  return { kind: flow.approvalBasis === 'observed-transition-only' ? 'observation-only' : 'inferred-from-observation', reference: null };
}

function matchStep(when, steps) {
  if (/\breload|refresh|recarreg/i.test(when)) return steps.findIndex(step => step.action?.kind === 'reload');
  const kind = /\bclick(?:s|ed)?\b/i.test(when) ? 'click'
    : /\bselect(?:s|ed)?\b/i.test(when) ? 'select'
    : /\bpress(?:es|ed)?\b/i.test(when) ? 'press'
    : /\b(?:fill(?:s|ed)?|enter(?:s|ed)?|typ(?:es|ed))\b/i.test(when) ? 'fill' : null;
  const words = String(when).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [];
  const ignored = new Set(['the', 'user', 'clicks', 'click', 'button', 'field', 'value', 'selects', 'enters', 'types', 'and', 'then', 'page', 'app', 'observes', 'interface']);
  const terms = words.filter(word => !ignored.has(word));
  const matches = steps.map((step, index) => {
    const action = step.action || {};
    if (kind && action.kind !== kind) return { index, score: 0 };
    const label = [action.name, action.domId, action.testId, action.label, action.placeholder, action.accessibleName].join(' ').toLowerCase();
    const score = terms.filter(term => label.includes(term)).length;
    return { index, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  if (matches.length) return matches[0].index;
  return -1;
}

function matchingInput(action, inputs) {
  const exact = (left, right) => left && right && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
  const byId = inputs.filter(input => exact(action.domId, input.domId || input.id));
  if (action.domId && byId.length) return byId.length === 1 ? byId[0] : null;
  const matches = inputs.filter(input => exact(action.label, input.label)
    || exact(action.placeholder, input.placeholder) || exact(action.nameAttribute, input.name)
    || exact(action.name, input.label));
  return matches.length === 1 ? matches[0] : null;
}

function buildAcceptanceContract(flow, steps, states) {
  return (flow.criteria || []).map((criterion, index) => {
    const id = `${flow.id || 'flow'}-criterion-${index + 1}`;
    const source = criterionSource(flow, criterion);
    const stepIndex = matchStep(criterion.when, steps);
    const item = {
      id, title: criterion.title, given: criterion.given, when: criterion.when, then: criterion.then,
      expectationSource: source, actionStep: stepIndex < 0 ? null : steps[stepIndex].step ?? stepIndex + 1,
      observedEntity: null, expectedValue: null, comparison: null, evidenceStateIds: flow.evidenceStateIds || [],
      status: 'unverified', assertionId: null, assertion: null,
      reason: 'No supported behavior assertion can be grounded in this executed journey.',
    };
    if (stepIndex < 0) return item;
    const action = steps[stepIndex].action || {};
    const outcome = criterion.then;
    const afterState = states.find(state => (steps[stepIndex].afterStateId && state.id === steps[stepIndex].afterStateId)
      || (steps[stepIndex].afterFingerprint && state.fingerprint === steps[stepIndex].afterFingerprint));
    if (!afterState) return { ...item, reason: 'The result state of the matched action is unavailable.' };
    const visible = String(afterState.visibleTextExcerpt || '');
    const quoted = [...outcome.matchAll(/[\u0027\u2018\u2019\u0022]([^\u0027\u2018\u2019\u0022]{1,100})[\u0027\u2018\u2019\u0022]/g)].map(match => match[1]);
    // Approved literals define the oracle even when the observed application disagrees.
    const expectedText = quoted.length === 1 ? quoted[0] : null;
    let assertion = null;
    if (action.kind === 'reload' && /persist|remain|still|after reload|after refresh/i.test(outcome)) {
      const priorFills = steps.slice(0, stepIndex).filter(step => step.action?.kind === 'fill' && step.action.value);
      const description = [...priorFills].reverse().find(step => step.action.inputType !== 'number' && visible.includes(step.action.value))?.action.value;
      const amount = [...priorFills].reverse().find(step => step.action.inputType === 'number' && visible.includes(step.action.value))?.action.value;
      if (description && amount) assertion = { kind: 'entity-persisted', value: { description, amount },
        observedEntity: 'visible list item or row', comparison: 'same-item-description-and-amount' };
    } else if (['fill', 'select'].includes(action.kind) && /value|contain|filled|selected|entered/i.test(outcome)) {
      const detail = matchingInput(action, afterState.inputDetails || []);
      const numericLiteral = /\b(?:value|equals?)\s+(?:should\s+be\s+|must\s+be\s+|is\s+|of\s+|be\s+)?(-?\d+(?:\.\d+)?)\b/i.exec(outcome)?.[1];
      const expectedValue = expectedText ?? numericLiteral
        ?? (/\b(?:entered|selected|typed|provided)\s+(?:value|text|option)\b/i.test(outcome) ? String(action.value) : null);
      if (detail && expectedValue !== null) assertion = { kind: 'input-value', value: expectedValue,
        observedEntity: action.domId || action.name, comparison: 'exact-input-value' };
    } else if (action.kind === 'click' && /\b(close|closed|hidden|dismiss)/i.test(outcome) && /panel|dialog|modal|overlay/i.test(outcome)) {
      assertion = { kind: 'panel-closed', value: 'hidden', observedEntity: 'visible dialog/panel', comparison: 'count-zero' };
    } else if (expectedText && /\b(change|changes|changed|becomes|shows|displays|appears|visible|updated|created|added|track|song|title)/i.test(outcome)) {
      assertion = { kind: 'visible-text', value: expectedText, observedEntity: 'visible text', comparison: 'exact-visible-text' };
    } else if (['click', 'press'].includes(action.kind) && /\b(created|added|appears|listed)/i.test(outcome)) {
      const priorFill = [...steps.slice(0, stepIndex)].reverse().find(step => step.action?.kind === 'fill' && step.action.value);
      const value = priorFill?.action?.value;
      if (value && visible.includes(value)) assertion = { kind: 'entity-created', value, observedEntity: 'visible text', comparison: 'exact-visible-text' };
    }
    if (assertion) Object.assign(item, { status: 'asserted', assertionId: `${id}-assertion-1`, assertion, observedEntity: assertion.observedEntity, expectedValue: assertion.value, comparison: assertion.comparison, reason: null, stepIndex });
    return item;
  });
}

module.exports = { buildAcceptanceContract, formatCriteria, normalizeApprovedFlow };
