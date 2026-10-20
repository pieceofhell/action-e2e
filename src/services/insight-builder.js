const { evaluateQaCoverage } = require('./qa-coverage');

function buildInsights({ inspection, approvedFlows, report, runtime, auth, policy, generatedTests = [] }) {
  const total = report?.summary?.total ?? 0;
  const passed = report?.summary?.passed ?? 0;
  const failed = report?.summary?.failed ?? 0;
  const skipped = report?.summary?.skipped ?? 0;

  const insights = [];
  const limitations = [...(inspection.warnings || [])];
  const nextSteps = [];

  insights.push(`${approvedFlows.length} flow(s) were approved for automated test generation.`);
  insights.push(`The execution consolidated ${total} recorded test(s), with ${passed} passed, ${failed} failed, and ${skipped} skipped.`);
  if (report?.summary?.result) {
    insights.push(`Execution result: ${report.summary.result}; operational state: ${report.summary.executionState}.`);
  }

  if (inspection.ai?.label) {
    insights.push(`Semantic interpretation was carried out with ${inspection.ai.label}, grounded in collected project evidence and the recorded live-interface journey.`);
  }

  if (runtime?.mode === "static") {
    insights.push("The target project was served by an internal static server, which reduced coupling between the prototype and the inspected repository.");
  }

  if (runtime?.mode === "command") {
    insights.push(`The target application was started through the command "${runtime.startCommand}", respecting the user-configured base URL.`);
  }

  if (auth?.mode === "authenticated") {
    insights.push(`The run used the ${auth.adapter} adapter in authenticated read-only mode, and the isolated session finished with status ${auth.status}.`);
    insights.push(`The network policy blocked ${policy?.blockedRequestCount || 0} request(s) before they could leave the browser.`);
    limitations.push("Authenticated evidence intentionally excludes traces, videos, request payloads, cookies, and headers to prevent credential disclosure.");
  }

  const qaCoverage = inspection.liveExploration?.agenticExploration?.qaCoverage;
  const criterionContracts = generatedTests.flatMap(test => (test.criterionContract || []).map(item => ({ ...item, testTitle: test.title })));
  const passedTitles = new Set((report?.tests || []).filter(test => test.status === 'passed').map(test => test.title));
  const verifiedCriteria = criterionContracts.filter(item => item.status === 'asserted' && passedTitles.has(item.testTitle));
  const unverifiedCriteria = criterionContracts.filter(item => item.status !== 'asserted');
  if (criterionContracts.length) {
    insights.push(`${verifiedCriteria.length}/${criterionContracts.length} acceptance criterion/criteria had a generated assertion in a passing test; ${unverifiedCriteria.length} had no supported assertion. This is syntactic traceability, not independent semantic validation.`);
    if (unverifiedCriteria.length) limitations.push(`Unverified acceptance criteria: ${unverifiedCriteria.map(item => item.id).join(', ')}.`);
  }
  const goalVerifications = verifiedCriteria.flatMap(item => {
    const goalId = item.assertion?.kind === 'entity-persisted' ? 'persistence-reload'
      : item.assertion?.kind === 'panel-closed' ? 'overlay-lifecycle' : null;
    return goalId ? [{ goalId, criterionId: item.id, assertionId: item.assertionId,
      testTitle: item.testTitle, status: 'passed' }] : [];
  });
  const evaluatedQaCoverage = qaCoverage ? evaluateQaCoverage({ version: qaCoverage.version, goals: qaCoverage.goals }, {
    steps: inspection.liveExploration?.agenticExploration?.steps || [],
    states: inspection.liveExploration?.agenticExploration?.states || [],
    verifications: goalVerifications,
  }) : null;
  if (qaCoverage?.summary) {
    const percentage = Number.isFinite(qaCoverage.summary.ratio)
      ? `${Math.round(qaCoverage.summary.ratio * 100)}%` : 'not measurable';
    insights.push(`Risk-guided exploration exercised ${qaCoverage.summary.covered}/${qaCoverage.summary.total} QA goal(s); weighted action coverage is ${percentage}, not verified functional coverage.`);
    if (qaCoverage.summary.highPriorityUncovered > 0) {
      limitations.push(`${qaCoverage.summary.highPriorityUncovered} high-priority QA goal(s) remained uncovered: ${qaCoverage.summary.uncoveredGoalIds.join(", ")}.`);
      nextSteps.push("Review uncovered high-priority exploration goals before interpreting the generated test result as representative of product health.");
    }
  }

  if (report?.summary?.executionState === 'incomplete' || report?.summary?.result === 'infrastructure-error') {
    limitations.push(`Execution evidence is incomplete: ${(report?.summary?.issues || []).join(' ') || 'the expected report was unavailable.'}`);
    nextSteps.push('Resolve the execution or reporting failure before interpreting test outcomes.');
  } else if (report?.summary?.result === 'no-verification' || total === 0) {
    limitations.push('No complete verification was recorded; zero failed tests is not a passing result.');
    nextSteps.push('Review skipped or ungenerated tests and create a verifiable journey.');
  } else if (failed > 0) {
    insights.push("Failures should be analyzed together with the confidence level of the approved flows, because some issues may reflect project ambiguity rather than strictly functional defects.");
    nextSteps.push("Review the failed flows and decide whether the issue lies in pipeline inference, execution setup, or the actual application behavior.");
  } else {
    insights.push("The model-authored tests passed on their selected paths. This result is not a product-wide health verdict or proof that every criterion was verified.");
    nextSteps.push("Gradually increase the depth of the model-authored acceptance criteria toward more semantic and domain-specific checks.");
  }

  if (inspection.detection.confidence === "low") {
    limitations.push("Automatic project understanding happened with low confidence; the results require stronger human validation.");
  }

  if (inspection.detection.appType === "generic-web") {
    limitations.push("The functional archetype is still generic, which limits the precision of automatically generated flows and oracles.");
  }

  nextSteps.push("Compare different models and providers to measure quality variation in flow writing, criteria generation, and insight synthesis.");
  nextSteps.push("Add extra instrumentation to map the real DOM structure at runtime and enrich selector generation.");

  return {
    overview: "Consolidated results from the experimental pipeline execution.",
    insights,
    limitations,
    nextSteps,
    criterionVerification: { total: criterionContracts.length, asserted: criterionContracts.filter(item => item.status === 'asserted').length,
      passed: verifiedCriteria.length, unverified: unverifiedCriteria.map(item => item.id), contracts: criterionContracts },
    qaCoverage: evaluatedQaCoverage,
  };
}

module.exports = {
  buildInsights,
};
