const fs = require("fs/promises");
const path = require("path");
const { runGeneratedTests } = require("../src/services/test-runner");

const prototypeRoot = path.resolve(__dirname, "..");
const runDirectory = path.resolve(process.argv[2]);
const resultPath = path.resolve(process.argv[3] || path.join(prototypeRoot, "evaluation-results", "qwen3-8b.json"));

async function main() {
  if (!process.argv[2]) throw new Error("Provide a generated run directory.");
  const [result, inspection, runtimeConfig, generatedTests] = await Promise.all([
    readJson(resultPath),
    readJson(path.join(runDirectory, "inspection.json")),
    readJson(path.join(runDirectory, "runtime-config.json")),
    readJson(path.join(runDirectory, "generated-tests.json")),
  ]);
  const execution = await runGeneratedTests({
    prototypeRoot,
    runDirectory,
    resultsDirectory: path.join(runDirectory, "results"),
    targetProjectPath: inspection.project.path,
    runtimeConfig,
    authConfig: { mode: "guest" },
  });
  result.stages.generation = {
    runId: path.basename(runDirectory),
    runDirectory,
    testCount: generatedTests.length,
    modes: generatedTests.map((test) => ({
      title: test.title,
      generationMode: test.generationMode,
      generationNote: test.generationNote,
    })),
    modelAuthoredCount: generatedTests.filter((test) => test.generationMode === "model-assisted").length,
    modelJourneyCompiledCount: generatedTests.filter((test) => test.generationMode === "model-journey-compiled").length,
    fallbackCount: generatedTests.filter((test) => !["model-assisted", "model-journey-compiled"].includes(test.generationMode)).length,
  };
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
  result.reexecutedAt = new Date().toISOString();
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
