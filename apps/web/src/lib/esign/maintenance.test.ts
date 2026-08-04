import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { execute: mocks.execute },
}));

import { purgeExpiredSignatureDataGlobally } from "./maintenance";

describe("purgeExpiredSignatureDataGlobally", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue([]);
  });

  it("serializes the retention cutoff for the postgres driver", async () => {
    const cutoff = new Date("2026-08-04T00:48:55.766Z");

    await purgeExpiredSignatureDataGlobally(cutoff);

    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    expect(query.params).toEqual([
      cutoff.toISOString(),
      cutoff.toISOString(),
      cutoff.toISOString(),
    ]);
    expect(query.params.every((param) => typeof param === "string")).toBe(true);
  });
});
