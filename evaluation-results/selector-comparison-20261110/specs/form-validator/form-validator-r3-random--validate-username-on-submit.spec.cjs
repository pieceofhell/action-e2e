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

async function openHome(page, localOnly = false) {
  const origin = localOnly ? new URL(test.info().project.use.baseURL).origin : null;
  await page.context().route("**/*", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method().toUpperCase())
        || (origin && new URL(route.request().url()).origin !== origin)) {
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

test("form-validator-r3-random--validate-username-on-submit", async ({ page }) => {
  await openHome(page, true);
  let currentPage = page;
  await currentPage.locator("#username").fill("sample1");
  await pauseForUi(currentPage, 300);
  await currentPage.locator("#username").press("Enter");
  await pauseForUi(currentPage, 300);
  // form-validator-r3-random--validate-username-on-submit-criterion-1-assertion-1: validate-username-on-submit
  await expect(currentPage.locator(".form-control.success #username"), "form-validator-r3-random--validate-username-on-submit-criterion-1-assertion-1").toHaveCount(1, { timeout: 2500 });
  await expect(currentPage.locator(".form-control.error #email"), "form-validator-r3-random--validate-username-on-submit-criterion-1-assertion-1").toHaveCount(1, { timeout: 2500 });
});
