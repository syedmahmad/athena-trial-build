import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env so the Supabase URL + service-role key are visible to the test
// runner (the auth setup provisions a test user via the admin API, and the
// specs read NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from here).
loadEnv();

/**
 * Playwright e2e harness. Two shapes of run:
 *
 *   • Authed specs (chromium/webkit): the `auth` setup signs a test teacher
 *     into Supabase and saves storageState, then the educator + whiteboard
 *     specs run against it. Start the app first (`make dev`), then
 *     `pnpm exec playwright test`.
 *   • Mobile renderer (mobile): drives the public /dev/mobile harness on an
 *     iPhone viewport, no auth (`make mobile-test`).
 *
 * Run artifacts (results, HTML report, auth storageState) stay in the
 * gitignored .local/playwright; only the specs are tracked.
 */
export default defineConfig({
  // Spec source is tracked in e2e/; run artifacts (results, report, auth
  // storageState) stay in gitignored .local/playwright.
  testDir: "e2e",
  outputDir: ".local/playwright/.results",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: ".local/playwright/.report", open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "auth",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /\.spec\.ts/,
      // The mobile-renderer spec runs in its own auth-free mobile project.
      testIgnore: /mobile-renderer\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        storageState: ".local/playwright/.auth/state.json",
      },
      dependencies: ["auth"],
    },
    {
      name: "webkit",
      testMatch: /\.spec\.ts/,
      testIgnore: /mobile-renderer\.spec\.ts/,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        storageState: ".local/playwright/.auth/state.json",
      },
      dependencies: ["auth"],
    },
    {
      // Portrait mobile lesson renderer (A5). Targets the public /dev/mobile
      // harness, so no Clerk auth setup and no storageState — just an iPhone
      // viewport against a deterministic renderer.
      name: "mobile",
      testMatch: /mobile-renderer\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
});
