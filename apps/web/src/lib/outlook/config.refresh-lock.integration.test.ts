import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { encryptSecret } from "@/lib/crypto";
import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

import { sealOutlookAccessToken } from "./token-envelope";

const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function enc(value: string) {
  const { ciphertext, iv, tag } = encryptSecret(value);
  return { ciphertext, iv, tag };
}

function tokenResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe.skipIf(!runPipelineIntegration)("outlook refresh across processes", () => {
  let fx: PipelineFixture;
  let exchanges: number;
  let refreshTokenIssued: number;

  beforeAll(async () => {
    vi.stubEnv("AI_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
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
    exchanges = 0;
    refreshTokenIssued = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url !== MICROSOFT_TOKEN_URL) throw new Error(`unexpected fetch ${url}`);
        exchanges += 1;
        // Hold the exchange long enough that the second caller must wait on the lock.
        await new Promise((resolve) => setTimeout(resolve, 150));
        refreshTokenIssued += 1;
        expect(init?.signal).toBeDefined();
        return tokenResponse({
          access_token: `outlook-access-${refreshTokenIssued}`,
          refresh_token: `outlook-refresh-${refreshTokenIssued}`,
          expires_in: 3600,
        });
      }),
    );
  });

  async function seed(accessExpiresAt: Date | null) {
    const access = enc(sealOutlookAccessToken("outlook-access-0", accessExpiresAt));
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
  }

  it("two processes refreshing at once make exactly one exchange and both get the new token", async () => {
    await seed(new Date(Date.now() - 60_000));

    // Two module instances behave like two processes: separate in-process
    // single-flight maps, one shared database.
    vi.resetModules();
    const processA = await import("./config");
    vi.resetModules();
    const processB = await import("./config");

    const [a, b] = await Promise.all([
      processA.getWorkspaceOutlookConfig(fx.workspaceId),
      processB.getWorkspaceOutlookConfig(fx.workspaceId),
    ]);

    expect(exchanges).toBe(1);
    expect(a).toMatchObject({ accessToken: "outlook-access-1", refreshToken: "outlook-refresh-1", calendarId: "calendar-1" });
    expect(b).toMatchObject({ accessToken: "outlook-access-1", refreshToken: "outlook-refresh-1" });

    const [row] = await db
      .select({ refresh: workspaceSettings.outlookRefreshTokenCiphertext })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, fx.workspaceId));
    expect(row.refresh).toBeTruthy();
  });

  it("uses a stored token that is still valid without any network call", async () => {
    await seed(new Date(Date.now() + 60 * 60_000));
    vi.resetModules();
    const config = await import("./config");

    const result = await config.getWorkspaceOutlookConfig(fx.workspaceId);

    expect(exchanges).toBe(0);
    expect(result).toMatchObject({ accessToken: "outlook-access-0", refreshToken: "outlook-refresh-0" });
  });

  it("a revoked grant disconnects the connection and never leaks a stale token", async () => {
    await seed(new Date(Date.now() - 60_000));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => tokenResponse({ error: "invalid_grant", error_description: "AADSTS70008" }, 400)),
    );
    vi.resetModules();
    const config = await import("./config");

    const result = await config.getWorkspaceOutlookConfig(fx.workspaceId);

    expect(result).toBeNull();
    const [row] = await db
      .select({ enabled: workspaceSettings.outlookEnabled })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, fx.workspaceId));
    expect(row.enabled).toBe(false);
  });
});
