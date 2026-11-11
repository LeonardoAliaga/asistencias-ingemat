const { defineConfig } = require("@playwright/test");
const port = process.env.UI_TEST_PORT || 3017;
module.exports = defineConfig({
  testDir: "tests",
  testMatch: "ui.spec.cjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-gpu"],
        }
      : {},
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tests/ui-server.cjs",
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 15000,
  },
});
