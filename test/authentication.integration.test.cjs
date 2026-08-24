const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { runAuthenticatedActionPlans } = require("../src/services/authenticated-executor");
const { scanDirectoryForSecrets } = require("../src/services/artifact-store");
const { generateTestBundle } = require("../src/services/test-generator");
const { runGeneratedTests } = require("../src/services/test-runner");

test("runs an authenticated read-only flow, captures evidence, and blocks mutation requests", { timeout: 120000 }, async (t) => {
  const app = express();
  let mutationRequests = 0;
  const secret = `canary-${crypto.randomUUID()}`;
  const secretReference = "E2P_AUTH_INTEGRATION_SECRET";
  process.env[secretReference] = secret;

  app.get("/private", (request, response) => {
    if (!String(request.headers.cookie || "").includes(`safe-session=${secret}`)) {
      response.status(401).send("Guest");
      return;
    }

    response.type("html").send(`<!doctype html>
      <html><body><main><h1>Authenticated workspace</h1><p>Read-only account overview</p></main>
      <script>fetch('/mutate', { method: 'POST' }).catch(() => {});</script></body></html>`);
  });
  app.post("/mutate", (request, response) => {
    mutationRequests += 1;
    response.json({ ok: true });
  });

  const server = await new Promise((resolve) => {
    const handle = app.listen(0, "127.0.0.1", () => resolve(handle));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const runDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "e2p-auth-run-"));
  const resultsDirectory = path.join(runDirectory, "results");
  await fs.mkdir(resultsDirectory, { recursive: true });

  t.after(async () => {
    delete process.env[secretReference];
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(runDirectory, { recursive: true, force: true });
  });

  const execution = await runAuthenticatedActionPlans({
    runDirectory,
    resultsDirectory,
    targetProjectPath: runDirectory,
    runtimeConfig: { mode: "external", baseUrl, workingDirectory: "." },
    authConfig: {
      mode: "authenticated",
      adapter: "cookie-session",
      profileId: "integration-read-only",
      secretEnvVar: secretReference,
      cookieName: "safe-session",
      initialPath: "/private",
      allowedPaths: ["/private"],
      successPath: "/private",
      successText: "Authenticated workspace",
    },
    actionPlans: [{
      id: "authenticated-workspace",
      title: "Authenticated workspace is readable",
      actions: [
        { type: "navigate", path: "/private" },
        { type: "assert-heading", text: "Authenticated workspace" },
        { type: "assert-text", text: "Read-only account overview" },
        { type: "capture", name: "verified" },
      ],
    }],
  });

  assert.equal(execution.report.summary.passed, 1);
  assert.equal(execution.auth.status, "verified");
  assert.equal(execution.policy.blockedRequestCount, 1);
  assert.equal(mutationRequests, 0);
  assert.equal(execution.secretScan.status, "passed");
  assert.equal(execution.report.tests[0].evidence[0].kind, "screenshot");
  assert.equal(execution.report.tests[0].evidence.some((item) => item.kind === "trace" || item.kind === "video"), false);

  const scan = await scanDirectoryForSecrets(runDirectory, [secret]);
  assert.equal(scan.safe, true);
});

test("suppresses authenticated screenshots when the rendered page exposes a credential", { timeout: 120000 }, async (t) => {
  const app = express();
  const secret = `visual-canary-${crypto.randomUUID()}`;
  const secretReference = "E2P_AUTH_VISUAL_CANARY";
  process.env[secretReference] = secret;

  app.get("/private", (_request, response) => {
    response.type("html").send(`<!doctype html><html><body><main><h1>Private view</h1><p>${secret}</p></main></body></html>`);
  });

  const server = await new Promise((resolve) => {
    const handle = app.listen(0, "127.0.0.1", () => resolve(handle));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const runDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "e2p-auth-visual-guard-"));
  const resultsDirectory = path.join(runDirectory, "results");
  await fs.mkdir(resultsDirectory, { recursive: true });

  t.after(async () => {
    delete process.env[secretReference];
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(runDirectory, { recursive: true, force: true });
  });

  const execution = await runAuthenticatedActionPlans({
    runDirectory,
    resultsDirectory,
    targetProjectPath: runDirectory,
    runtimeConfig: { mode: "external", baseUrl, workingDirectory: "." },
    authConfig: {
      mode: "authenticated",
      adapter: "cookie-session",
      profileId: "visual-guard",
      secretEnvVar: secretReference,
      cookieName: "safe-session",
      initialPath: "/private",
      allowedPaths: ["/private"],
    },
    actionPlans: [{
      id: "credential-rendering-guard",
      title: "Credential rendering guard",
      actions: [
        { type: "navigate", path: "/private" },
        { type: "assert-body" },
        { type: "capture", name: "must-not-persist" },
      ],
    }],
  });

  assert.equal(execution.report.summary.passed, 0);
  assert.equal(execution.report.summary.failed, 1);
  assert.equal(execution.report.tests[0].evidence.length, 0);
  assert.match(execution.report.tests[0].error, /capture was suppressed/i);
  assert.equal(execution.secretScan.status, "passed");

  const scan = await scanDirectoryForSecrets(runDirectory, [secret]);
  assert.equal(scan.safe, true);
});

