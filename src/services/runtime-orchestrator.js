const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");

function normalizeRuntimeConfig(defaultRuntime = {}, runtimeConfig = {}) {
  const merged = {
    mode: runtimeConfig?.mode || defaultRuntime.mode || "manual",
    installCommand: runtimeConfig?.installCommand ?? defaultRuntime.installCommand ?? "",
    startCommand: runtimeConfig?.startCommand ?? defaultRuntime.startCommand ?? "",
    baseUrl: runtimeConfig?.baseUrl ?? defaultRuntime.baseUrl ?? "",
    workingDirectory: runtimeConfig?.workingDirectory ?? defaultRuntime.workingDirectory ?? ".",
    runInstallBeforeExecution: Boolean(runtimeConfig?.runInstallBeforeExecution),
  };

  if (merged.mode === "static") {
    merged.baseUrl = "auto";
    merged.startCommand = "";
    merged.workingDirectory = ".";
  }

  return merged;
}

async function maybeInstallTargetProject({
  targetProjectPath,
  runtimeConfig,
  label = "Target project installation",
}) {
  const workingDirectory = resolveWorkingDirectory(targetProjectPath, runtimeConfig.workingDirectory);

  if (!runtimeConfig.runInstallBeforeExecution || !runtimeConfig.installCommand) {
    return null;
  }

  return runShellCommand(runtimeConfig.installCommand, {
    cwd: workingDirectory,
    label,
    timeoutMs: 240000,
  });
}

async function startTargetRuntime({ targetProjectPath, runtimeConfig }) {
  if (runtimeConfig.mode === "static") {
    return startStaticServer(targetProjectPath);
  }

  if (runtimeConfig.mode === "command") {
    if (!runtimeConfig.startCommand || !runtimeConfig.baseUrl) {
      throw new Error("Command mode requires a valid start command and base URL.");
    }

    return startCommandServer({
      cwd: resolveWorkingDirectory(targetProjectPath, runtimeConfig.workingDirectory),
      startCommand: runtimeConfig.startCommand,
      baseUrl: runtimeConfig.baseUrl,
    });
  }

  if (runtimeConfig.mode === "external") {
    if (!runtimeConfig.baseUrl) {
      throw new Error("External mode requires an explicit base URL.");
    }

    const reachableBaseUrl = await waitForUrl(runtimeConfig.baseUrl, 20000);
    return {
      mode: "external",
      baseUrl: reachableBaseUrl,
      startCommand: "",
      stop: async () => {},
    };
  }

  throw new Error("Could not start the target project with the provided configuration.");
}

function resolveWorkingDirectory(targetProjectPath, requestedDirectory) {
  const root = path.resolve(targetProjectPath);
  const candidate = path.resolve(root, requestedDirectory || ".");
  const relative = path.relative(root, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The suggested working directory must remain inside the selected project.");
  }

  return candidate;
}

