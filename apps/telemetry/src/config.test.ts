import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig storage selection", () => {
  it("defaults to SQLite", () => {
    expect(loadConfig({}).databaseUrl).toBeUndefined();
  });
  it("prefers TELEMETRY_DATABASE_URL, then DATABASE_URL, then POSTGRES_URL", () => {
    const all = { TELEMETRY_DATABASE_URL: "postgres://a", DATABASE_URL: "postgres://b", POSTGRES_URL: "postgres://c" };
    expect(loadConfig(all).databaseUrl).toBe("postgres://a");
    expect(loadConfig({ DATABASE_URL: "postgres://b", POSTGRES_URL: "postgres://c" }).databaseUrl).toBe("postgres://b");
    expect(loadConfig({ POSTGRES_URL: "postgres://c" }).databaseUrl).toBe("postgres://c");
  });
  it("trusts the proxy by default only on Vercel, and an explicit value wins", () => {
    expect(loadConfig({}).trustProxy).toBe(false);
    expect(loadConfig({ VERCEL: "1" }).trustProxy).toBe(true);
    expect(loadConfig({ VERCEL: "1", TELEMETRY_TRUST_PROXY: "0" }).trustProxy).toBe(false);
  });
});
