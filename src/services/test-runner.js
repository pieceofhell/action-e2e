const path = require("path");
const { readJson, writeText } = require("./artifact-store");
const {
  maybeInstallTargetProject,
  startTargetRuntime,
} = require("./runtime-orchestrator");

async function runGeneratedTests({
  prototypeRoot,
  runDirectory,
  resultsDirectory,
  targetProjectPath,
  runtimeConfig,
}) {
  let runtimeHandle = null;

  try {
    await maybeInstallTargetProject({
      targetProjectPath,
      runtimeConfig,
    });

    runtimeHandle = await startTargetRuntime({
      targetProjectPath,
      runtimeConfig,
    });

    const playwrightExecution = await runPlaywrightCli({
      prototypeRoot,
      runDirectory,
      baseUrl: runtimeHandle.baseUrl,
    });

    const reportPath = path.join(resultsDirectory, "playwright-results.json");
    const report = await readJson(reportPath).catch(() => null);
    const parsedReport = parsePlaywrightReport(report);

    await writeText(path.join(resultsDirectory, "stdout.log"), playwrightExecution.stdout);
    await writeText(path.join(resultsDirectory, "stderr.log"), playwrightExecution.stderr);

    return {
      runtime: {
        mode: runtimeHandle.mode,
        baseUrl: runtimeHandle.baseUrl,
        startCommand: runtimeHandle.startCommand || "",
      },
      execution: playwrightExecution,
      report: parsedReport,
      reportPath,
    };
  } finally {
    if (runtimeHandle?.stop) {
      await runtimeHandle.stop();
    }
  }
}

async function runPlaywrightCli({ prototypeRoot, runDirectory, baseUrl }) {
  const { spawn } = require("child_process");
  const executable = process.execPath;
  const cliScript = path.join(prototypeRoot, "node_modules", "playwright", "cli.js");
  const args = [cliScript, "test", "--config", path.join(runDirectory, "playwright.config.cjs")];
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: prototypeRoot,
      env: {
        ...process.env,
        TARGET_BASE_URL: baseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      resolve({
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

function parsePlaywrightReport(report) {
  if (!report) {
    return {
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
      },
      tests: [],
    };
  }

  const tests = [];

  for (const suite of report.suites || []) {
    collectSuiteTests(suite, tests);
  }

  const summary = {
    total: tests.length,
    passed: tests.filter((test) => test.status === "passed").length,
    failed: tests.filter((test) => test.status === "failed").length,
    skipped: tests.filter((test) => test.status === "skipped").length,
    durationMs: report.stats?.duration || 0,
  };

  return {
    summary,
    tests,
  };
}

function collectSuiteTests(suite, collector) {
  for (const childSuite of suite.suites || []) {
    collectSuiteTests(childSuite, collector);
  }

  for (const spec of suite.specs || []) {
    const allResults = spec.tests?.flatMap((test) => test.results || []) || [];
    const lastResult = allResults[allResults.length - 1] || {};
    collector.push({
      title: spec.title,
      file: spec.file || "",
      status: lastResult.status || "unknown",
      durationMs: lastResult.duration || 0,
      error: lastResult.error?.message || null,
    });
  }
}

module.exports = {
  runGeneratedTests,
};