async function startStaticServer(projectPath) {
  const app = express();
  const indexPath = path.join(projectPath, "index.html");
  const hasIndex = await fs.stat(indexPath).then(() => true).catch(() => false);

  app.use(express.static(projectPath));

  if (hasIndex) {
    app.get("*", (request, response, next) => {
      if (request.path.includes(".")) {
        next();
        return;
      }

      response.sendFile(indexPath);
    });
  }

  const server = await new Promise((resolve) => {
    const handle = app.listen(0, "127.0.0.1", () => resolve(handle));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    mode: "static",
    baseUrl,
    startCommand: "",
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function startCommandServer({ cwd, startCommand, baseUrl }) {
  const child = spawn(startCommand, {
    cwd,
    shell: true,
    env: buildTargetEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout = appendProcessOutput(stdout, chunk);
  });

  child.stderr.on("data", (chunk) => {
    stderr = appendProcessOutput(stderr, chunk);
  });

  child.on("error", (error) => {
    stderr += `\n${error.message}`;
  });

  try {
    // Modern dev servers can spend over a minute compiling on their first cold start.
    const reachableBaseUrl = await waitForUrl(baseUrl, 180000, {
      child,
      getProcessOutput: () => `${stdout}\n${stderr}`,
    });

    return {
      mode: "command",
      baseUrl: reachableBaseUrl,
      startCommand,
      stdout,
      stderr,
      stop: () => stopProcessTree(child, cwd),
    };
  } catch (error) {
    await stopProcessTree(child, cwd);
    throw error;
  }
}

async function stopProcessTree(child, cwd) {
  if (!child || child.exitCode !== null || !child.pid) return;

  if (process.platform === "win32") {
    await runShellCommand(`taskkill /pid ${child.pid} /T /F`, {
      cwd,
      label: "Stopping target project process",
      timeoutMs: 15000,
      tolerateFailure: true,
    });
    return;
  }

  child.kill("SIGTERM");
}

async function waitForUrl(baseUrl, timeoutMs, { child = null, getProcessOutput = null } = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(buildEarlyExitMessage(child.exitCode, getProcessOutput?.()));
    }

    const announcedUrls = extractAnnouncedLoopbackUrls(getProcessOutput?.());
    const candidates = [...new Set([
      ...announcedUrls,
      ...buildLoopbackUrlCandidates(baseUrl),
    ])];

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, { redirect: "manual" });
        if (response.status < 500) {
          return candidate;
        }
      } catch (error) {
        lastError = error;
      }
    }

    await delay(800);
  }

  const diagnostics = sanitizeProcessOutput(getProcessOutput?.());
  throw new Error([
    `The URL ${baseUrl} did not respond within the expected time.`,
    lastError ? `Last error: ${lastError.message}.` : "",
    diagnostics ? `Startup output: ${diagnostics}` : "",
  ].filter(Boolean).join(" "));
}

function buildLoopbackUrlCandidates(baseUrl) {
  let parsed;

  try {
    parsed = new URL(baseUrl);
  } catch {
    return [baseUrl];
  }

  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname)) {
    return [parsed.toString().replace(/\/$/, "")];
  }

  return ["localhost", "127.0.0.1", "[::1]"].map((hostname) => {
    const host = hostname === "[::1]" ? `[::1]${parsed.port ? `:${parsed.port}` : ""}` : `${hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    return `${parsed.protocol}//${host}${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
  });
}

function extractAnnouncedLoopbackUrls(output) {
  const normalized = stripAnsi(String(output || ""));
  const matches = normalized.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d{2,5}/gi) || [];
  return [...new Set(matches.map((value) => value.replace(/\/$/, "")))];
}

function buildEarlyExitMessage(exitCode, output) {
  const diagnostics = sanitizeProcessOutput(output);
  return [
    `The target start command exited before its URL became available (exit code ${exitCode ?? "unknown"}).`,
    diagnostics ? `Startup output: ${diagnostics}` : "",
  ].filter(Boolean).join(" ");
}

function appendProcessOutput(current, chunk) {
  return `${current}${chunk.toString()}`.slice(-12000);
}

function sanitizeProcessOutput(output) {
  return stripAnsi(String(output || ""))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/((?:api[_ -]?key|authorization|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-2400);
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

async function runShellCommand(command, { cwd, label, timeoutMs, tolerateFailure = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: buildTargetEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) {
        return;
      }

      finished = true;
      child.kill();
      reject(new Error(`${label} exceeded the time limit.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;

      if (code !== 0 && !tolerateFailure) {
        reject(new Error(label + " failed.\n" + (stderr || stdout)));
        return;
      }

      resolve({
        exitCode: code,
        stdout,
        stderr,
      });
    });
  });
}

function delay(timeout) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

function buildTargetEnvironment(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !key.toUpperCase().startsWith("E2P_AUTH_"))
  );
}

module.exports = {
  buildLoopbackUrlCandidates,
  buildTargetEnvironment,
  extractAnnouncedLoopbackUrls,
  maybeInstallTargetProject,
  normalizeRuntimeConfig,
  resolveWorkingDirectory,
  runShellCommand,
  startTargetRuntime,
  waitForUrl,
};
