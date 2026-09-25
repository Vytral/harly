import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

import {
  E2E_BASE_URL,
  E2E_BETTER_AUTH_SECRET,
  E2E_CRON_SECRET,
  E2E_DATABASE_URL,
  E2E_INITIAL_ADMIN_EMAIL,
  E2E_RUNTIME_URL,
  E2E_SETUP_SECRET,
  E2E_STORAGE_UPLOAD_SECRET,
  E2E_SMTP_CAPTURE,
  E2E_SMTP_PORT,
  E2E_AI_ENCRYPTION_KEY,
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
      'mkdir -p .next/standalone/apps/web/.next/static .next/standalone/apps/web/public || exit 1; cp -R .next/static/. .next/standalone/apps/web/.next/static/ || exit 1; cp -R public/. .next/standalone/apps/web/public/ || exit 1; upload_dir="$(mktemp -d "${TMPDIR:-/tmp}/harly-e2e-uploads.XXXXXX")" || exit 1; export UPLOADS_DIR="$upload_dir"; node e2e/smtp-server.mjs & smtp_pid=$!; HOSTNAME=127.0.0.1 PORT=3000 node .next/standalone/apps/web/server.js & web_pid=$!; cleanup(){ kill "$web_pid" "$smtp_pid" 2>/dev/null || true; rm -rf -- "$upload_dir"; }; trap \'cleanup; exit 143\' INT TERM; trap cleanup EXIT; wait "$web_pid"; status=$?; exit "$status"',
    cwd: webRoot,
    url: E2E_BASE_URL,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
      BETTER_AUTH_URL: E2E_BASE_URL,
      HARLY_URL: E2E_RUNTIME_URL,
      HARLY_E2E: "true",
      BETTER_AUTH_SECRET: E2E_BETTER_AUTH_SECRET,
      STORAGE_UPLOAD_SECRET: E2E_STORAGE_UPLOAD_SECRET,
      HARLY_SETUP_SECRET: E2E_SETUP_SECRET,
      HARLY_INITIAL_ADMIN_EMAIL: E2E_INITIAL_ADMIN_EMAIL,
      CRON_SECRET: E2E_CRON_SECRET,
      HARLY_E2E_SMTP_PORT: String(E2E_SMTP_PORT),
      HARLY_E2E_SMTP_CAPTURE: E2E_SMTP_CAPTURE,
      // Workspace email configuration is intentionally fail-closed when the
      // installation has no encryption key, even for this passwordless SMTP
      // fixture. Keep the key deterministic and scoped to the disposable E2E
      // process/database.
      AI_ENCRYPTION_KEY: E2E_AI_ENCRYPTION_KEY,
      EMAIL_FROM: "harly-e2e@harly-e2e.test",
      // A workspace with CAPTCHA disabled must remain CAPTCHA-free in E2E,
      // even when the developer host has platform-wide provider keys set.
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
      NEXT_PUBLIC_RECAPTCHA_SITE_KEY: "",
      RECAPTCHA_SECRET_KEY: "",
      NEXT_PUBLIC_HCAPTCHA_SITE_KEY: "",
      HCAPTCHA_SECRET_KEY: "",
    },
  },
});
