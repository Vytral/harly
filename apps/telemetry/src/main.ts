import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openStore } from "./store.js";

const config = loadConfig();
const store = await openStore(config);
const app = createApp({ config, store });

app.server.listen(config.port, config.host, () => {
  console.log(`storage: ${config.databaseUrl ? "postgres" : "sqlite"}`);
  console.log(`harly telemetry collector listening on ${config.host}:${config.port}`);
  if (config.trustProxy) console.log("TELEMETRY_TRUST_PROXY=1: using the first X-Forwarded-For value for rate limiting only");
  if (!config.statsToken) console.log("TELEMETRY_STATS_TOKEN not set: /v1/stats is disabled");
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, shutting down`);
  await app.close();
  await store.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("uncaughtException", () => {
  console.error("uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", () => {
  console.error("unhandled rejection");
});
