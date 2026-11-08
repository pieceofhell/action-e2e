const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  const context = page.context();
  context.__e2pNativeDialogs = [];
  const attach = (targetPage) => targetPage.on("dialog", async (dialog) => {
    context.__e2pNativeDialogs.push({ type: dialog.type(), message: dialog.message(), at: new Date().toISOString(), decision: "dismiss" });
    await dialog.dismiss().catch(() => {});
  });
  context.on("page", attach);
  attach(page);
});

test.afterEach(async ({ page }, testInfo) => {
  const dialogs = page.context().__e2pNativeDialogs || [];
  if (dialogs.length) await testInfo.attach("native-dialogs", { body: Buffer.from(JSON.stringify(dialogs, null, 2)), contentType: "application/json" });
});

async function openHome(page) {
  await page.context().route("**/*", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method().toUpperCase())) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(5000);
  await expect(page.locator("vite-error-overlay, [data-vite-error-overlay], #webpack-dev-server-client-overlay")).toHaveCount(0);
}

async function pauseForUi(page, timeout = 160) {
  await page.waitForTimeout(timeout);
}

test("User fills Question field to initiate card creation", async ({ page }) => {
  await openHome(page);
  let currentPage = page;
  await currentPage.locator("#question").fill("What is the capital of France?");
  await pauseForUi(currentPage, 300);
  // Smoke only: no acceptance criterion has a supported behavior assertion.
  await expect(currentPage.locator("#question")).toHaveValue("What is the capital of France?");
});
