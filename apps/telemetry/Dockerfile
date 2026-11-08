# Build context: apps/telemetry (standalone, no monorepo files needed).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
# Bundle everything (including zod) so the runtime image needs no node_modules.
RUN npx esbuild src/main.ts --bundle --platform=node --format=esm --target=node22 \
    --external:pg-native \
    --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" \
    --outfile=dist/main.js

FROM node:24-alpine
ENV NODE_ENV=production \
    TELEMETRY_HOST=0.0.0.0 \
    TELEMETRY_PORT=8787 \
    TELEMETRY_DB_PATH=/data/telemetry.db
WORKDIR /app
COPY --from=build /app/dist/main.js ./main.js
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null || exit 1
CMD ["node", "main.js"]
