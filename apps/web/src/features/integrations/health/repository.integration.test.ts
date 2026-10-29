import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, integrationHealth } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import {
  FAILURE_WINDOW_MS,
  nextHealthAfterFailure,
  nextHealthAfterSuccess,
  type HealthSnapshot,
} from "./model";
import {
  clearIntegrationHealth,
  getIntegrationAttention,
  getIntegrationHealth,
  recordIntegrationFailure,
  recordIntegrationSuccess,
} from "./repository";

describe.skipIf(!runPipelineIntegration)("integration health repository", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
  });

  it("upserts one row per workspace and integration", async () => {
    await recordIntegrationSuccess(fx.workspaceId, "telegram");
    await recordIntegrationSuccess(fx.workspaceId, "telegram");
    const rows = await db
      .select()
      .from(integrationHealth)
      .where(eq(integrationHealth.workspaceId, fx.workspaceId));
    expect(rows.filter((row) => row.integration === "telegram")).toHaveLength(1);
    const stored = await getIntegrationHealth(fx.workspaceId);
    expect(stored.telegram).toMatchObject({ state: "connected", consecutiveFailures: 0 });
  });

  it("flags an auth failure as needs_reconnect and lists it for attention", async () => {
    await recordIntegrationFailure(
      fx.workspaceId,
      "gcal",
      new Error("invalid_grant: Token has been expired or revoked."),
    );
    const stored = await getIntegrationHealth(fx.workspaceId);
    expect(stored.gcal?.state).toBe("needs_reconnect");
    expect(stored.gcal?.lastError).toContain("invalid_grant");

    const attention = await getIntegrationAttention(fx.workspaceId);
    expect(attention[0]).toMatchObject({
      integration: "gcal",
      state: "needs_reconnect",
      reconnectRequired: true,
    });
  });

  it("matches the pure state machine for a transient failure streak", async () => {
    const workspaceId = fx.workspaceId;
    const start = new Date("2030-05-01T00:00:00.000Z");
    let expected: HealthSnapshot | null = null;
    await recordIntegrationSuccess(workspaceId, "jitsi", { now: start });
    expected = { state: "connected", consecutiveFailures: 0, lastOkAt: start, lastErrorAt: null, lastError: null };

    for (let i = 0; i < 4; i += 1) {
      const now = new Date(start.getTime() + i * 60_000);
      await recordIntegrationFailure(workspaceId, "jitsi", new Error("ETIMEDOUT"), { now });
      expected = nextHealthAfterFailure(expected, { kind: "transient", message: "ETIMEDOUT", now });
    }

    const stored = await getIntegrationHealth(workspaceId);
    expect(stored.jitsi).toMatchObject({
      state: expected.state,
      consecutiveFailures: expected.consecutiveFailures,
    });
    expect(stored.jitsi?.state).toBe("degraded");
  });

  it("resets a failure streak after success and drops the attention entry", async () => {
    const workspaceId = fx.workspaceId;
    await recordIntegrationSuccess(workspaceId, "gcal");
    const attention = await getIntegrationAttention(workspaceId);
    expect(attention.find((item) => item.integration === "gcal")).toBeUndefined();
  });

  it("stores sanitized errors only, never tokens or query strings", async () => {
    await recordIntegrationFailure(
      fx.workspaceId,
      "docuseal",
      new Error("DocuSeal API 401: bad token X-Auth-Token=secret-value at https://sign.example.test/api/templates?token=abc"),
    );
    const stored = await getIntegrationHealth(fx.workspaceId);
    expect(stored.docuseal?.lastError).not.toContain("secret-value");
    expect(stored.docuseal?.lastError).not.toContain("token=abc");
    expect(stored.docuseal?.lastError).toContain("https://sign.example.test/api/templates");
  });

  it("never stores a candidate address that a DocuSeal 422 echoes back", async () => {
    await clearIntegrationHealth(fx.workspaceId, "docuseal");
    await recordIntegrationFailure(
      fx.workspaceId,
      "docuseal",
      new Error('DocuSeal API 422: {"error":"jane.doe@example.com has already signed","email":"jane.doe@example.com"}'),
      { kind: "other" },
    );
    const stored = await getIntegrationHealth(fx.workspaceId);
    expect(stored.docuseal?.lastError).not.toContain("jane.doe");
    expect(stored.docuseal?.lastError).toContain("[email]");
  });

  it("clears the row when the integration is disconnected", async () => {
    await clearIntegrationHealth(fx.workspaceId, "docuseal");
    const stored = await getIntegrationHealth(fx.workspaceId);
    expect(stored.docuseal).toBeUndefined();
  });

  describe("ordering, windows and forced states (SQL mirrors the pure model)", () => {
    const t0 = new Date("2031-01-01T00:00:00.000Z");
    const at = (ms: number) => new Date(t0.getTime() + ms);

    async function fresh(key: "zoom" | "outlook" | "slack") {
      await clearIntegrationHealth(fx.workspaceId, key);
    }

    it("a success that started before a later auth failure does not clear reconnect", async () => {
      await fresh("outlook");
      await recordIntegrationFailure(fx.workspaceId, "outlook", new Error("invalid_grant"), { now: at(1000) });
      await recordIntegrationSuccess(fx.workspaceId, "outlook", { now: at(2000), startedAt: at(0) });

      const stored = await getIntegrationHealth(fx.workspaceId);
      expect(stored.outlook).toMatchObject({ state: "needs_reconnect", consecutiveFailures: 1 });
      expect(stored.outlook?.lastOkAt).toEqual(at(2000));

      const expected = nextHealthAfterSuccess(
        nextHealthAfterFailure(null, { kind: "auth", message: "invalid_grant", now: at(1000) }),
        at(2000),
        at(0),
      );
      expect(stored.outlook).toMatchObject({ state: expected.state, consecutiveFailures: expected.consecutiveFailures });
    });

    it("a success that started after the auth failure clears reconnect", async () => {
      await fresh("outlook");
      await recordIntegrationFailure(fx.workspaceId, "outlook", new Error("invalid_grant"), { now: at(1000) });
      await recordIntegrationSuccess(fx.workspaceId, "outlook", { now: at(3000), startedAt: at(2000) });

      const stored = await getIntegrationHealth(fx.workspaceId);
      expect(stored.outlook).toMatchObject({ state: "connected", consecutiveFailures: 0 });
    });

    it("an expired streak restarts from connected and matches the pure model", async () => {
      await fresh("zoom");
      let expected: HealthSnapshot | null = null;
      for (let i = 0; i < 3; i += 1) {
        const now = at(i * 1000);
        await recordIntegrationFailure(fx.workspaceId, "zoom", new Error("ETIMEDOUT"), { now });
        expected = nextHealthAfterFailure(expected, { kind: "transient", message: "ETIMEDOUT", now });
      }
      expect((await getIntegrationHealth(fx.workspaceId)).zoom?.state).toBe("degraded");

      const later = at(FAILURE_WINDOW_MS * 3);
      await recordIntegrationFailure(fx.workspaceId, "zoom", new Error("ETIMEDOUT"), { now: later });
      expected = nextHealthAfterFailure(expected, { kind: "transient", message: "ETIMEDOUT", now: later });

      const stored = await getIntegrationHealth(fx.workspaceId);
      expect(stored.zoom).toMatchObject({ state: "connected", consecutiveFailures: 1 });
      expect(expected).toMatchObject({ state: "connected", consecutiveFailures: 1 });
    });

    it("a transient streak never downgrades needs_reconnect", async () => {
      await fresh("zoom");
      await recordIntegrationFailure(fx.workspaceId, "zoom", new Error("invalid_grant"), { now: at(0) });
      for (let i = 1; i <= 4; i += 1) {
        await recordIntegrationFailure(fx.workspaceId, "zoom", new Error("ETIMEDOUT"), { now: at(i * 1000) });
      }
      expect((await getIntegrationHealth(fx.workspaceId)).zoom?.state).toBe("needs_reconnect");
    });

    it("concurrent failures at the threshold are not lost", async () => {
      await fresh("slack");
      const now = at(0);
      await Promise.all([
        recordIntegrationFailure(fx.workspaceId, "slack", new Error("ETIMEDOUT"), { now }),
        recordIntegrationFailure(fx.workspaceId, "slack", new Error("ETIMEDOUT"), { now }),
        recordIntegrationFailure(fx.workspaceId, "slack", new Error("ETIMEDOUT"), { now }),
      ]);
      const stored = await getIntegrationHealth(fx.workspaceId);
      expect(stored.slack).toMatchObject({ state: "degraded", consecutiveFailures: 3 });
    });

    it("a forced error state applies at once and keeps the sanitized reason", async () => {
      await fresh("zoom");
      await recordIntegrationFailure(fx.workspaceId, "zoom", "Stored credentials cannot be decrypted — check the encryption key", {
        kind: "other",
        now: at(0),
        forceState: "error",
      });
      const stored = await getIntegrationHealth(fx.workspaceId);
      expect(stored.zoom).toMatchObject({
        state: "error",
        lastError: "Stored credentials cannot be decrypted — check the encryption key",
      });
    });

    it("lastErrorAt and lastError never move backwards for an out-of-order failure", async () => {
      await fresh("slack");
      await recordIntegrationFailure(fx.workspaceId, "slack", new Error("first later"), { kind: "other", now: at(9000) });
      await recordIntegrationFailure(fx.workspaceId, "slack", new Error("older"), { kind: "other", now: at(1000) });
      const stored = await getIntegrationHealth(fx.workspaceId);
      expect(stored.slack?.lastErrorAt).toEqual(at(9000));
      expect(stored.slack?.lastError).toBe("first later");
    });
  });
});
