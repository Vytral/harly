import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";

import { encryptSecret } from "@/lib/crypto";
import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";

function enc(value: string) {
  const { ciphertext, iv, tag } = encryptSecret(value);
  return { ciphertext, iv, tag };
}

describe.skipIf(!runPipelineIntegration)("zoom refresh across processes", () => {
  let fx: PipelineFixture;
  let exchanges: number;

  beforeAll(async () => {
    vi.stubEnv("AI_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("ZOOM_CLIENT_ID", "test-zoom-client");
    vi.stubEnv("ZOOM_CLIENT_SECRET", "test-zoom-secret");
    fx = await createPipelineFixture();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await fx?.cleanup();
  });

  beforeEach(async () => {
    exchanges = 0;
    const access = enc("zoom-access-0");
    const refresh = enc("zoom-refresh-0");
    await db
      .insert(workspaceSettings)
      .values({
        organizationId: fx.workspaceId,
        zoomEnabled: true,
        zoomTokenCiphertext: access.ciphertext,
        zoomTokenIv: access.iv,
        zoomTokenTag: access.tag,
        zoomRefreshTokenCiphertext: refresh.ciphertext,
        zoomRefreshTokenIv: refresh.iv,
        zoomRefreshTokenTag: refresh.tag,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: {
          zoomTokenCiphertext: access.ciphertext,
          zoomTokenIv: access.iv,
          zoomTokenTag: access.tag,
          zoomRefreshTokenCiphertext: refresh.ciphertext,
          zoomRefreshTokenIv: refresh.iv,
          zoomRefreshTokenTag: refresh.tag,
        },
      });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url !== ZOOM_TOKEN_URL) throw new Error(`unexpected fetch ${url}`);
        exchanges += 1;
        // Zoom rotates the refresh token on every use. Hold the exchange so the
        // second caller must wait on the lock.
        await new Promise((resolve) => setTimeout(resolve, 150));
        return new Response(
          JSON.stringify({
            access_token: `zoom-access-${exchanges}`,
            refresh_token: `zoom-refresh-${exchanges}`,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
  });

  it("two processes refreshing at once rotate the token once and both get the new access token", async () => {
    vi.resetModules();
    const processA = await import("./oauth");
    vi.resetModules();
    const processB = await import("./oauth");

    const [a, b] = await Promise.all([
      processA.refreshZoomAccessToken(fx.workspaceId),
      processB.refreshZoomAccessToken(fx.workspaceId),
    ]);

    expect(exchanges).toBe(1);
    expect(a).toEqual({ ok: true, accessToken: "zoom-access-1" });
    expect(b).toEqual({ ok: true, accessToken: "zoom-access-1" });

    const [row] = await db
      .select({ refresh: workspaceSettings.zoomRefreshTokenCiphertext })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, fx.workspaceId));
    expect(row.refresh).toBeTruthy();
  });

  it("a later refresh uses the rotated token, not the original one", async () => {
    vi.resetModules();
    const oauth = await import("./oauth");

    await oauth.refreshZoomAccessToken(fx.workspaceId);
    const second = await oauth.refreshZoomAccessToken(fx.workspaceId);

    expect(exchanges).toBe(2);
    expect(second).toEqual({ ok: true, accessToken: "zoom-access-2" });
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[1][1].body)).toContain("refresh_token=zoom-refresh-1");
  });
});