test("keeps the explicitly enabled guest baseline path working", { timeout: 120000 }, async (t) => {
  const previousBaselineFlag = process.env.E2P_ENABLE_BASELINE_MODE;
  process.env.E2P_ENABLE_BASELINE_MODE = "1";
  const prototypeRoot = path.resolve(__dirname, "..");
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "e2p-guest-project-"));
  await fs.writeFile(
    path.join(projectDirectory, "index.html"),
    "<!doctype html><html><head><title>Guest fixture</title></head><body><main><h1>Guest home</h1></main></body></html>",
    "utf8"
  );

  let generated;
  t.after(async () => {
    if (previousBaselineFlag === undefined) delete process.env.E2P_ENABLE_BASELINE_MODE;
    else process.env.E2P_ENABLE_BASELINE_MODE = previousBaselineFlag;
    await fs.rm(projectDirectory, { recursive: true, force: true });
    if (generated?.runDirectory) {
      await fs.rm(generated.runDirectory, { recursive: true, force: true });
    }
  });

  const inspection = {
    project: { name: "guest-fixture", path: projectDirectory },
    projectSynopsis: "Temporary guest regression fixture.",
    detection: { framework: "Static HTML", primaryLanguage: "HTML", appType: "content-navigation", confidence: "high" },
    runtime: { mode: "static", baseUrl: "auto", workingDirectory: ".", startCommand: "", installCommand: "" },
    uiHints: { headings: [], buttons: [], links: [], inputs: [], canvases: [], statusElements: [] },
    warnings: [],
  };
  const approvedFlows = [{
    id: "guest-render",
    title: "Guest home renders",
    summary: "The public home remains visible.",
    confidence: "high",
    criteria: [],
    blueprint: { kind: "render" },
  }];

  generated = await generateTestBundle({
    prototypeRoot,
    projectPath: projectDirectory,
    inspection,
    approvedFlows,
    runtimeConfig: inspection.runtime,
    aiConfig: { provider: "heuristic" },
    authConfig: { mode: "guest" },
  });
  const execution = await runGeneratedTests({
    prototypeRoot,
    runDirectory: generated.runDirectory,
    resultsDirectory: generated.resultsDirectory,
    targetProjectPath: projectDirectory,
    runtimeConfig: generated.runtimeConfig,
    authConfig: { mode: "guest" },
  });

  assert.equal(generated.access.mode, "guest");
  assert.equal(execution.report.summary.passed, 1);
  assert.equal(execution.report.tests[0].evidence.some((item) => item.kind === "screenshot"), true);
});

test("fails a guest flow when the target displays a development runtime overlay", { timeout: 120000 }, async (t) => {
  const previousBaselineFlag = process.env.E2P_ENABLE_BASELINE_MODE;
  process.env.E2P_ENABLE_BASELINE_MODE = "1";
  const prototypeRoot = path.resolve(__dirname, "..");
  const projectDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "e2p-runtime-overlay-"));
  await fs.writeFile(
    path.join(projectDirectory, "index.html"),
    "<!doctype html><html><head><title>Broken fixture</title></head><body><main><h1>Rendered beneath an error</h1></main><vite-error-overlay>Runtime failed</vite-error-overlay></body></html>",
    "utf8"
  );

  let generated;
  t.after(async () => {
    if (previousBaselineFlag === undefined) delete process.env.E2P_ENABLE_BASELINE_MODE;
    else process.env.E2P_ENABLE_BASELINE_MODE = previousBaselineFlag;
    await fs.rm(projectDirectory, { recursive: true, force: true });
    if (generated?.runDirectory) {
      await fs.rm(generated.runDirectory, { recursive: true, force: true });
    }
  });

  const inspection = {
    project: { name: "runtime-overlay-fixture", path: projectDirectory },
    projectSynopsis: "Temporary runtime-overlay regression fixture.",
    detection: { framework: "Static HTML", primaryLanguage: "HTML", appType: "content-navigation", confidence: "high" },
    runtime: { mode: "static", baseUrl: "auto", workingDirectory: ".", startCommand: "", installCommand: "" },
    uiHints: { headings: [], buttons: [], links: [], inputs: [], canvases: [], statusElements: [] },
    warnings: [],
  };
  const approvedFlows = [{
    id: "runtime-overlay-guard",
    title: "Runtime overlay guard",
    summary: "A development error must fail the test even when the app shell is visible.",
    confidence: "high",
    criteria: [],
    blueprint: { kind: "render" },
  }];

  generated = await generateTestBundle({
    prototypeRoot,
    projectPath: projectDirectory,
    inspection,
    approvedFlows,
    runtimeConfig: inspection.runtime,
    aiConfig: { provider: "heuristic" },
    authConfig: { mode: "guest" },
  });
  const execution = await runGeneratedTests({
    prototypeRoot,
    runDirectory: generated.runDirectory,
    resultsDirectory: generated.resultsDirectory,
    targetProjectPath: projectDirectory,
    runtimeConfig: generated.runtimeConfig,
    authConfig: { mode: "guest" },
  });

  assert.equal(execution.report.summary.passed, 0);
  assert.equal(execution.report.summary.failed, 1);
  assert.match(execution.report.tests[0].error, /Expected:\s*(?:\u001b\[[0-9;]*m)*0/);
  assert.match(execution.report.tests[0].error, /Received:\s*(?:\u001b\[[0-9;]*m)*1/);
  assert.equal(execution.report.tests[0].evidence.some((item) => item.kind === "screenshot"), true);
});
