import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, integrationHealth } from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { nextHealthAfterFailure, type HealthSnapshot } from "./model";
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
    await recordIntegrationSuccess(workspaceId, "jitsi", start);
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

  it("clears the row when the integration is disconnected", async () => {
    await clearIntegrationHealth(fx.workspaceId, "docuseal");
    const stored = await getIntegrationHealth(fx.workspaceId);
    expect(stored.docuseal).toBeUndefined();
  });
});
