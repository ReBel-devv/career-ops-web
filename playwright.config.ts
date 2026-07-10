import { defineConfig, devices } from "@playwright/test";

/**
 * Demo-mode e2e suite (M7, plan §10). The webServer is a production build +
 * start with DEMO_MODE=true — the exact configuration the public Vercel demo
 * runs, backed only by the fictional `fixtures/` dataset. Never points at a
 * real career-ops repo.
 *
 * Single worker on purpose: demo writes are in-memory in ONE server process,
 * so parallel specs would observe each other's mutations.
 */
const PORT = Number(process.env.E2E_PORT ?? 3105);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    colorScheme: "dark", // the app's default theme
    trace: "retain-on-failure",
  },
  webServer: {
    // E2E_SKIP_BUILD reuses an existing production build (CI builds in its
    // own step); by default a cold `pnpm e2e` builds first.
    command: process.env.E2E_SKIP_BUILD
      ? `pnpm start --port ${PORT}`
      : `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { DEMO_MODE: "true", READ_ONLY: "", CAREER_OPS_PATH: "" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Chromium-based mobile emulation (no extra browser download in CI —
      // the adaptations under test are viewport/touch-driven, not engine-specific).
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
});
