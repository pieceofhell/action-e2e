const fs = require("fs/promises");
const path = require("path");
const { generateTestBundle } = require("../src/services/test-generator");
const { runGeneratedTests } = require("../src/services/test-runner");

const prototypeRoot = path.resolve(__dirname, "..");
const resultPath = path.resolve(process.argv[2] || path.join(prototypeRoot, "evaluation-results", "qwen3-8b.json"));

async function main() {
  const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
  const previousRun = result.stages?.generation?.runDirectory;
  if (!previousRun) throw new Error("The evaluation result does not reference a generated run.");

  const [inspection, approvedFlows, runtimeConfig] = await Promise.all([
    readJson(path.join(previousRun, "inspection.json")),
    readJson(path.join(previousRun, "approved-flows.json")),
    readJson(path.join(previousRun, "runtime-config.json")),
  ]);
  const aiConfig = {
    provider: "ollama",
    endpoint: "http://127.0.0.1:11434",
    model: result.model,
  };
  const generated = await generateTestBundle({
    prototypeRoot,
    projectPath: inspection.project.path,
    inspection,
    approvedFlows,
    runtimeConfig,
    aiConfig,
    authConfig: { mode: "guest" },
  });
  result.stages.generation = {
    runId: generated.runId,
    runDirectory: generated.runDirectory,
    testCount: generated.generatedTests.length,
    modes: generated.generatedTests.map((test) => ({
      title: test.title,
      generationMode: test.generationMode,
      generationNote: test.generationNote,
    })),
    modelAuthoredCount: generated.generatedTests.filter((test) => test.generationMode === "model-assisted").length,
    modelJourneyCompiledCount: generated.generatedTests.filter((test) => test.generationMode === "model-journey-compiled").length,
    fallbackCount: generated.generatedTests.filter((test) => !["model-assisted", "model-journey-compiled"].includes(test.generationMode)).length,
  };

  const execution = await runGeneratedTests({
    prototypeRoot,
    runDirectory: generated.runDirectory,
    resultsDirectory: generated.resultsDirectory,
    targetProjectPath: inspection.project.path,
    runtimeConfig: generated.runtimeConfig,
    authConfig: { mode: "guest" },
  });
  result.stages.execution = {
    summary: execution.report.summary,
    tests: execution.report.tests.map((test) => ({
      title: test.title,
      status: test.status,
      durationMs: test.durationMs,
      error: test.error || "",
      evidence: test.evidence || [],
    })),
    reportPath: execution.reportPath,
  };
  result.status = execution.report.summary.failed > 0 ? "completed-with-test-failures" : "completed";
  result.replayedGenerationAt = new Date().toISOString();
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
