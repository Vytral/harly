import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db, integrationHealth, workspaceSettings } from "@harly/db";

import { encryptSecret } from "@/lib/crypto";
import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { getIntegrationHealth } from "@/features/integrations/health/repository";
import { CREDENTIALS_UNREADABLE_MESSAGE } from "@/features/integrations/health/model";

import { sealOutlookAccessToken } from "./token-envelope";

const KEY_A = Buffer.alloc(32, 9).toString("base64");
const KEY_B = Buffer.alloc(32, 3).toString("base64");

function enc(value: string) {
  const { ciphertext, iv, tag } = encryptSecret(value);
  return { ciphertext, iv, tag };
}

const FRESH = () => new Date(Date.now() + 60 * 60_000);

describe.skipIf(!runPipelineIntegration)("outlook connection health and stored credentials", () => {
  let fx: PipelineFixture;

  beforeAll(async () => {
    vi.stubEnv("AI_ENCRYPTION_KEY", KEY_A);
    vi.stubEnv("MICROSOFT_CLIENT_ID", "test-client-id");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-client-secret");
    fx = await createPipelineFixture();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await fx?.cleanup();
  });

  beforeEach(async () => {
    vi.stubEnv("AI_ENCRYPTION_KEY", KEY_A);
    await db.delete(integrationHealth).where(eq(integrationHealth.workspaceId, fx.workspaceId));
    const access = enc(sealOutlookAccessToken("outlook-access-0", FRESH()));
    const refresh = enc("outlook-refresh-0");
    await db
      .insert(workspaceSettings)
      .values({
        organizationId: fx.workspaceId,
        outlookEnabled: true,
        outlookCalendarId: "calendar-1",
        outlookEvents: ["interview.scheduled"],
        outlookAccessTokenCiphertext: access.ciphertext,
        outlookAccessTokenIv: access.iv,
        outlookAccessTokenTag: access.tag,
        outlookRefreshTokenCiphertext: refresh.ciphertext,
        outlookRefreshTokenIv: refresh.iv,
        outlookRefreshTokenTag: refresh.tag,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: {
          outlookEnabled: true,
          outlookAccessTokenCiphertext: access.ciphertext,
          outlookAccessTokenIv: access.iv,
          outlookAccessTokenTag: access.tag,
          outlookRefreshTokenCiphertext: refresh.ciphertext,
          outlookRefreshTokenIv: refresh.iv,
          outlookRefreshTokenTag: refresh.tag,
        },
      });
  });

  async function storedRow() {
    const [row] = await db
      .select({
        enabled: workspaceSettings.outlookEnabled,
        refreshCiphertext: workspaceSettings.outlookRefreshTokenCiphertext,
        accessCiphertext: workspaceSettings.outlookAccessTokenCiphertext,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, fx.workspaceId));
    return row!;
  }

  /** Another process rotated the pair after the caller read its snapshot. */
  async function rotateElsewhere(refreshValue: string) {
    const access = enc(sealOutlookAccessToken("outlook-access-rotated", FRESH()));
    const refresh = enc(refreshValue);
    await db
      .update(workspaceSettings)
      .set({
        outlookAccessTokenCiphertext: access.ciphertext,
        outlookAccessTokenIv: access.iv,
        outlookAccessTokenTag: access.tag,
        outlookRefreshTokenCiphertext: refresh.ciphertext,
        outlookRefreshTokenIv: refresh.iv,
        outlookRefreshTokenTag: refresh.tag,
      })
      .where(eq(workspaceSettings.organizationId, fx.workspaceId));
    return refresh.ciphertext;
  }

  it("a failure from a call that read the old pair does not disable a connection rotated since", async () => {
    const staleRefresh = (await storedRow()).refreshCiphertext!;
    const rotated = await rotateElsewhere("outlook-refresh-rotated");
    vi.resetModules();
    const config = await import("./config");

    await config.recordOutlookCallFailure(
      fx.workspaceId,
      new Error("Microsoft Graph API 401: InvalidAuthenticationToken"),
      staleRefresh,
    );

    const row = await storedRow();
    expect(row.enabled).toBe(true);
    expect(row.refreshCiphertext).toBe(rotated);
    const health = await getIntegrationHealth(fx.workspaceId);
    expect(health.outlook?.state).not.toBe("needs_reconnect");
  });

  it("the same failure disables and records reconnect when the failed pair is still stored", async () => {
    vi.resetModules();
    const config = await import("./config");
    const current = (await storedRow()).refreshCiphertext!;

    const handled = await config.recordOutlookCallFailure(
      fx.workspaceId,
      new Error("Token refresh failed: invalid_grant , AADSTS70008"),
      current,
    );

    expect(handled).toBe(true);
    expect((await storedRow()).enabled).toBe(false);
    expect((await getIntegrationHealth(fx.workspaceId)).outlook?.state).toBe("needs_reconnect");
  });

  it("a Graph 403 without a credential reason is recorded but does not disconnect", async () => {
    vi.resetModules();
    const config = await import("./config");
    const current = (await storedRow()).refreshCiphertext!;
    const body = JSON.stringify({ error: { code: "ErrorAccessDenied", message: "Access to the mailbox is not allowed." } });

    const handled = await config.recordOutlookCallFailure(
      fx.workspaceId,
      new Error(`Microsoft Graph API 403: ${body}`),
      current,
    );

    expect(handled).toBe(false);
    expect((await storedRow()).enabled).toBe(true);
    expect((await getIntegrationHealth(fx.workspaceId)).outlook).toMatchObject({ state: "connected", consecutiveFailures: 1 });
  });

  it("a Graph 403 with a credential reason disconnects", async () => {
    vi.resetModules();
    const config = await import("./config");
    const current = (await storedRow()).refreshCiphertext!;
    const body = JSON.stringify({ error: { code: "InvalidAuthenticationToken", message: "Access token has expired." } });

    await config.recordOutlookCallFailure(fx.workspaceId, new Error(`Microsoft Graph API 403: ${body}`), current);

    expect((await storedRow()).enabled).toBe(false);
  });

  it("stored credentials that cannot be decrypted record an error with the encryption reason, not a reconnect", async () => {
    vi.resetModules();
    const config = await import("./config");
    vi.stubEnv("AI_ENCRYPTION_KEY", KEY_B);
    try {
      const result = await config.getWorkspaceOutlookConfig(fx.workspaceId);

      expect(result).toBeNull();
      const health = (await getIntegrationHealth(fx.workspaceId)).outlook;
      expect(health).toMatchObject({ state: "error", lastError: CREDENTIALS_UNREADABLE_MESSAGE });
      // The connection itself is untouched: restoring the key brings it back.
      expect((await storedRow()).enabled).toBe(true);
    } finally {
      vi.stubEnv("AI_ENCRYPTION_KEY", KEY_A);
    }
  });

  it("a valid stored token still resolves with the right key", async () => {
    vi.resetModules();
    const config = await import("./config");
    const result = await config.getWorkspaceOutlookConfig(fx.workspaceId);
    expect(result).toMatchObject({ accessToken: "outlook-access-0", refreshToken: "outlook-refresh-0" });
  });
});
