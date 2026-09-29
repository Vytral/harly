import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";

import { db, rateLimitBuckets } from "@harly/db";

import { DatabaseStore } from "./ratelimit";

// Needs a migrated Postgres (DATABASE_URL). CI runs it with the other
// integration flows.
const run = process.env.RUN_RATE_LIMIT_INTEGRATION === "1" ? describe : describe.skip;
const prefix = `itest:ratelimit:${Date.now()}`;

run("DatabaseStore", () => {
  const store = new DatabaseStore();

  afterAll(async () => {
    await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, `${prefix}%`));
  });

  it("counts every concurrent hit at the start of a window", async () => {
    const key = `${prefix}:burst`;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => store.consume(key, 3, 60_000)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
  });

  it("restarts an expired window at one", async () => {
    const key = `${prefix}:expired`;
    await store.consume(key, 1, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(store.consume(key, 1, 60_000)).resolves.toMatchObject({ remaining: 0 });
  });
});
