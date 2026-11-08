import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { Config } from "./config.js";
import type { EventStore } from "./store.js";
import { RateLimiter } from "./ratelimit.js";
import { payloadSchema } from "./schema.js";

/** The only thing ever logged: method, route, status and duration. No IP, UA or headers. */
export type Logger = {
  request(entry: { method: string; route: string; status: number; ms: number }): void;
  error(message: string): void;
};

export const consoleLogger: Logger = {
  request: ({ method, route, status, ms }) => console.log(`${method} ${route} ${status} ${ms}ms`),
  error: (message) => console.error(message),
};

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
export type App = { server: http.Server; handler: Handler; close(): Promise<void> };

const ROUTES = new Set(["/v1/events", "/v1/stats", "/healthz", "/readyz"]);

function send(res: http.ServerResponse, status: number, body: unknown, headers: http.OutgoingHttpHeaders = {}): void {
  const isText = typeof body === "string";
  const payload = isText ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(payload);
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function tokenMatches(header: string | undefined, expected: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  // Compare fixed-length digests so neither length nor content leaks through timing.
  return timingSafeEqual(sha256(match?.[1] ?? ""), sha256(expected)) && match !== null;
}

type BodyResult = { ok: true; body: Buffer } | { ok: false; reason: "too_large" | "aborted" };

/** Reads at most `limit` bytes; stops consuming the stream as soon as it is exceeded. */
function readBody(req: http.IncomingMessage, limit: number): Promise<BodyResult> {
  return new Promise((resolve) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) return resolve({ ok: false, reason: "too_large" });
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("close", onClose);
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        cleanup();
        req.pause();
        resolve({ ok: false, reason: "too_large" });
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve({ ok: true, body: Buffer.concat(chunks) });
    };
    const onError = () => {
      cleanup();
      resolve({ ok: false, reason: "aborted" });
    };
    const onClose = () => {
      if (!req.complete) onError();
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("close", onClose);
  });
}

export function createApp(options: { config: Config; store: EventStore; logger?: Logger; now?: () => number }): App {
  const { config, store } = options;
  const logger = options.logger ?? consoleLogger;
  const now = options.now ?? Date.now;
  const limiter = new RateLimiter(config.rateLimitPerMin, config.rateLimitBurst, config.rateLimitMaxKeys, now);

  /** Only used as an in-memory rate-limit input; never stored or logged. */
  function originOf(req: http.IncomingMessage): string {
    if (config.trustProxy) {
      const forwarded = req.headers["x-forwarded-for"];
      const real = req.headers["x-real-ip"];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ||
        (Array.isArray(real) ? real[0] : real)?.trim();
      if (first) return first.slice(0, 64);
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  function throttled(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const wait = limiter.check(originOf(req));
    if (wait === 0) return false;
    send(res, 429, { error: "rate_limited" }, { "retry-after": String(wait) });
    return true;
  }

  async function events(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" }, { allow: "POST" });
    if (throttled(req, res)) return;
    const mediaType = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return send(res, 415, { error: "unsupported_media_type" });
    const result = await readBody(req, config.maxBodyBytes);
    if (!result.ok) {
      if (result.reason === "aborted") return;
      // Stop the client from streaming the rest of an oversized body.
      res.on("finish", () => setImmediate(() => req.destroy()));
      return send(res, 413, { error: "payload_too_large" }, { connection: "close" });
    }
    let json: unknown;
    try {
      json = JSON.parse(result.body.toString("utf8"));
    } catch {
      return send(res, 400, { error: "invalid_json" });
    }
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) return send(res, 400, { error: "invalid_payload" });
    try {
      await store.upsert(parsed.data, new Date(now()));
    } catch {
      logger.error("storage error while saving an event");
      return send(res, 503, { error: "unavailable" });
    }
    send(res, 202, { ok: true });
  }

  async function stats(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!config.statsToken) return send(res, 404, { error: "not_found" });
    if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" }, { allow: "GET" });
    if (throttled(req, res)) return;
    if (!tokenMatches(req.headers.authorization, config.statsToken)) {
      return send(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
    }
    try {
      send(res, 200, await store.stats(new Date(now())));
    } catch {
      logger.error("storage error while reading stats");
      send(res, 503, { error: "unavailable" });
    }
  }

  const handler: Handler = async (req, res) => {
    const started = performance.now();
    const pathname = (req.url ?? "/").split("?")[0] ?? "/";
    const route = ROUTES.has(pathname) ? pathname : "(other)";
    res.on("finish", () => {
      logger.request({ method: (req.method ?? "?").slice(0, 8), route, status: res.statusCode, ms: Math.round(performance.now() - started) });
    });
    try {
      if (pathname === "/v1/events") await events(req, res);
      else if (pathname === "/v1/stats") await stats(req, res);
      else if (pathname === "/readyz" && req.method === "GET") {
        try {
          await store.ping();
          send(res, 200, "ok");
        } catch {
          logger.error("storage health check failed");
          send(res, 503, { error: "unavailable" });
        }
      }
      else if (pathname === "/healthz" && (req.method === "GET" || req.method === "HEAD")) send(res, 200, "ok");
      else send(res, 404, { error: "not_found" });
    } catch {
      logger.error("unexpected error while handling a request");
      if (!res.headersSent) send(res, 500, { error: "internal_error" });
      else res.destroy();
    }
  };

  const server = http.createServer((req, res) => void handler(req, res));
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });

  return {
    server,
    handler,
    close: () =>
      new Promise<void>((resolve) => {
        const force = setTimeout(() => server.closeAllConnections(), 5_000);
        force.unref();
        server.close(() => {
          clearTimeout(force);
          resolve();
        });
        server.closeIdleConnections();
      }),
  };
}
