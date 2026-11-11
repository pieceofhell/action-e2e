const reference = { 'directory-lookup': ['display-match'] };

async function readDomain(page) {
  return { input: await page.locator('#keyword').inputValue(), result: await page.locator('#result').textContent() };
}

function judgeEffects(target, steps, observations) {
  if (target !== 'directory-lookup' || observations[0].result) return [];
  const match = steps.find(step => step.status === 'completed' && step.action.kind === 'press'
    && observations[step.step]?.result === `Found: ${observations[0].input}`);
  if (!match) return [];
  return [{ id: 'display-match', step: match.step, beforeStateId: match.beforeStateId, afterStateId: match.afterStateId,
    checks: [{ kind: 'text', selector: '#result', value: `Found: ${observations[0].input}` }] }];
}

module.exports = { reference, readDomain, judgeEffects };
