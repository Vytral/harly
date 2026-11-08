import type { AddressInfo } from "node:net";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PgStore } from "./pgstore.js";
import type { Payload } from "./schema.js";

// Set TELEMETRY_TEST_PG_URL to a disposable database to run these tests.
const url = process.env.TELEMETRY_TEST_PG_URL;
const ID = "3f1c9a52-8d0e-4b7a-9c1d-2a6e5b8f0d41";
const ID2 = "9b2d6f1e-1c3a-4f55-8a7e-0d4c2b9e7a10";
const base: Payload = {
  schema: 1, event: "install_completed", instanceId: ID, cliVersion: "0.7.0",
  os: "linux", arch: "x64", deployMode: "caddy", referral: "github",
};

describe.skipIf(!url)("PgStore (real Postgres)", () => {
  let store: PgStore;
  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: url, max: 1 });
    await admin.query("DROP TABLE IF EXISTS events, telemetry_schema");
    await admin.end();
    store = new PgStore(url!);
  });
  afterAll(async () => {
    await store.close();
  });

  it("migrates idempotently, even concurrently from several instances", async () => {
    const others = [new PgStore(url!), new PgStore(url!), new PgStore(url!)];
    await Promise.all([store, ...others].map((s) => s.migrate()));
    await Promise.all([store, ...others].map((s) => s.migrate()));
    await Promise.all(others.map((s) => s.close()));
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    const v = await pool.query("SELECT version FROM telemetry_schema ORDER BY version");
    const index = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'events' AND indexname = 'events_last_seen_idx'");
    await pool.end();
    expect(v.rows).toEqual([{ version: 1 }, { version: 2 }]);
    expect(index.rows).toEqual([{ indexname: "events_last_seen_idx" }]);
    await expect(store.ping()).resolves.toBeUndefined();
  });

  it("upserts idempotently with UTC timestamps and keeps optional fields", async () => {
    await store.upsert(base, new Date("2026-11-01T00:00:00Z"));
    const rest: Partial<Payload> = { ...base };
    delete rest.deployMode;
    delete rest.referral;
    await store.upsert({ ...(rest as Payload), cliVersion: "0.7.1" }, new Date("2026-11-01T01:00:00Z"));
    const rows = await store.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ instance_id: ID, cli_version: "0.7.1", deploy_mode: "caddy", referral: "github" });
    expect((rows[0]!.first_seen_at as Date).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect((rows[0]!.last_seen_at as Date).toISOString()).toBe("2026-11-01T01:00:00.000Z");
  });

  it("stores a second instance", async () => {
    await store.upsert({ ...base, instanceId: ID2, deployMode: undefined, os: "darwin", arch: "arm64" }, new Date("2026-12-10T00:00:00Z"));
    expect(await store.rows()).toHaveLength(2);
  });

  it("returns the same aggregates as SQLite, without ids", async () => {
    const stats = await store.stats(new Date("2026-12-20T00:00:00Z"));
    expect(JSON.stringify(stats)).not.toContain(ID);
    expect(stats.totalInstances).toBe(2);
    expect(stats.byOsArch).toEqual({ "darwin/arm64": 1, "linux/x64": 1 });
    expect(stats.byDeployMode).toEqual({ caddy: 1, unknown: 1 });
    expect(stats.active30d).toBe(1); // only ID2 was seen in the 30 days before 2026-12-20
  });

  it("works end to end through the HTTP handler", async () => {
    const config = { ...loadConfig({}), statsToken: "fake-test-token" };
    const app = createApp({ config, store, logger: { request() {}, error() {} } });
    await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const id3 = "5c1f0a77-2b64-4d1e-9a30-6f8e1d2c3b44";
    const send = () =>
      fetch(`${origin}/v1/events`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, instanceId: id3 }),
      });
    expect((await send()).status).toBe(202);
    expect((await send()).status).toBe(202);
    const stats = (await (await fetch(`${origin}/v1/stats`, { headers: { authorization: "Bearer fake-test-token" } })).json()) as { totalInstances: number };
    expect(stats.totalInstances).toBe(3);
    expect((await fetch(`${origin}/readyz`)).status).toBe(200);
    await app.close();
  });

  it("answers 503 generically and recovers its error path when the pool is closed", async () => {
    const dead = new PgStore(url!);
    await dead.migrate();
    await dead.close();
    const logs: string[] = [];
    const app = createApp({ config: loadConfig({}), store: dead, logger: { request() {}, error: (m) => logs.push(m) } });
    await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const res = await fetch(`${origin}/v1/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(base) });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"error":"unavailable"}');
    expect((await fetch(`${origin}/readyz`)).status).toBe(503);
    expect(logs.join(" ")).not.toContain(ID);
    await app.close();
  });
});
