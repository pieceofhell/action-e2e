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

    await waitForUrl(runtimeConfig.baseUrl, 20000);
    return {
      mode: "external",
      baseUrl: runtimeConfig.baseUrl,
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

  child.on("error", (error) => {
    stderr += `\n${error.message}`;
  });

  await waitForUrl(baseUrl, 60000);

  return {
    mode: "command",
    baseUrl,
    startCommand,
    stdout,
    stderr,
    stop: async () => {
      if (child.exitCode !== null) {
        return;
      }

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
    },
  };
}

async function waitForUrl(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(800);
  }

  throw new Error(`The URL ${baseUrl} did not respond within the expected time. ${lastError ? `Last error: ${lastError.message}` : ""}`);
}

async function runShellCommand(command, { cwd, label, timeoutMs, tolerateFailure = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
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

module.exports = {
  maybeInstallTargetProject,
  normalizeRuntimeConfig,
  resolveWorkingDirectory,
  runShellCommand,
  startTargetRuntime,
  waitForUrl,
};
