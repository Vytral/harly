# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/docs/package.json apps/docs/package.json
COPY apps/marketing/package.json apps/marketing/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/emails/package.json packages/emails/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validators/package.json packages/validators/package.json
COPY tooling/create-harly/package.json tooling/create-harly/package.json
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=2048 \
    HARLY_URL=http://localhost:3000 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-only-better-auth-secret-000000000000 \
    AI_ENCRYPTION_KEY=build-only-ai-encryption-key-0000000000000 \
    STORAGE_UPLOAD_SECRET=build-only-storage-secret-000000000000000 \
    CRON_SECRET=build-only-cron-secret-000000000000000000 \
    HARLY_SETUP_SECRET=build-only-setup-secret-0000000000000000 \
    HARLY_INITIAL_ADMIN_EMAIL=owner@example.com
RUN --mount=type=cache,id=harly-next-cache,target=/src/apps/web/.next/cache \
    pnpm --filter @harly/create build && pnpm --filter web build
RUN pnpm exec esbuild tooling/runtime/src/entrypoint.ts --bundle --platform=node --format=esm --target=node22 --outfile=/tmp/harly-runtime.mjs

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    UPLOADS_DIR=/data/uploads \
    HARLY_SERVER_PATH=/app/apps/web/server.js
WORKDIR /app
COPY --from=build --chown=node:node /src/apps/web/.next/standalone/ ./
COPY --from=build --chown=node:node /src/apps/web/.next/static/ /app/apps/web/.next/static/
COPY --from=build --chown=node:node /src/apps/web/public/ /app/apps/web/public/
COPY --from=build --chown=node:node /src/packages/db/migrations/ /app/migrations/
COPY --from=build --chown=node:node /tmp/harly-runtime.mjs /app/runtime.mjs
RUN mkdir -p /data/uploads /app/apps/web/.next/cache \
    && chown -R node:node /data /app/apps/web/.next/cache
USER node
EXPOSE 3000
ENTRYPOINT ["node", "/app/runtime.mjs"]
CMD ["serve"]
