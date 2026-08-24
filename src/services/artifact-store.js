const fs = require("fs/promises");
const path = require("path");

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "project";
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function createRunDirectory(runsRoot, projectPath) {
  const projectName = path.basename(projectPath);
  const runId = `${slugify(projectName)}-${buildTimestamp()}`;
  const runDirectory = path.join(runsRoot, runId);
  const testsDirectory = path.join(runDirectory, "tests");
  const resultsDirectory = path.join(runDirectory, "results");
  const artifactsDirectory = path.join(runDirectory, "artifacts");

  await Promise.all([
    ensureDirectory(runDirectory),
    ensureDirectory(testsDirectory),
    ensureDirectory(resultsDirectory),
    ensureDirectory(artifactsDirectory),
  ]);

  return {
    runId,
    runDirectory,
    testsDirectory,
    resultsDirectory,
    artifactsDirectory,
  };
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(filePath, contents) {
  await fs.writeFile(filePath, contents, "utf8");
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function beginArtifactQuarantine(runDirectory) {
  await writeText(path.join(runDirectory, ".quarantine"), "Authenticated artifacts are being validated.\n");
}

async function releaseArtifactQuarantine(runDirectory) {
  await fs.rm(path.join(runDirectory, ".quarantine"), { force: true });
}

async function isArtifactRunQuarantined(runDirectory) {
  return fs.access(path.join(runDirectory, ".quarantine"))
    .then(() => true)
    .catch(() => false);
}

async function scanDirectoryForSecrets(rootDirectory, secretValues) {
  const secrets = [...new Set((secretValues || []).map((value) => String(value || "")).filter(Boolean))];
  if (!secrets.length) {
    return { safe: true, matches: [], scannedFiles: 0 };
  }

  const files = await collectFiles(rootDirectory);
  const matches = [];

  for (const filePath of files) {
    const contents = await fs.readFile(filePath);
    const found = secrets.some((secret) => contents.includes(Buffer.from(secret, "utf8")));

    if (found) {
      matches.push(path.relative(rootDirectory, filePath).split(path.sep).join("/"));
    }
  }

  return {
    safe: matches.length === 0,
    matches,
    scannedFiles: files.length,
  };
}

async function removeSecretBearingFiles(rootDirectory, relativePaths) {
  for (const relativePath of relativePaths || []) {
    const absolutePath = path.resolve(rootDirectory, relativePath);
    const relative = path.relative(rootDirectory, absolutePath);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      await fs.rm(absolutePath, { force: true });
    }
  }
}

async function collectFiles(rootDirectory) {
  const output = [];
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".quarantine") continue;
    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      output.push(...await collectFiles(absolutePath));
    } else if (entry.isFile()) {
      output.push(absolutePath);
    }
  }

  return output;
}

module.exports = {
  beginArtifactQuarantine,
  createRunDirectory,
  ensureDirectory,
  isArtifactRunQuarantined,
  readJson,
  releaseArtifactQuarantine,
  removeSecretBearingFiles,
  scanDirectoryForSecrets,
  slugify,
  writeJson,
  writeText,
};
