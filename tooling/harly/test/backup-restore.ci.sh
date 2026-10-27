#!/usr/bin/env bash
# Run the destructive restore probe only on an installation owned by this script.
set -euo pipefail

IMAGE="${1:?Usage: backup-restore.ci.sh <local-runtime-image>}"
CLI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/harly-restore.XXXXXX")"
INSTALL_DIR="$SCRATCH/installation"
export COMPOSE_PROJECT_NAME="harly-restore-$(basename "$SCRATCH" | tr '[:upper:].' '[:lower:]-')"
export HARLY_PORT
HARLY_PORT="$(node -e 'const s=require("node:net").createServer(); s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"

cleanup() {
  if [ -f "$INSTALL_DIR/compose.yaml" ] && [ -f "$INSTALL_DIR/.env" ]; then
    docker compose --project-directory "$INSTALL_DIR" \
      --env-file "$INSTALL_DIR/.env" -f "$INSTALL_DIR/compose.yaml" \
      down --volumes --remove-orphans || true
  fi
  rm -rf -- "$SCRATCH"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Let the generated installation supply its own independent database/secrets.
unset DATABASE_URL HARLY_IMAGE HARLY_VERSION HARLY_URL
unset POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
unset BETTER_AUTH_SECRET AI_ENCRYPTION_KEY STORAGE_UPLOAD_SECRET CRON_SECRET HARLY_SETUP_SECRET
unset STORAGE_PROVIDER COMPOSE_PROFILES COMPOSE_FILE COMPOSE_ENV_FILES
unset HARLY_INITIAL_ADMIN_EMAIL HARLY_DOMAIN METRICS_TOKEN RESEND_API_KEY EMAIL_FROM
unset DOCUSEAL_URL DOCUSEAL_API_TOKEN
unset S3_BUCKET S3_REGION S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_ENDPOINT S3_PUBLIC_URL

HARLY_PROXY_MODE=local HARLY_URL=https://ci.example.invalid \
  HARLY_INITIAL_ADMIN_EMAIL=restore-owner@harly-e2e.test \
  HARLY_ORGANIZATION="Restore verification" HARLY_RESOURCE_PROFILE=compact \
  STORAGE_PROVIDER=local HARLY_IMAGE_REF="$IMAGE" \
  node "$CLI_ROOT/dist/index.js" init "$INSTALL_DIR" >/dev/null

# The app uses a valid public-origin fixture; doctor probes the published local
# port instead of trying to resolve that deliberately non-routable origin.
node --input-type=module - "$INSTALL_DIR/harly.config.json" "$HARLY_PORT" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const [file, port] = process.argv.slice(2);
const config = JSON.parse(readFileSync(file, "utf8"));
config.publicUrl = `http://127.0.0.1:${port}`;
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
JS

cd "$INSTALL_DIR"
docker compose up -d --wait --wait-timeout 240
docker compose exec -T postgres psql -U harly -d harly -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "user" (id, name, email, email_verified)
VALUES ('restore-ci-owner', 'Restore Owner', 'restore-owner@harly-e2e.test', true);
SQL

HARLY_DESTRUCTIVE_OK=1 HARLY_CLI="$CLI_ROOT/dist/index.js" \
  bash "$CLI_ROOT/test/backup-restore.destructive.sh" "$INSTALL_DIR"
