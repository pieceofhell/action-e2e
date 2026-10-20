// Batch runs cannot ask a person to refine low-confidence acceptance criteria.
// When ordinary approval has no candidates, retain only one transition that the
// browser actually executed and describe the observed outcome, not the model's
// speculative criteria. The original plan remains available in plan.json.
function selectBatchApprovedFlows(plan, liveExploration, access = {}) {
  const ordinary = (plan?.flows || []).filter((flow) => flow.confidence === 'high' || flow.confidence === 'medium');
  if (ordinary.length) {
    return { rule: 'medium-or-high confidence', flows: ordinary.map((flow) => approve(flow, 'model-criteria')) };
  }
  if (access.mode === 'authenticated') return { rule: 'medium-or-high confidence', flows: [] };

  const exploration = liveExploration?.agenticExploration;
  const states = exploration?.states || [];
  const steps = (exploration?.steps || []).filter((step) => step.status === 'completed');
  const citedIds = new Set((plan?.flows || []).flatMap((flow) => flow.evidenceStateIds || []));
  if (!citedIds.size) return { rule: 'observed-transition-only', flows: [] };

  for (const step of steps.slice(0, 4)) {
    const action = step.action || {};
    if (!step.changed || !['click', 'fill', 'select'].includes(action.kind)) continue;
    if (!action.name || action.name.length > 80 || /^Interactive\b/i.test(action.name)) continue;
    if (/\b(?:delete|remove|clear|reset|pay|purchase|submit|upload|logout|sign out)\b/i.test(action.name)) continue;
    const after = states.find((state) => state.id === step.afterStateId || state.fingerprint === step.afterFingerprint);
    const before = states.find((state) => state.id === step.beforeStateId || state.fingerprint === step.beforeFingerprint);
    if (!after || !before || !citedIds.has(after.id)) continue;
    if (!hasStableLocator(action)) continue;
    const observedOutcome = outcomeFromTransition(action, before, after);
    if (!observedOutcome) continue;
    const sourceFlow = (plan.flows || []).find((flow) => flow.evidenceStateIds?.includes(after.id));
    const flow = {
      id: `observed-transition-${step.step}`,
      title: `Observed interaction: ${action.name}`,
      summary: 'A limited smoke check of a browser transition completed during exploration.',
      confidence: 'low',
      assumptions: [],
      sourceSignals: [`Completed exploration action ${step.step}`, `Resulting state ${after.id}`],
      evidenceStateIds: [after.id],
      criteria: [{
        title: `Observed outcome of ${action.name}`,
        given: `the explored interface is open${before.headings?.[0] ? ` with ${before.headings[0]} visible` : ''}`,
        when: `${action.kind} ${action.name}`,
        then: observedOutcome.text,
      }],
      blueprint: { kind: 'model-observed-journey', evidenceStateIds: [after.id] },
      observedStepNumber: step.step,
      observationCheck: observedOutcome.check,
      approvalBasis: 'observed-transition-only',
      basedOnFlowId: sourceFlow?.id || null,
      limitations: ['Only the observed transition is asserted; low-confidence model criteria were not approved.'],
    };
    return { rule: 'observed-transition-only', flows: [approve(flow, 'observed-transition-only')] };
  }
  return { rule: 'observed-transition-only', flows: [] };
}

function approve(flow, basis) {
  return {
    ...flow,
    approved: true,
    approvalBasis: basis,
    criteriaText: (flow.criteria || []).map((item) => [
      item.title, `Given ${item.given}`, `When ${item.when}`, `Then ${item.then}`,
    ].join('\n')).join('\n\n'),
  };
}

function hasStableLocator(action) {
  if (action.testId || action.domId || action.placeholder || action.label || action.visualSelector) return true;
  if (action.nameAttribute && action.tagName) return true;
  if (action.tagName && Number.isInteger(action.tagIndex) && action.tagIndex >= 0) return true;
  return Boolean(action.accessibleName && (action.accessibleCount <= 1 || action.accessibleIndex >= 0));
}

function outcomeFromTransition(action, before, after) {
  if (action.kind === 'fill' || action.kind === 'select') {
    const value = String(action.value || '').trim();
    if (value && (after.inputDetails || []).some((input) => String(input.value || '').trim() === value)) {
      return { text: `the interacted field contains the observed value ${JSON.stringify(value.slice(0, 100))}`,
        check: { kind: 'input-value', value } };
    }
    // Reactive fields may immediately clear or change the value. A later heading
    // is not a safe substitute: games and remote results can be nondeterministic.
    return '';
  }
  for (const field of ['headings', 'buttons']) {
    const prior = new Set((before[field] || []).map((item) => String(item).trim()));
    const added = (after[field] || []).find((item) => {
      const label = String(item || '').trim();
      return label && label.length <= 100 && !prior.has(label);
    });
    if (added) return { text: `the observed ${field.slice(0, -1)} ${JSON.stringify(added)} is visible`,
      check: { kind: field === 'headings' ? 'heading' : 'button', value: String(added) } };
  }
  if (after.path && before.path !== after.path) {
    return { text: `the browser reaches the observed path ${JSON.stringify(after.path)}`,
      check: { kind: 'path', value: after.path } };
  }
  if ((after.dialogsCount || 0) > (before.dialogsCount || 0)) {
    return { text: 'the observed dialog is visible', check: { kind: 'dialog' } };
  }
  return null;
}

module.exports = { selectBatchApprovedFlows };
