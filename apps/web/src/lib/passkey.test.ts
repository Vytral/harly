import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    userId: string | null;
    challenge: string;
    type: string;
    expiresAt: Date;
  }>,
  nextId: 0,
}));

function matches(row: (typeof state.rows)[number], condition: unknown): boolean {
  if (!condition || typeof condition !== "object") return true;
  const item = condition as { op?: string; field?: string; value?: unknown; conditions?: unknown[] };
  if (item.op === "and") return (item.conditions ?? []).every((part) => matches(row, part));
  const value = row[item.field as keyof typeof row];
  if (item.op === "eq") return value === item.value;
  if (item.op === "isNull") return value === null;
  if (item.op === "gt") return value instanceof Date && value > (item.value as Date);
  if (item.op === "lt") return value instanceof Date && value < (item.value as Date);
  return false;
}

vi.mock("server-only", () => ({}));
vi.mock("@harly/db", () => ({
  db: {
    delete: () => ({
      where: (condition: unknown) => ({
        returning: async () => {
          const matched = state.rows.filter((row) => matches(row, condition));
          state.rows = state.rows.filter((row) => !matches(row, condition));
          return matched.map(({ challenge }) => ({ challenge }));
        },
      }),
    }),
    insert: () => ({
      values: (value: Omit<(typeof state.rows)[number], "id">) => ({
        returning: async () => {
          const row = { ...value, id: `challenge-${++state.nextId}` };
          state.rows.push(row);
          return [row];
        },
      }),
    }),
  },
  passkeys: {},
  passkeyChallenge: {
    id: "id",
    userId: "userId",
    challenge: "challenge",
    type: "type",
    expiresAt: "expiresAt",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
  eq: (field: string, value: unknown) => ({ op: "eq", field, value }),
  gt: (field: string, value: unknown) => ({ op: "gt", field, value }),
  isNull: (field: string) => ({ op: "isNull", field }),
  lt: (field: string, value: unknown) => ({ op: "lt", field, value }),
}));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "https://harly.test" }));

import { consumeChallenge, storeChallenge } from "./passkey";

describe("durable passkey challenges", () => {
  beforeEach(() => {
    state.rows = [];
    state.nextId = 0;
  });

  it("persists an anonymous challenge and consumes it in a separate call", async () => {
    const stored = await storeChallenge(null, "anonymous-challenge", "login");

    expect(state.rows).toHaveLength(1);
    expect(await consumeChallenge(stored.id, null, "login")).toBe("anonymous-challenge");
    expect(state.rows).toHaveLength(0);
  });

  it("allows a challenge to be consumed only once, including concurrently", async () => {
    const stored = await storeChallenge(null, "one-time-challenge", "login");

    const results = await Promise.all([
      consumeChallenge(stored.id, null, "login"),
      consumeChallenge(stored.id, null, "login"),
    ]);

    expect(results.sort()).toEqual([null, "one-time-challenge"]);
  });

  it("rejects expired challenges", async () => {
    const stored = await storeChallenge(null, "expired-challenge", "login");
    state.rows[0]!.expiresAt = new Date(Date.now() - 1);

    expect(await consumeChallenge(stored.id, null, "login")).toBeNull();
  });

  it("keeps outstanding flows isolated by challenge ID, type, and user", async () => {
    const first = await storeChallenge("user-1", "first", "registration");
    const second = await storeChallenge("user-1", "second", "registration");
    const otherUser = await storeChallenge("user-2", "other-user", "registration");

    expect(await consumeChallenge(second.id, "user-1", "registration")).toBe("second");
    expect(await consumeChallenge(first.id, "user-1", "authentication")).toBeNull();
    expect(await consumeChallenge(otherUser.id, "user-1", "registration")).toBeNull();
    expect(await consumeChallenge(first.id, "user-1", "registration")).toBe("first");
  });
});
