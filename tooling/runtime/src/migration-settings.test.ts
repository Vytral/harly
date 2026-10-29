import { describe, expect, it } from "vitest";

import {
  DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
  migrationLockTimeoutMs,
} from "./migration-settings";

describe("migrationLockTimeoutMs", () => {
  it("defaults to 30 seconds", () => {
    expect(migrationLockTimeoutMs({})).toBe(DEFAULT_MIGRATION_LOCK_TIMEOUT_MS);
    expect(DEFAULT_MIGRATION_LOCK_TIMEOUT_MS).toBe(30_000);
    expect(migrationLockTimeoutMs({ HARLY_MIGRATION_LOCK_TIMEOUT_MS: "  " })).toBe(30_000);
  });

  it("accepts a whole number of milliseconds, including 0 to disable", () => {
    expect(migrationLockTimeoutMs({ HARLY_MIGRATION_LOCK_TIMEOUT_MS: "120000" })).toBe(120_000);
    expect(migrationLockTimeoutMs({ HARLY_MIGRATION_LOCK_TIMEOUT_MS: "0" })).toBe(0);
  });

  it("interpolates the parsed number, so notations that parse to an integer are harmless", () => {
    expect(migrationLockTimeoutMs({ HARLY_MIGRATION_LOCK_TIMEOUT_MS: "1e3" })).toBe(1000);
  });

  it("rejects values that could be interpolated into SQL unsafely or make no sense", () => {
    for (const bad of ["-1", "1.5", "abc", "10; drop table x", "NaN", "Infinity"]) {
      expect(() => migrationLockTimeoutMs({ HARLY_MIGRATION_LOCK_TIMEOUT_MS: bad })).toThrow(
        /non-negative integer/,
      );
    }
  });
});
