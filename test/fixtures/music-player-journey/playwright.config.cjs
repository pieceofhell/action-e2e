const path = require("path");

module.exports = {
  testDir: path.join(__dirname, "tests"),
  timeout: 60000,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(__dirname, "results", "playwright-results.json") }]
  ],
  outputDir: path.join(__dirname, "results", "test-artifacts"),
  use: {
    baseURL: process.env.TARGET_BASE_URL || "http://127.0.0.1:3000",
    // Keep an auditable visual record for every generated test, including passes.
    trace: "on",
    screenshot: "on",
    video: "on",
  },
};
