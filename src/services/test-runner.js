const path = require("path");
const { readJson, writeText } = require("./artifact-store");
const { buildRestrictedChildEnvironment, normalizeAuthConfig } = require("./auth-config");
const { runAuthenticatedActionPlans } = require("./authenticated-executor");
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
  authConfig,
  actionPlans,
  onProgress = () => {},
}) {
  onProgress({ phase: "run-validation", message: "Validating generated artifacts and execution boundaries...", progress: 6 });
  validateRunPaths({ prototypeRoot, runDirectory, resultsDirectory });
  const normalizedAuth = normalizeAuthConfig(authConfig);

  if (normalizedAuth.mode === "authenticated") {
    return runAuthenticatedActionPlans({
      runDirectory,
      resultsDirectory,
      targetProjectPath,
      runtimeConfig,
      authConfig: normalizedAuth,
      actionPlans,
      onProgress,
    });
  }

  let runtimeHandle = null;

  try {
    onProgress({ phase: "dependency-check", message: runtimeConfig.runInstallBeforeExecution
      ? "Installing target dependencies before execution..."
      : "Using the target project's existing dependencies...", progress: 14 });
    await maybeInstallTargetProject({
      targetProjectPath,
      runtimeConfig,
    });

    onProgress({ phase: "target-startup", message: "Starting the target application and waiting for a reachable URL...", progress: 26 });
    runtimeHandle = await startTargetRuntime({
      targetProjectPath,
      runtimeConfig,
    });

    onProgress({ phase: "playwright-run", message: "Target is online; Playwright is opening the generated user journeys...", progress: 48 });
    const playwrightExecution = await runPlaywrightCli({
      prototypeRoot,
      runDirectory,
      baseUrl: runtimeHandle.baseUrl,
      onProgress,
    });

    onProgress({ phase: "result-parsing", message: "Parsing test outcomes and indexing screenshots, videos, and traces...", progress: 76 });
    const reportPath = path.join(resultsDirectory, "playwright-results.json");
    const report = await readJson(reportPath).catch(() => null);
    const parsedReport = parsePlaywrightReport(report, { runDirectory });

    await writeText(path.join(resultsDirectory, "stdout.log"), playwrightExecution.stdout);
    await writeText(path.join(resultsDirectory, "stderr.log"), playwrightExecution.stderr);
    await writeText(
      path.join(resultsDirectory, "visual-evidence.json"),
      `${JSON.stringify(buildVisualEvidenceIndex(parsedReport), null, 2)}\n`
    );
    onProgress({ phase: "evidence-index", message: "Visual evidence and execution logs are ready for consolidation...", progress: 84 });

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

async function runPlaywrightCli({ prototypeRoot, runDirectory, baseUrl, onProgress = () => {} }) {
  const { spawn } = require("child_process");
  const executable = process.execPath;
  const cliScript = path.join(prototypeRoot, "node_modules", "playwright", "cli.js");
  const args = [cliScript, "test", "--config", path.join(runDirectory, "playwright.config.cjs")];
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: prototypeRoot,
      env: buildRestrictedChildEnvironment({
        TARGET_BASE_URL: baseUrl,
      }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let reportedBrowserActivity = false;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (!reportedBrowserActivity) {
        reportedBrowserActivity = true;
        onProgress({ phase: "browser-actions", message: "The browser is executing the generated interactions and assertions...", progress: 58 });
      }
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

function parsePlaywrightReport(report, { runDirectory } = {}) {
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
    collectSuiteTests(suite, tests, { runDirectory });
  }

  const summary = {
    total: tests.length,
    passed: tests.filter((test) => test.status === "passed").length,
    failed: tests.filter((test) => !["passed", "skipped"].includes(test.status)).length,
    skipped: tests.filter((test) => test.status === "skipped").length,
    durationMs: report.stats?.duration || 0,
  };

  return {
    summary,
    tests,
    visualEvidence: buildVisualEvidenceIndex({ tests }),
  };
}

function collectSuiteTests(suite, collector, context) {
  for (const childSuite of suite.suites || []) {
    collectSuiteTests(childSuite, collector, context);
  }

  for (const spec of suite.specs || []) {
    const allResults = spec.tests?.flatMap((test) => test.results || []) || [];
    const lastResult = allResults[allResults.length - 1] || {};
    collector.push({
      title: spec.title,
      file: spec.file || "",
      status: lastResult.status || "unknown",
      durationMs: lastResult.duration || 0,
      error: extractResultError(lastResult),
      evidence: normalizeAttachments(lastResult.attachments, context.runDirectory),
    });
  }
}

function extractResultError(result) {
  if (result?.error?.message) return result.error.message;
  const messages = (result?.errors || [])
    .map((error) => error?.message || error?.value || "")
    .filter(Boolean);
  return messages.length ? messages.join("\n\n") : null;
}

function normalizeAttachments(attachments, runDirectory) {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((attachment) => {
      const absolutePath = String(attachment?.path || "");
      const relativePath = toSafeRelativePath(absolutePath, runDirectory);
      if (!relativePath) return null;

      const kind = classifyEvidence(attachment);
      return {
        name: String(attachment?.name || kind),
        kind,
        contentType: String(attachment?.contentType || ""),
        relativePath,
      };
    })
    .filter(Boolean);
}

function toSafeRelativePath(absolutePath, runDirectory) {
  if (!absolutePath || !runDirectory) return "";
  const relativePath = path.relative(runDirectory, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return "";
  return relativePath.split(path.sep).join("/");
}

function classifyEvidence(attachment) {
  const contentType = String(attachment?.contentType || "").toLowerCase();
  const name = String(attachment?.name || "").toLowerCase();
  if (contentType.startsWith("image/") || /screenshot/.test(name)) return "screenshot";
  if (contentType.startsWith("video/") || /video/.test(name)) return "video";
  if (/trace/.test(name) || /zip/.test(contentType)) return "trace";
  return "attachment";
}

function buildVisualEvidenceIndex(report) {
  return (report.tests || []).map((test) => ({
    title: test.title,
    status: test.status,
    evidence: test.evidence || [],
  }));
}

function validateRunPaths({ prototypeRoot, runDirectory, resultsDirectory }) {
  const runsRoot = path.resolve(prototypeRoot, "prototype-runs");
  const resolvedRun = path.resolve(runDirectory);
  const resolvedResults = path.resolve(resultsDirectory);
  const runRelative = path.relative(runsRoot, resolvedRun);
  const resultsRelative = path.relative(resolvedRun, resolvedResults);

  if (!runRelative || runRelative.startsWith("..") || path.isAbsolute(runRelative)) {
    throw new Error("The generated run directory must be a child of the prototype-runs directory.");
  }

  if (resultsRelative !== "results") {
    throw new Error("The generated results directory must be the run's dedicated results directory.");
  }
}

module.exports = {
  buildVisualEvidenceIndex,
  parsePlaywrightReport,
  runGeneratedTests,
  validateRunPaths,
};
