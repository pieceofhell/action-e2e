const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAiConfig } = require("../src/services/llm-provider");
const { parsePlaywrightReport } = require("../src/services/test-runner");
const { hasLiveEvidence, validateAiTestBody } = require("../src/services/test-generator");

test("normalizes local and hosted provider configurations", () => {
  const ollama = normalizeAiConfig({
    provider: "ollama",
    model: "openllama:8b",
  });
  const groqWithoutKey = normalizeAiConfig({
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  });
  const lmStudio = normalizeAiConfig({
    provider: "lm-studio",
    model: "local-model",
  });

  assert.equal(ollama.enabled, true);
  assert.equal(groqWithoutKey.enabled, false);
  assert.equal(lmStudio.endpoint, "http://127.0.0.1:1234/v1");
});

test("keeps Playwright evidence and multi-error failures in the parsed report", () => {
  const runDirectory = "C:\\prototype-runs\\sample-run";
  const report = {
    suites: [{
      specs: [{
        title: "Visible login flow",
        file: "login.spec.cjs",
        tests: [{
          results: [{
            status: "failed",
            duration: 42,
            errors: [{ message: "Expected heading was not visible" }],
            attachments: [
              { name: "screenshot", contentType: "image/png", path: `${runDirectory}\\results\\test-artifacts\\login.png` },
              { name: "video", contentType: "video/webm", path: `${runDirectory}\\results\\test-artifacts\\login.webm` },
              { name: "trace", contentType: "application/zip", path: `${runDirectory}\\results\\test-artifacts\\trace.zip` },
            ],
          }],
        }],
      }],
      suites: [],
    }],
    stats: { duration: 42 },
  };

  const parsed = parsePlaywrightReport(report, { runDirectory });
  assert.equal(parsed.summary.failed, 1);
  assert.match(parsed.tests[0].error, /heading/);
  assert.deepEqual(parsed.tests[0].evidence.map((item) => item.kind), ["screenshot", "video", "trace"]);
  assert.equal(parsed.tests[0].evidence[0].relativePath, "results/test-artifacts/login.png");
});

test("requires live exploration before model-authored tests and rejects generic role selectors", () => {
  assert.equal(hasLiveEvidence({ liveExploration: { status: "completed", routes: [{ path: "/" }] } }), true);
  assert.equal(hasLiveEvidence({ liveExploration: { status: "not-attempted", routes: [] } }), false);

  assert.throws(
    () => validateAiTestBody("await openHome(page);\nawait expect(page.getByRole('heading')).toBeVisible();", { uiHints: { buttons: [], headings: [] } }),
    /unscoped getByRole\('heading'\)/
  );

  assert.throws(
    () => validateAiTestBody("await openHome(page);\nawait expect(page.getByRole('form')).toBeVisible();", { uiHints: { buttons: [], headings: [] } }),
    /unscoped getByRole\('form'\)/
  );

  assert.throws(
    () => validateAiTestBody("test('unexpected extra test', async ({ page }) => { await expect(page.locator('body')).toBeVisible(); });", { uiHints: { buttons: [], headings: [] } }),
    /complete test declaration/
  );

  assert.throws(
    () => validateAiTestBody("await expect(page.getByText('Welcome')).toBeVisible();", { uiHints: { buttons: [], headings: [] } }),
    /did not navigate with openHome/
  );

  assert.throws(
    () => validateAiTestBody(
      "await openHome(page);\nawait expect(page.getByPlaceholder('Task title:')).toBeVisible();",
      { uiHints: { buttons: [], headings: [], inputs: [] }, liveExploration: { routes: [{ inputs: [{ label: 'Task title:', placeholder: '' }] }] } }
    ),
    /without a matching observed placeholder/
  );
});
