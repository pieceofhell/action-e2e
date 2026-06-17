function buildInsights({ inspection, approvedFlows, report, runtime }) {
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
    insights.push(`Semantic interpretation was carried out with ${inspection.ai.label}, always grounded in local heuristic project reading.`);
  }

  if (runtime?.mode === "static") {
    insights.push("The target project was served by an internal static server, which reduced coupling between the prototype and the inspected repository.");
  }

  if (runtime?.mode === "command") {
    insights.push(`The target application was started through the command "${runtime.startCommand}", respecting the user-configured base URL.`);
  }

  if (failed > 0) {
    insights.push("Failures should be analyzed together with the confidence level of the approved flows, because some issues may reflect project ambiguity rather than strictly functional defects.");
    nextSteps.push("Review the failed flows and decide whether the issue lies in pipeline inference, execution setup, or the actual application behavior.");
  } else {
    insights.push("In this run, the generated smoke tests traversed the approved paths without a fatal failure, which suggests initial pipeline viability for the current scope.");
    nextSteps.push("Gradually increase the depth of the acceptance criteria, moving from smoke tests toward more semantic and domain-specific checks.");
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
