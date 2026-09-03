import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    // Exclude Playwright specs — they use `@playwright/test`'s own
    // runner. Without this, vitest tries to import them and fails on
    // `test()` / `test.describe.configure` (Playwright's API, not vitest's).
    // The tracked specs now live in `e2e/`; `.local/playwright/` holds run
    // artifacts. Both are kept out of the vitest run.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "e2e/**",
      ".local/playwright/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
