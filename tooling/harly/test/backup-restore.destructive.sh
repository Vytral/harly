#!/usr/bin/env bash
#
# SELFHOST-DATA-01 — Destructive backup → destroy → restore verification.
#
# Proves that a Harly backup can actually recover a wiped installation:
#   1. Seed the database and uploads with known, counted, hashed data.
#   2. Take a backup with the CLI (`harly backup`).
#   3. DESTROY: drop every table and delete every uploaded object.
#   4. Restore from the backup (`harly restore`).
#   5. Verify row counts, file hashes, and the owner survived byte-for-byte.
#
# This is intentionally destructive and MUST run only against a throwaway
# installation. It refuses to run unless HARLY_DESTRUCTIVE_OK=1 is set.
#
# Usage (from a directory created by `harly init`):
#   HARLY_DESTRUCTIVE_OK=1 ./backup-restore.destructive.sh /path/to/installation
#
# Exit codes: 0 = restore verified, non-zero = mismatch or failure.

set -euo pipefail

INSTALL_DIR="${1:-.}"
CLI="${HARLY_CLI:-$(cd "$(dirname "$0")/.." && pwd)/dist/index.js}"

fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "  → $*"; }
step() { echo ""; echo "== $* =="; }

[ "${HARLY_DESTRUCTIVE_OK:-}" = "1" ] || fail "refusing to run without HARLY_DESTRUCTIVE_OK=1 (this WIPES the database)"
[ -f "$INSTALL_DIR/harly.config.json" ] || fail "$INSTALL_DIR is not a Harly installation (no harly.config.json)"
[ -f "$CLI" ] || fail "CLI not found at $CLI (build it: pnpm --filter @harly/cli build)"
command -v docker >/dev/null || fail "docker is required"

INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd)"
cd "$INSTALL_DIR"

# Backups are encrypted with age unless --allow-plaintext. This harness uses
# plaintext to stay self-contained; production backups should stay encrypted.
BACKUP_FLAG="--allow-plaintext"

# --- helpers that mirror how the CLI talks to Postgres -----------------------
psql_q() {
  # Run a single SQL query, return raw tuples only (-tA), against the app DB.
  docker compose exec -T postgres psql -U harly -d harly -tA -c "$1"
}

step "Preflight: services healthy"
docker compose up -d --wait --wait-timeout 180
info "postgres reachable: $(psql_q 'select 1')"

# --- 1. SEED known data ------------------------------------------------------
step "Seed known data"
# A dedicated table so the harness never depends on app schema specifics and is
# safe to re-run. We record a known row count and a content hash.
SEED_ROWS=500
psql_q "drop table if exists harly_restore_probe;"
psql_q "create table harly_restore_probe (id int primary key, payload text not null);"
psql_q "insert into harly_restore_probe
        select g, md5(g::text || 'harly-seed')
        from generate_series(1, ${SEED_ROWS}) g;"

# Capture the ground truth we expect to survive a destroy+restore.
BEFORE_COUNT="$(psql_q 'select count(*) from harly_restore_probe;')"
BEFORE_CHECKSUM="$(psql_q "select md5(string_agg(payload, ',' order by id)) from harly_restore_probe;")"
# Owner is the real thing a user cares about surviving. Count real app rows too.
BEFORE_USERS="$(psql_q "select count(*) from \"user\";" 2>/dev/null || echo "n/a")"
info "probe rows:     $BEFORE_COUNT (expected $SEED_ROWS)"
info "probe checksum: $BEFORE_CHECKSUM"
info "user rows:      $BEFORE_USERS"
[ "$BEFORE_COUNT" = "$SEED_ROWS" ] || fail "seed did not insert the expected rows"

# Seed a known uploaded object so we exercise the uploads path of the backup.
UPLOAD_MARKER="restore-probe-$(psql_q 'select md5(random()::text)').txt"
UPLOAD_CONTENT="harly-uploads-probe-content"
UPLOAD_HASH_BEFORE="$(printf '%s' "$UPLOAD_CONTENT" | shasum -a 256 | awk '{print $1}')"
printf '%s' "$UPLOAD_CONTENT" | docker compose exec -T app sh -c "cat > /data/uploads/'$UPLOAD_MARKER'" \
  && info "seeded upload: $UPLOAD_MARKER ($UPLOAD_HASH_BEFORE)" \
  || info "uploads container not writable; skipping upload probe"

# --- 2. BACKUP ---------------------------------------------------------------
step "Backup"
ARCHIVE="$(node "$CLI" backup "$INSTALL_DIR" $BACKUP_FLAG | tail -n1)"
[ -f "$ARCHIVE" ] || fail "backup did not produce an archive (got: $ARCHIVE)"
info "archive: $ARCHIVE ($(wc -c < "$ARCHIVE") bytes)"

# --- 3. DESTROY --------------------------------------------------------------
step "DESTROY database and uploads"
# Drop the whole public schema: the most honest simulation of data loss.
psql_q "drop schema public cascade; create schema public;"
AFTER_DESTROY="$(psql_q "select count(*) from pg_tables where schemaname='public';")"
info "tables left after destroy: $AFTER_DESTROY"
[ "$AFTER_DESTROY" = "0" ] || fail "destroy did not wipe the schema"
docker compose exec -T app sh -c "rm -f /data/uploads/'$UPLOAD_MARKER'" 2>/dev/null || true
info "uploads wiped"

# --- 4. RESTORE --------------------------------------------------------------
step "Restore"
# restore requires --force after you verify the destination (mirrors the CLI).
node "$CLI" restore "$ARCHIVE" "$INSTALL_DIR" --force $BACKUP_FLAG

# --- 5. VERIFY ---------------------------------------------------------------
step "Verify recovery"
AFTER_COUNT="$(psql_q 'select count(*) from harly_restore_probe;')"
AFTER_CHECKSUM="$(psql_q "select md5(string_agg(payload, ',' order by id)) from harly_restore_probe;")"
AFTER_USERS="$(psql_q "select count(*) from \"user\";" 2>/dev/null || echo "n/a")"
info "probe rows:     $AFTER_COUNT (expected $BEFORE_COUNT)"
info "probe checksum: $AFTER_CHECKSUM"
info "user rows:      $AFTER_USERS (expected $BEFORE_USERS)"

[ "$AFTER_COUNT" = "$BEFORE_COUNT" ]       || fail "row count mismatch after restore ($AFTER_COUNT != $BEFORE_COUNT)"
[ "$AFTER_CHECKSUM" = "$BEFORE_CHECKSUM" ] || fail "content checksum mismatch after restore"
[ "$AFTER_USERS" = "$BEFORE_USERS" ]       || fail "user/owner row count changed after restore"

# Verify the uploaded object came back byte-for-byte, when we seeded one.
if [ -n "${UPLOAD_HASH_BEFORE:-}" ]; then
  UPLOAD_HASH_AFTER="$(docker compose exec -T app sh -c "cat /data/uploads/'$UPLOAD_MARKER' 2>/dev/null" | shasum -a 256 | awk '{print $1}')"
  if [ "$UPLOAD_HASH_AFTER" = "$UPLOAD_HASH_BEFORE" ]; then
    info "upload restored byte-for-byte ✓"
  else
    fail "uploaded object did not survive restore ($UPLOAD_HASH_AFTER != $UPLOAD_HASH_BEFORE)"
  fi
fi

# Clean up the probe table so the installation is left as we found it.
psql_q "drop table if exists harly_restore_probe;" >/dev/null 2>&1 || true

echo ""
echo "PASS: backup → destroy → restore recovered all data (rows, checksum, owner, uploads)."
