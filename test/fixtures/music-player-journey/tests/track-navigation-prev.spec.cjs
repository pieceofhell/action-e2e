const { test, expect } = require("@playwright/test");

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

test("Track Navigation via Prev Button", async ({ page }) => {
  await openHome(page);
  let currentPage = page;
  await currentPage.locator("#prev").click();
  await pauseForUi(currentPage, 300);
  await currentPage.locator("#play").click();
  await pauseForUi(currentPage, 300);
  await expect(currentPage.getByRole("heading", { name: "Music Player", exact: true })).toBeVisible();
});
