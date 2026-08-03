import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_DATABASE_URL,
  E2E_SMTP_CAPTURE,
  E2E_SMTP_PORT,
} from "./e2e/constants";

const webRoot = path.resolve(__dirname);

export default defineConfig({
  testDir: path.join(webRoot, "e2e"),
  testMatch: /.*\.spec\.ts/,
  globalSetup: path.join(webRoot, "e2e/global-setup.ts"),
  outputDir: path.join(webRoot, "test-results/e2e"),
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 30_000,
    actionTimeout: 30_000,
  },
  webServer: {
    command:
      "node e2e/smtp-server.mjs & smtp_pid=$!; pnpm dev --hostname 127.0.0.1 & web_pid=$!; cleanup(){ kill \"$web_pid\" \"$smtp_pid\" 2>/dev/null || true; }; trap 'cleanup; exit 143' INT TERM; trap cleanup EXIT; wait \"$web_pid\"; status=$?; exit \"$status\"",
    cwd: webRoot,
    url: E2E_BASE_URL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
      BETTER_AUTH_URL: E2E_BASE_URL,
      HARLY_URL: E2E_BASE_URL,
      HARLY_E2E_SMTP_PORT: String(E2E_SMTP_PORT),
      HARLY_E2E_SMTP_CAPTURE: E2E_SMTP_CAPTURE,
      // Workspace email configuration is intentionally fail-closed when the
      // installation has no encryption key, even for this passwordless SMTP
      // fixture. Keep the key deterministic and scoped to the disposable E2E
      // process/database.
      AI_ENCRYPTION_KEY:
        "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
      EMAIL_FROM: "harly-e2e@harly-e2e.test",
    },
  },
});
