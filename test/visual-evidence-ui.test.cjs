const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");
const { chromium } = require("playwright");

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("groups visual evidence by test and replaces broken media with a retryable state", { timeout: 30000 }, async (t) => {
  const app = express();
  let missingArtifactAvailable = false;
  app.get("/api/health", (request, response) => response.json({ ok: true, requestToken: "test" }));
  app.get("/api/ai/status", (request, response) => response.json({ providers: [] }));
  app.get("/artifacts/run/good.png", (request, response) => response.type("png").send(onePixelPng));
  app.get("/artifacts/run/missing.png", (request, response) => {
    if (!missingArtifactAvailable) {
      response.sendStatus(404);
      return;
    }
    response.type("png").send(onePixelPng);
  });
  app.use(express.static(path.join(__dirname, "..", "public")));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const address = server.address();
  await page.goto(`http://127.0.0.1:${address.port}`);

  await page.evaluate(() => {
    state.generated = { artifactBaseUrl: "/artifacts/run" };
    state.execution = {
      auth: { mode: "guest" },
      runtime: { baseUrl: "http://127.0.0.1:3000" },
      report: {
        summary: { total: 2, passed: 2, failed: 0, skipped: 0 },
        tests: [
          {
            title: "Checkout preserves the cart",
            status: "passed",
            evidence: [
              { kind: "screenshot", relativePath: "good.png" },
              { kind: "trace", name: "trace", relativePath: "trace with #1.zip" },
            ],
          },
          {
            title: "Settings remain available",
            status: "passed",
            evidence: [{ kind: "screenshot", relativePath: "missing.png" }],
          },
        ],
      },
    };
    state.insights = { overview: "Complete", insights: [], limitations: [], nextSteps: [] };
    renderResults();
  });

  const groups = page.locator(".evidence-test");
  await assert.doesNotReject(() => groups.first().waitFor());
  assert.equal(await groups.count(), 2);
  assert.equal(await groups.nth(0).evaluate((element) => element.open), true);
  assert.equal(await groups.nth(1).evaluate((element) => element.open), false);
  assert.equal(await page.locator(".evidence-test__title").nth(0).textContent(), "Checkout preserves the cart");
  assert.match(await page.locator(".evidence-gallery__count").textContent(), /2 tests · 3 artifacts/);

  const traceUrl = await page.locator(".evidence-file").getAttribute("href");
  assert.equal(traceUrl, "/artifacts/run/trace%20with%20%231.zip");

  await groups.nth(1).locator("summary").click();
  const fallback = groups.nth(1).locator(".evidence-media__fallback");
  await fallback.waitFor({ state: "visible" });
  assert.match(await fallback.textContent(), /Screenshot unavailable/);
  const retryButton = fallback.getByRole("button", { name: "Retry" });
  assert.equal(await retryButton.count(), 1);

  missingArtifactAvailable = true;
  await retryButton.click();
  await groups.nth(1).locator("[data-evidence-media]").waitFor({ state: "visible" });
  assert.equal(await fallback.isHidden(), true);
});
