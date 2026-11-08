import type { AddressInfo } from "node:net";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, type App, type Logger } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { Store } from "./db.js";

const ID = "3f1c9a52-8d0e-4b7a-9c1d-2a6e5b8f0d41";
const ID2 = "9b2d6f1e-1c3a-4f55-8a7e-0d4c2b9e7a10";
const TOKEN = "test-stats-token-not-a-real-secret";
const valid = (over: Record<string, unknown> = {}) => ({
  schema: 1,
  event: "install_completed",
  instanceId: ID,
  cliVersion: "0.7.0",
  os: "linux",
  arch: "x64",
  deployMode: "caddy",
  referral: "github",
  ...over,
});

type Ctx = { app: App; store: Store; url: string; logs: string[]; clock: { t: number } };
const running: Ctx[] = [];

async function start(overrides: Partial<Config> = {}): Promise<Ctx> {
  const config = { ...loadConfig({}), statsToken: TOKEN, ...overrides };
  const store = new Store(":memory:");
  const logs: string[] = [];
  const logger: Logger = {
    request: (e) => logs.push(JSON.stringify(e)),
    error: (m) => logs.push(m),
  };
  const clock = { t: Date.parse("2026-11-01T00:00:00Z") };
  const app = createApp({ config, store, logger, now: () => clock.t });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const ctx = { app, store, logs, clock, url: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
  running.push(ctx);
  return ctx;
}

afterEach(async () => {
  for (const c of running.splice(0)) {
    await c.app.close();
    c.store.close();
  }
});

const post = (c: Ctx, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  fetch(`${c.url}/v1/events`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /v1/events", () => {
  it("accepts a valid payload and stores one row", async () => {
    const c = await start();
    const res = await post(c, valid());
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    const rows = c.store.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      instance_id: ID, event: "install_completed", cli_version: "0.7.0", os: "linux", arch: "x64",
      deploy_mode: "caddy", referral: "github", first_seen_at: "2026-11-01T00:00:00.000Z",
    });
  });

  it("accepts a payload without optional fields", async () => {
    const c = await start();
    const minimal: Record<string, unknown> = valid();
    delete minimal.deployMode;
    delete minimal.referral;
    expect((await post(c, minimal)).status).toBe(202);
    expect(c.store.rows()[0]).toMatchObject({ deploy_mode: null, referral: null });
  });

  it.each([
    ["unknown field", valid({ extra: "x" })],
    ["wrong type", valid({ arch: 5 })],
    ["long string", valid({ os: "a".repeat(200) })],
    ["schema 2", valid({ schema: 2 })],
    ["unknown event", valid({ event: "other" })],
    ["non-uuid instanceId", valid({ instanceId: "not-a-uuid" })],
    ["uuid v1", valid({ instanceId: "3f1c9a52-8d0e-1b7a-9c1d-2a6e5b8f0d41" })],
    ["non-semver", valid({ cliVersion: "latest" })],
    ["bad deployMode", valid({ deployMode: "Bad Mode!" })],
    ["bad referral", valid({ referral: "skip" })],
    ["missing field", (() => { const v = valid(); delete (v as Record<string, unknown>).os; return v; })()],
    ["array", [valid()]],
    ["null", null],
  ])("rejects %s with 400", async (_name, body) => {
    const c = await start();
    expect((await post(c, body)).status).toBe(400);
    expect(c.store.rows()).toHaveLength(0);
  });

  it("rejects invalid JSON and empty body with 400", async () => {
    const c = await start();
    expect((await post(c, "{not json")).status).toBe(400);
    expect((await post(c, "")).status).toBe(400);
  });

  it.each([
    ["text/plain"],
    [undefined],
  ])("rejects content-type %s with 415", async (type) => {
    const c = await start();
    const res = await post(c, valid(), type ? { "content-type": type } : {});
    // fetch defaults string bodies to text/plain when unset
    expect(res.status).toBe(415);
  });

  it("accepts content-type with charset", async () => {
    const c = await start();
    expect((await post(c, valid(), { "content-type": "Application/JSON; charset=utf-8" })).status).toBe(202);
  });

  it("is idempotent: same instance twice gives one row and a newer lastSeenAt", async () => {
    const c = await start();
    expect((await post(c, valid())).status).toBe(202);
    c.clock.t += 3600_000;
    expect((await post(c, valid({ cliVersion: "0.7.1" }))).status).toBe(202);
    const rows = c.store.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cli_version: "0.7.1",
      first_seen_at: "2026-11-01T00:00:00.000Z",
      last_seen_at: "2026-11-01T01:00:00.000Z",
    });
    const stats = c.store.stats(new Date(c.clock.t));
    expect(stats.totalInstances).toBe(1);
  });

  it("keeps referral/deployMode when a resend omits them", async () => {
    const c = await start();
    await post(c, valid());
    const minimal: Record<string, unknown> = valid();
    delete minimal.deployMode;
    delete minimal.referral;
    await post(c, minimal);
    expect(c.store.rows()[0]).toMatchObject({ deploy_mode: "caddy", referral: "github" });
  });

  it("returns 413 for oversized bodies without reading everything", async () => {
    const c = await start({ maxBodyBytes: 2048 });
    expect((await post(c, "x".repeat(5000))).status).toBe(413);
    // Chunked upload with no content-length: must be cut off while streaming.
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        `${c.url}/v1/events`,
        { method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" } },
        (res) => { res.resume(); resolve(res.statusCode ?? 0); },
      );
      req.on("error", reject);
      const chunk = "a".repeat(1024);
      for (let i = 0; i < 8; i++) req.write(chunk);
      req.end();
    });
    expect(status).toBe(413);
    expect(c.store.rows()).toHaveLength(0);
  });

  it("answers 503 generically when storage fails", async () => {
    const c = await start();
    c.store.close();
    const res = await post(c, valid());
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: "unavailable" }));
    expect(c.logs.join("\n")).not.toContain(ID);
    expect(c.logs.join("\n")).toContain("storage error");
  });
});

