import { defineConfig } from "@playwright/test";

/**
 * P4-A browser smoke tests (real Chromium against the real Next.js dev
 * server and the real Spring Boot backend at the PR HEAD).
 *
 * Environment contract (see e2e/README.md):
 *   - Backend  : http://localhost:8080  (branch feature/p4-a-monitoring-foundation,
 *                fresh PostgreSQL via Flyway, Mailpit on :1025/:8025 for OTP)
 *   - Frontend : http://localhost:3000  (next dev, NEXT_PUBLIC_API_URL=http://localhost:8080)
 *
 * Run: npx playwright test --config e2e/playwright.config.ts
 * Evidence: e2e/evidence/*.png + e2e-results/ (gitignored).
 */
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "../e2e-results/results.json" }]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "off",
    actionTimeout: 20_000,
    viewport: { width: 1440, height: 900 },
    // P4-B camera tests use Chromium's synthetic camera (fake device +
    // auto-granted permission). This is SIMULATED media — evidence reports
    // must label it as such (issue #84/QUALITY_GATES §10).
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
    permissions: ["camera"],
  },
  outputDir: "../e2e-results",
  globalSetup: require.resolve("./global-setup.ts"),
});
