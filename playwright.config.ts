import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mockup-chromium",
      testIgnore: /auth-routing\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173",
      },
    },
    {
      name: "marketing-auth-chromium",
      testMatch: /auth-routing\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4174",
      },
    },
    {
      name: "marketing-auth-prefixed-chromium",
      testMatch: /auth-routing\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4175/auth-test/",
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @workspace/mockup-sandbox run dev",
      env: {
        BASE_PATH: "/",
        PORT: "4173",
      },
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter @workspace/marketing-site run build && pnpm --filter @workspace/marketing-site run serve",
      env: {
        BASE_PATH: "/",
        BUILD_OUT_DIR: "dist/public",
        CLERK_AUTH_BROWSER_TEST: "true",
        PORT: "4174",
      },
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter @workspace/marketing-site run build && pnpm --filter @workspace/marketing-site run serve",
      env: {
        BASE_PATH: "/auth-test/",
        BUILD_OUT_DIR: "dist/auth-test",
        CLERK_AUTH_BROWSER_TEST: "true",
        PORT: "4175",
      },
      url: "http://127.0.0.1:4175/auth-test/",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
