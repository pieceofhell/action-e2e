const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { classifyHistoricalBugPair, matchesToggleAllGroundTruth } = require("../src/services/bug-evaluator");
const { requestStructuredJson } = require("../src/services/llm-provider");
const { startTargetRuntime } = require("../src/services/runtime-orchestrator");

const prototypeRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(prototypeRoot, "evaluation-results", "bug-discovery", "todomvc-toggle-all");
const evidenceRoot = path.join(outputRoot, "evidence");
const model = process.env.E2P_POC_MODEL || "gemma3:12b";
const aiConfig = {
  provider: "ollama",
  endpoint: process.env.E2P_POC_OLLAMA_ENDPOINT || "http://127.0.0.1:11434",
  model,
};
const revisions = [
  {
    role: "buggy",
    commit: "64ee2028",
    projectPath: process.env.E2P_TODOMVC_BUGGY_PATH || "C:\\Users\\henri\\Documents\\e2p-bug-corpus\\todomvc-before-9386c868",
    port: 4401,
  },
  {
    role: "fixed",
    commit: "9386c868",
    projectPath: process.env.E2P_TODOMVC_FIXED_PATH || "C:\\Users\\henri\\Documents\\e2p-bug-corpus\\todomvc-after-9386c868",
    port: 4402,
  },
];

async function main() {
  await fs.mkdir(evidenceRoot, { recursive: true });
  const observations = {};
  for (const revision of revisions) {
    process.stdout.write(`[${revision.role}] inspecting TodoMVC ${revision.commit}\n`);
    observations[revision.role] = await inspectRevision(revision);
  }

  const blindAssessment = await analyzeBlindState(observations.buggy);
  const pair = classifyHistoricalBugPair({
    buggy: observations.buggy.oracle,
    fixed: observations.fixed.oracle,
  });
  const result = {
    experiment: "todomvc-toggle-all-historical-bug",
    protocol: "blind-multimodal-historical-pair-v1",
    model,
    groundTruth: {
      fixCommit: "9386c868",
      parentCommit: "64ee2028",
      disclosureToModel: false,
      description: "Bulk completion must keep each checkbox synchronized with its completed item state.",
    },
    blindAssessment: {
      ...blindAssessment,
      matchedGroundTruth: matchesToggleAllGroundTruth(blindAssessment.hypotheses),
    },
    pairedExecution: pair,
    revisions: observations,
  };
  const outputPath = path.join(outputRoot, `todomvc-toggle-all-${safeName(model)}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    outputPath,
    pairedClassification: pair.classification,
    blindModelMatchedGroundTruth: result.blindAssessment.matchedGroundTruth,
    hypotheses: result.blindAssessment.hypotheses.map((item) => item.title),
  }, null, 2)}\n`);
}

async function inspectRevision(revision) {
  const serverScript = path.join(prototypeRoot, "scripts", "support", "static-server.cjs");
  const baseUrl = `http://127.0.0.1:${revision.port}`;
  const runtime = await startTargetRuntime({
    targetProjectPath: revision.projectPath,
    runtimeConfig: {
      mode: "command",
      workingDirectory: ".",
      startCommand: `node "${serverScript}" --root architecture-examples/react --port ${revision.port}`,
      baseUrl,
    },
  });
  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1100, height: 820 } });
    const page = await context.newPage();
    await page.goto(runtime.baseUrl, { waitUntil: "networkidle", timeout: 60000 });
    const input = page.locator("#new-todo");
    await input.fill("First task");
    await input.press("Enter");
    await input.fill("Second task");
    await input.press("Enter");

    const checkpoints = [await observeTodoState(page, "two-active-items")];
    await page.locator("#toggle-all").click();
    checkpoints.push(await observeTodoState(page, "after-first-toggle-all"));
    await page.locator("#toggle-all").click();
    checkpoints.push(await observeTodoState(page, "after-second-toggle-all"));

    const finalState = checkpoints.at(-1);
    const screenshotPath = path.join(evidenceRoot, `${revision.role}-after-second-toggle-all.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
    const consistent = finalState.todos.every((todo) => todo.checkboxChecked === todo.completedClass);
    return {
      role: revision.role,
      commit: revision.commit,
      trajectory: [
        "Created First task",
        "Created Second task",
        "Clicked the toggle-all checkbox",
        "Clicked the toggle-all checkbox again",
      ],
      checkpoints,
      oracle: {
        id: "todo-checkbox-matches-completed-state",
        expected: "Every item checkbox equals the item's completed state after repeated bulk toggles.",
        actual: consistent
          ? "Checkboxes and completed item states remained synchronized."
          : "At least one checkbox remained checked while its item was not completed.",
        status: consistent ? "passed" : "failed",
        passed: consistent,
      },
      evidence: path.relative(prototypeRoot, screenshotPath).split(path.sep).join("/"),
    };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await runtime.stop().catch(() => {});
  }
}

async function observeTodoState(page, label) {
  return page.evaluate((checkpointLabel) => ({
    label: checkpointLabel,
    toggleAllChecked: document.querySelector("#toggle-all")?.checked || false,
    activeCountText: document.querySelector("#todo-count")?.textContent?.replace(/\s+/g, " ").trim() || "",
    todos: [...document.querySelectorAll("#todo-list li")].map((item) => ({
      text: item.querySelector("label")?.textContent?.trim() || "",
      completedClass: item.classList.contains("completed"),
      checkboxChecked: item.querySelector("input.toggle")?.checked || false,
    })),
  }), label);
}

async function analyzeBlindState(buggyRevision) {
  const image = await fs.readFile(path.join(prototypeRoot, buggyRevision.evidence), "base64");
  const response = await requestStructuredJson({
    aiConfig,
    timeoutMs: 180000,
    systemPrompt: [
      "You are a blind QA bug hunter for a web application.",
      "You receive a screenshot, the actions already performed, and structured browser observations.",
      "You do not receive an issue, source code, commit message, fixed version, or expected bug.",
      "Find concrete inconsistencies supported by the evidence, especially disagreement between visible controls and application state.",
      "Do not claim a control is broken unless the trajectory exercised it.",
      "Each hypothesis must include a falsifiable browser oracle.",
      "Return raw JSON only: {\"hypotheses\":[{\"title\":\"...\",\"observedEvidence\":\"...\",\"expectedBehavior\":\"...\",\"confidence\":\"high|medium|low\",\"oracle\":\"...\"}]}",
      "Return at most three hypotheses.",
    ].join(" "),
    userPrompt: JSON.stringify({
      project: "React TodoMVC",
      trajectory: buggyRevision.trajectory,
      checkpoints: buggyRevision.checkpoints,
    }),
    images: [image],
  });
  return {
    mode: "blind",
    evidenceMode: "screenshot+structured-browser-state",
    hypotheses: normalizeHypotheses(response?.hypotheses),
  };
}

function normalizeHypotheses(value) {
  return (Array.isArray(value) ? value : []).slice(0, 3).map((item) => ({
    title: sanitize(item?.title),
    observedEvidence: sanitize(item?.observedEvidence),
    expectedBehavior: sanitize(item?.expectedBehavior),
    confidence: ["high", "medium", "low"].includes(item?.confidence) ? item.confidence : "low",
    oracle: sanitize(item?.oracle),
  })).filter((item) => item.title && item.observedEvidence && item.oracle);
}

function sanitize(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

function safeName(value) {
  return String(value || "model").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
