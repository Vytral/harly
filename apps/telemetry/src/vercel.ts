import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp, type Handler } from "./app.js";
import { loadConfig } from "./config.js";
import { openStore } from "./store.js";

/**
 * Vercel entry (bundled to api/index.mjs by `pnpm build:vercel`). The exact
 * same request handler as the standalone server, created once per instance.
 * Only method, route, status and duration are logged: never IP or User-Agent.
 */
let cached: Promise<Handler> | undefined;

function init(): Promise<Handler> {
  cached ??= (async () => {
    const config = loadConfig();
    const store = await openStore(config);
    return createApp({ config, store }).handler;
  })().catch((error) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await (await init())(req, res);
  } catch {
    console.error("collector initialization failed");
    if (!res.headersSent) {
      res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
      res.end('{"error":"unavailable"}');
    }
  }
}
