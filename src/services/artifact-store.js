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

module.exports = {
  createRunDirectory,
  ensureDirectory,
  readJson,
  slugify,
  writeJson,
  writeText,
};
