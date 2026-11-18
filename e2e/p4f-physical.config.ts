import { defineConfig } from "@playwright/test";

/**
 * P4-F physical-hardware-only E2E. NEVER reuse the ordinary Playwright
 * config: that config intentionally starts Chromium with fake camera flags.
 *
 * Product Owner amendment 2026-11-18: the physical gate is TWO simultaneous
 * independent real camera SOURCES — built-in BisonCam NB Pro + live iPhone
 * via e2eSoft iVCam (virtual driver, physical phone sensor source). The
 * legacy five-physical spec stays as an honest NO-GO probe on workstations
 * with fewer than five sensors; the five-PUBLISHER benchmark is synthetic
 * and lives in the ordinary suite (scenario-f), never counted as physical.
 *
 * Run explicitly:
 *   P4F_PHYSICAL_CAMERAS=1 npx playwright test --config e2e/p4f-physical.config.ts
 *
 * The e2e test emits anonymized private evidence but never claims a
 * multi-machine physical demo or replaces a human witness.
 */
export default defineConfig({
  testDir: ".",
  testMatch: ["p4f-two-physical-sources.spec.ts", "p4f-five-physical.spec.ts"],
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "../e2e-results/p4f-physical.json" }]],
  use: {
    baseURL: process.env.P4F_WEB_BASE ?? "http://localhost:3000",
    headless: false,
    // Intentionally NO --use-fake-device-for-media-stream,
    // NO --use-fake-ui-for-media-stream and NO virtual camera injection.
    launchOptions: { args: [] },
    permissions: ["camera"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 25_000,
    viewport: { width: 1440, height: 900 },
  },
  outputDir: "../e2e-results/p4f-physical",
  globalSetup: require.resolve("./global-setup.ts"),
});
