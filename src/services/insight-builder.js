function buildInsights({ inspection, approvedFlows, report, runtime, auth, policy }) {
  const total = report?.summary?.total ?? approvedFlows.length;
  const passed = report?.summary?.passed ?? 0;
  const failed = report?.summary?.failed ?? 0;
  const skipped = report?.summary?.skipped ?? 0;

  const insights = [];
  const limitations = [...(inspection.warnings || [])];
  const nextSteps = [];

  insights.push(`${approvedFlows.length} flow(s) were approved for automated test generation.`);
  insights.push(`The execution consolidated ${total} test(s), with ${passed} passed, ${failed} failed, and ${skipped} skipped.`);

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
  if (qaCoverage?.summary) {
    const percentage = Math.round((qaCoverage.summary.ratio || 0) * 100);
    insights.push(`Risk-guided exploration covered ${qaCoverage.summary.covered}/${qaCoverage.summary.total} QA goal(s), with a weighted coverage score of ${percentage}%.`);
    if (qaCoverage.summary.highPriorityUncovered > 0) {
      limitations.push(`${qaCoverage.summary.highPriorityUncovered} high-priority QA goal(s) remained uncovered: ${qaCoverage.summary.uncoveredGoalIds.join(", ")}.`);
      nextSteps.push("Review uncovered high-priority exploration goals before interpreting the generated test result as representative of product health.");
    }
  }

  if (failed > 0) {
    insights.push("Failures should be analyzed together with the confidence level of the approved flows, because some issues may reflect project ambiguity rather than strictly functional defects.");
    nextSteps.push("Review the failed flows and decide whether the issue lies in pipeline inference, execution setup, or the actual application behavior.");
  } else {
    insights.push("In this run, the model-authored tests traversed the approved paths without a fatal failure. This result characterizes those paths only; it is not a product-wide health verdict.");
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
  };
}

module.exports = {
  buildInsights,
};
