#!/bin/sh
# Entry point of the optional `app` and `scheduler` services in compose.dev.yml.
# Both run from the repository mounted at /workspace.
#   dev-app.sh app        migrate, then run the web app in development mode
#   dev-app.sh scheduler  run the production scheduler (tooling/runtime) from source
set -eu

mode=${1:-app}
cd /workspace

if [ ! -f .env.local ]; then
  echo "dev-app: .env.local is missing. Run 'cp .env.example .env.local' first." >&2
  exit 1
fi

# Docker can start a container without its network when the host port it
# publishes is already taken. Fail with the cause instead of a DNS error.
if ! getent hosts postgres >/dev/null 2>&1; then
  echo "dev-app: cannot resolve the postgres service: this container has no network." >&2
  echo "dev-app: its host port is probably in use. Set HARLY_DEV_APP_PORT in .env.local" >&2
  echo "dev-app: to a free port (and HARLY_URL to match), then run 'pnpm dev:container' again." >&2
  exit 1
fi

# .env.local points DATABASE_URL at the host (localhost). Inside the container
# that is the container itself, so reach the postgres service instead. A
# DATABASE_URL already set in the environment wins over .env.local.
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env.local | tail -n 1 | tr -d "\"'")
fi
DATABASE_URL=$(printf '%s' "$DATABASE_URL" |
  sed -E 's#@(localhost|127\.0\.0\.1)(:[0-9]+)?/#@postgres:5432/#')
export DATABASE_URL

case "$mode" in
  app)
    # Put the pnpm version pinned in package.json on PATH; nested scripts call
    # `pnpm` directly. /home/node is a volume, so this runs once.
    mkdir -p "$HOME/.local/bin"
    corepack enable --install-directory "$HOME/.local/bin" pnpm
    export PATH="$HOME/.local/bin:$PATH"

    # Reuse the repository's node_modules when present; install otherwise.
    if [ ! -d node_modules/.pnpm ]; then
      pnpm install --frozen-lockfile
    fi

    pnpm db:migrate
    exec pnpm dev:web
    ;;
  scheduler)
    # Wait for the app to answer, as production waits for its healthcheck,
    # without holding `docker compose up` while the app compiles.
    echo "dev-app: waiting for ${HARLY_INTERNAL_URL}/api/health/ready ..."
    until node -e "fetch(process.env.HARLY_INTERNAL_URL + '/api/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; do
      sleep 5
    done

    # Same code as the scheduler service of the production image, run from
    # source. Variables already in the environment win over .env.local.
    exec node_modules/.bin/tsx --env-file=.env.local tooling/runtime/src/entrypoint.ts scheduler
    ;;
  *)
    echo "dev-app: unknown mode '$mode' (expected app or scheduler)." >&2
    exit 2
    ;;
esac