describe("methods and CORS", () => {
  it.each(["GET", "PUT", "DELETE", "PATCH", "OPTIONS"])("%s /v1/events gives 405 with Allow", async (method) => {
    const c = await start();
    const res = await fetch(`${c.url}/v1/events`, { method });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect([...res.headers.keys()].filter((h) => h.startsWith("access-control-"))).toEqual([]);
  });

  it("never emits CORS headers, even for cross-origin requests", async () => {
    const c = await start();
    const res = await post(c, valid(), { "content-type": "application/json", origin: "https://evil.example" });
    expect(res.status).toBe(202);
    expect([...res.headers.keys()].filter((h) => h.startsWith("access-control-"))).toEqual([]);
  });

  it("serves /healthz without touching the database and 404s elsewhere", async () => {
    const c = await start();
    c.store.close();
    const ok = await fetch(`${c.url}/healthz`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("ok");
    expect((await fetch(`${c.url}/nope`)).status).toBe(404);
  });
});

describe("rate limiting", () => {
  it("returns 429 with Retry-After and recovers", async () => {
    const c = await start({ rateLimitBurst: 3, rateLimitPerMin: 60 });
    for (let i = 0; i < 3; i++) expect((await post(c, valid())).status).toBe(202);
    const limited = await post(c, valid());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    c.clock.t += 2_000;
    expect((await post(c, valid())).status).toBe(202);
  });

  it("uses X-Forwarded-For only when TELEMETRY_TRUST_PROXY is on", async () => {
    const off = await start({ rateLimitBurst: 1, trustProxy: false });
    const h = (ip: string) => ({ "content-type": "application/json", "x-forwarded-for": ip });
    expect((await post(off, valid(), h("1.1.1.1"))).status).toBe(202);
    expect((await post(off, valid(), h("2.2.2.2"))).status).toBe(429);

    const on = await start({ rateLimitBurst: 1, trustProxy: true });
    expect((await post(on, valid(), h("1.1.1.1, 10.0.0.1"))).status).toBe(202);
    expect((await post(on, valid(), h("2.2.2.2"))).status).toBe(202);
    expect((await post(on, valid(), h("1.1.1.1"))).status).toBe(429);
  });
});

describe("GET /v1/stats", () => {
  const get = (c: Ctx, headers: Record<string, string> = {}) => fetch(`${c.url}/v1/stats`, { headers });

  it("is disabled (404) without a configured token", async () => {
    const c = await start({ statsToken: undefined });
    expect((await get(c, { authorization: `Bearer ${TOKEN}` })).status).toBe(404);
  });

  it("rejects missing or wrong tokens with 401", async () => {
    const c = await start();
    expect((await get(c)).status).toBe(401);
    expect((await get(c, { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await get(c, { authorization: TOKEN })).status).toBe(401);
    expect((await get(c, { authorization: "Bearer " })).status).toBe(401);
  });

  it("returns aggregates only, never instance ids", async () => {
    const c = await start();
    await post(c, valid());
    await post(c, valid({ instanceId: ID2, os: "darwin", arch: "arm64", referral: "friend", deployMode: "local", cliVersion: "0.7.1" }));
    c.clock.t += 40 * 24 * 3600_000;
    await post(c, valid()); // ID is seen again; ID2 becomes inactive
    const res = await get(c, { authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(ID);
    expect(text).not.toContain(ID2);
    expect(JSON.parse(text)).toEqual({
      totalInstances: 2,
      active30d: 1,
      byReferral: { friend: 1, github: 1 },
      byCliVersion: { "0.7.0": 1, "0.7.1": 1 },
      byOsArch: { "darwin/arm64": 1, "linux/x64": 1 },
      byDeployMode: { caddy: 1, local: 1 },
    });
    expect((await fetch(`${c.url}/v1/stats`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(405);
  });
});

describe("privacy", () => {
  it("persists and logs nothing from IP, User-Agent or proxy headers", async () => {
    const c = await start({ trustProxy: true });
    const markers = ["203.0.113.77", "198.51.100.9", "SuperDistinctiveAgent/9.9", "evil-referer.example", "secret-cookie-value"];
    const res = await post(c, valid(), {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.77, 198.51.100.9",
      "x-real-ip": "198.51.100.9",
      "user-agent": "SuperDistinctiveAgent/9.9",
      referer: "https://evil-referer.example/x",
      cookie: "sid=secret-cookie-value",
    });
    expect(res.status).toBe(202);
    await fetch(`${c.url}/v1/stats?token=203.0.113.77`, { headers: { authorization: `Bearer ${TOKEN}` } });
    await fetch(`${c.url}/zzz/203.0.113.77`);
    await new Promise((r) => setTimeout(r, 20));

    const stored = JSON.stringify(c.store.rows()) + JSON.stringify(c.store.stats());
    const logged = c.logs.join("\n");
    for (const m of markers) {
      expect(stored).not.toContain(m);
      expect(logged).not.toContain(m);
    }
    expect(stored).not.toContain("127.0.0.1");
    expect(logged).not.toContain("127.0.0.1");
    expect(c.logs.length).toBeGreaterThanOrEqual(3);
    for (const line of c.logs) expect(JSON.parse(line)).toEqual({ method: expect.any(String), route: expect.any(String), status: expect.any(Number), ms: expect.any(Number) });
    expect(Object.keys(c.store.rows()[0]!).sort()).toEqual(
      ["arch", "cli_version", "deploy_mode", "event", "first_seen_at", "id", "instance_id", "last_seen_at", "os", "referral"],
    );
  });
});
