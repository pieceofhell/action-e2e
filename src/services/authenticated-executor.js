const path = require("path");
const { chromium } = require("playwright");
const {
  beginArtifactQuarantine,
  releaseArtifactQuarantine,
  removeSecretBearingFiles,
  scanDirectoryForSecrets,
  writeJson,
  writeText,
} = require("./artifact-store");
const { redactSecrets, toPublicAuthMetadata } = require("./auth-config");
const { createAuthenticatedSession } = require("./auth-session");
const { validateAuthenticatedActionPlan } = require("./read-only-policy");
const { maybeInstallTargetProject, startTargetRuntime } = require("./runtime-orchestrator");

async function runAuthenticatedActionPlans({
  runDirectory,
  resultsDirectory,
  targetProjectPath,
  runtimeConfig,
  authConfig,
  actionPlans,
  onProgress = () => {},
}) {
  let runtimeHandle = null;
  let browser = null;
  let session = null;
  const startedAt = Date.now();

  onProgress({ phase: "artifact-quarantine", message: "Quarantining authenticated artifacts until secret validation passes...", progress: 10 });
  await beginArtifactQuarantine(runDirectory);

  try {
    onProgress({ phase: "dependency-check", message: runtimeConfig.runInstallBeforeExecution
      ? "Installing target dependencies before authenticated execution..."
      : "Using the target project's existing dependencies...", progress: 16 });
    await maybeInstallTargetProject({ targetProjectPath, runtimeConfig });
    onProgress({ phase: "target-startup", message: "Starting the target application for read-only authenticated testing...", progress: 26 });
    runtimeHandle = await startTargetRuntime({ targetProjectPath, runtimeConfig });
    onProgress({ phase: "browser-startup", message: "Opening an isolated browser and preparing the secure session...", progress: 40 });
    browser = await chromium.launch({ headless: true });
    session = await createAuthenticatedSession({
      browser,
      baseUrl: runtimeHandle.baseUrl,
      authConfig,
    });

    const metadata = toPublicAuthMetadata(session.config);
    const validatedPlans = (actionPlans || []).map((plan) => validateAuthenticatedActionPlan(plan, metadata));
    const tests = [];

    for (const [index, plan] of validatedPlans.entries()) {
      onProgress({
        phase: "read-only-flow",
        message: `Executing authenticated read-only flow ${index + 1} of ${validatedPlans.length}: ${plan.title}`,
        progress: 50 + Math.round((index / Math.max(validatedPlans.length, 1)) * 22),
      });
      tests.push(await executePlan({
        plan,
        session,
        runDirectory,
        resultsDirectory,
      }));
    }

    onProgress({ phase: "authenticated-report", message: "Building the authenticated result and policy report...", progress: 75 });
    const report = buildReport(tests, Date.now() - startedAt);
    const policy = session.policy.getSummary();
    const auth = {
      ...metadata,
      status: tests.some((test) => test.status === "passed") ? "verified" : "failed",
    };

    await writeJson(path.join(resultsDirectory, "playwright-results.json"), report);
    await writeJson(path.join(resultsDirectory, "visual-evidence.json"), buildVisualEvidenceIndex(report));
    await writeJson(path.join(resultsDirectory, "auth-execution.json"), {
      auth,
      policy,
      secretScan: { status: "pending" },
    });
    await writeText(
      path.join(resultsDirectory, "stdout.log"),
      `Trusted authenticated executor completed ${tests.length} read-only flow(s).\n`
    );
    await writeText(path.join(resultsDirectory, "stderr.log"), "");

    onProgress({ phase: "secret-scan", message: "Scanning artifacts for accidental credential exposure before release...", progress: 82 });
    const secretScan = await scanDirectoryForSecrets(runDirectory, session.secretValues);
    if (!secretScan.safe) {
      await removeSecretBearingFiles(runDirectory, secretScan.matches);
      throw new Error("Authenticated artifact validation found credential material. Affected files were removed and the run remains quarantined.");
    }

    await writeJson(path.join(resultsDirectory, "auth-execution.json"), {
      auth,
      policy,
      secretScan: {
        status: "passed",
        scannedFiles: secretScan.scannedFiles,
      },
    });
    await releaseArtifactQuarantine(runDirectory);
    onProgress({ phase: "artifact-release", message: "Secret validation passed; safe visual evidence is available...", progress: 86 });

    return {
      runtime: {
        mode: runtimeHandle.mode,
        baseUrl: runtimeHandle.baseUrl,
        startCommand: runtimeHandle.startCommand || "",
      },
      execution: {
        exitCode: report.summary.failed > 0 ? 1 : 0,
        durationMs: report.summary.durationMs,
        stdout: "Trusted authenticated executor completed without exposing captured output.",
        stderr: "",
      },
      report,
      reportPath: path.join(resultsDirectory, "playwright-results.json"),
      auth,
      policy,
      secretScan: {
        status: "passed",
        scannedFiles: secretScan.scannedFiles,
      },
    };
  } catch (error) {
    const secretValues = session?.secretValues || [];
    throw new Error(redactSecrets(error?.message || error, secretValues));
  } finally {
    if (session) {
      await session.dispose().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (runtimeHandle?.stop) {
      await runtimeHandle.stop().catch(() => {});
    }
  }
}

async function executePlan({ plan, session, runDirectory, resultsDirectory }) {
  const startedAt = Date.now();
  const page = await session.context.newPage();
  const evidence = [];
  let status = "passed";
  let error = null;
  let sessionVerified = false;

  try {
    for (const action of plan.actions) {
      if (action.type === "navigate") {
        await page.goto(action.path, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(350);
        if (!sessionVerified) {
          await session.verifyPage(page);
          sessionVerified = true;
        }
      } else if (action.type === "assert-body") {
        await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
      } else if (action.type === "assert-heading") {
        await page.getByRole("heading", { name: new RegExp(escapeRegExp(action.text), "i") }).first()
          .waitFor({ state: "visible", timeout: 15000 });
      } else if (action.type === "assert-text") {
        await page.getByText(action.text, { exact: false }).first()
          .waitFor({ state: "visible", timeout: 15000 });
      } else if (action.type === "assert-url") {
        const actual = new URL(page.url()).pathname;
        if (actual !== action.path) {
          throw new Error(`Expected read-only path ${action.path}, but the application reached ${actual}.`);
        }
      } else if (action.type === "capture") {
        evidence.push(await captureScreenshot({
          page,
          plan,
          runDirectory,
          resultsDirectory,
          suffix: action.name || "evidence",
          secretValues: session.secretValues,
        }));
      }
    }

    if (!evidence.length) {
      evidence.push(await captureScreenshot({
        page,
        plan,
        runDirectory,
        resultsDirectory,
        suffix: "final",
        secretValues: session.secretValues,
      }));
    }
  } catch (executionError) {
    status = "failed";
    error = redactSecrets(executionError?.message || executionError, session.secretValues);
    if (page.url() && page.url() !== "about:blank") {
      try {
        evidence.push(await captureScreenshot({
          page,
          plan,
          runDirectory,
          resultsDirectory,
          suffix: "failure",
          secretValues: session.secretValues,
        }));
      } catch {}
    }
  } finally {
    await page.close().catch(() => {});
  }

  return {
    title: plan.title,
    file: `${plan.id}.actions.json`,
    status,
    durationMs: Date.now() - startedAt,
    error,
    evidence,
  };
}

async function captureScreenshot({ page, plan, runDirectory, resultsDirectory, suffix, secretValues }) {
  await assertPageDoesNotExposeSecrets(page, secretValues);
  const fileName = `${sanitizeFileName(plan.id)}-${sanitizeFileName(suffix)}.png`;
  const absolutePath = path.join(resultsDirectory, "test-artifacts", fileName);
  await require("fs/promises").mkdir(path.dirname(absolutePath), { recursive: true });
  await page.screenshot({ path: absolutePath, fullPage: true });

  return {
    name: `screenshot-${suffix}`,
    kind: "screenshot",
    contentType: "image/png",
    relativePath: path.relative(runDirectory, absolutePath).split(path.sep).join("/"),
  };
}

async function assertPageDoesNotExposeSecrets(page, secretValues) {
  const secrets = (secretValues || []).map((value) => String(value || "")).filter(Boolean);
  if (!secrets.length) return;

  const visibleText = await page.locator("body").innerText().catch(() => "");
  const visibleFieldValues = await page.locator("input, textarea, select").evaluateAll((elements) => (
    elements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const inputType = String(element.type || "").toLowerCase();
        return style.display !== "none"
          && style.visibility !== "hidden"
          && bounds.width > 0
          && bounds.height > 0
          && inputType !== "password"
          && inputType !== "hidden";
      })
      .map((element) => String(element.value || ""))
  ));
  const observableValues = [page.url(), visibleText, ...visibleFieldValues];

  if (secrets.some((secret) => observableValues.some((value) => value.includes(secret)))) {
    throw new Error("Visual evidence capture was suppressed because the rendered page contains credential material.");
  }
}

function buildReport(tests, durationMs) {
  return {
    summary: {
      total: tests.length,
      passed: tests.filter((test) => test.status === "passed").length,
      failed: tests.filter((test) => test.status === "failed").length,
      skipped: 0,
      durationMs,
    },
    tests,
    visualEvidence: buildVisualEvidenceIndex({ tests }),
  };
}

function buildVisualEvidenceIndex(report) {
  return (report.tests || []).map((test) => ({
    title: test.title,
    status: test.status,
    evidence: test.evidence || [],
  }));
}

function sanitizeFileName(value) {
  return String(value || "flow").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  runAuthenticatedActionPlans,
};
