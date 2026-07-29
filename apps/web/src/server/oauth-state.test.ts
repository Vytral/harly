import { beforeEach, describe, expect, it, vi } from "vitest";

// (a) OAuth hardening , F1-04 / F2-01 / F2-02.
// Exercises the real oauth-state helpers against an in-memory nonce store to
// prove: reuse fails, expiry fails, and a valid nonce redeems for the same
// actor even across a different browser session.

const mocks = vi.hoisted(() => {
  const store: Array<{
    nonce: string;
    userId: string;
    workspaceId: string;
    provider: string;
    expiresAt: Date;
    consumedAt: Date | null;
  }> = [];
  return { store };
});

vi.mock("@harly/db", () => {
  const row = () => mocks.store.find((r) => !r.consumedAt) ?? undefined;
  return {
    db: {
      insert: () => ({
        values: (v: (typeof mocks.store)[number]) => {
          mocks.store.push({ ...v, consumedAt: null });
          return { returning: async () => [v] };
        },
      }),
      delete: () => ({
        where: async () => {
          // The production predicate removes stale rows and an earlier pending
          // nonce for this actor. This small in-memory adapter only needs to
          // model the resulting bounded store.
          mocks.store.length = 0;
        },
      }),
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [row()] }) }),
      }),
      update: () => ({
        set: () => ({
          where: () => {
            const found = row();
            if (found) found.consumedAt = new Date();
            return { returning: async () => [found] };
          },
        }),
      }),
    },
    oauthStateNonces: { nonce: "oauthStateNonces.nonce", consumedAt: "oauthStateNonces.consumedAt" },
  };
});

import {
  createInstallState,
  verifyAndConsumeOauthStateNonce,
} from "@/server/oauth-state";

const WS = "ws_1";
const USER_A = "user_a";
const USER_B = "user_b";

describe("oauth state nonce", () => {
  beforeEach(() => {
    mocks.store.length = 0;
  });

  it("valid nonce redeems for same user across a different session", async () => {
    const state = await createInstallState({
      userId: USER_A,
      workspaceId: WS,
      provider: "google",
    });

    // A brand-new session for the same user (different object, same id).
    const otherSession = {
      state,
      userId: USER_A,
      workspaceId: WS,
    };
    const check = await verifyAndConsumeOauthStateNonce(otherSession);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.workspaceId).toBe(WS);
  });

  it("reused nonce fails (single-use)", async () => {
    const state = await createInstallState({
      userId: USER_A,
      workspaceId: WS,
      provider: "google",
    });

    const first = await verifyAndConsumeOauthStateNonce({
      state,
      userId: USER_A,
      workspaceId: WS,
    });
    expect(first.ok).toBe(true);

    const second = await verifyAndConsumeOauthStateNonce({
      state,
      userId: USER_A,
      workspaceId: WS,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/used|Unknown/i);
  });

  it("expired nonce fails", async () => {
    const state = await createInstallState({
      userId: USER_A,
      workspaceId: WS,
      provider: "google",
    });

    const row = mocks.store[0];
    expect(row).toBeDefined();
    // Force expiry into the past, bypassing the normal TTL.
    row!.expiresAt = new Date(Date.now() - 60_000);

    const check = await verifyAndConsumeOauthStateNonce({
      state,
      userId: USER_A,
      workspaceId: WS,
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/expired/i);
  });

  it("nonce bound to a different user fails (actor mismatch)", async () => {
    const state = await createInstallState({
      userId: USER_A,
      workspaceId: WS,
      provider: "google",
    });

    const check = await verifyAndConsumeOauthStateNonce({
      state,
      userId: USER_B,
      workspaceId: WS,
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/actor|mismatch/i);
  });

  it("nonce cannot be redeemed by a different integration callback", async () => {
    const state = await createInstallState({
      userId: USER_A,
      workspaceId: WS,
      provider: "google",
    });

    const check = await verifyAndConsumeOauthStateNonce({
      state,
      userId: USER_A,
      workspaceId: WS,
      provider: "slack",
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/provider/i);
  });
});
