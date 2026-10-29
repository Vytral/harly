import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A stateful stand-in for the one workspace_settings row the refresh touches.
 * Writes merge into it, so a test can see what was persisted and what was not.
 */
const mocks = vi.hoisted(() => {
  const row: Record<string, string | null> = {};
  return {
    row,
    fetch: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    persistFailures: { remaining: 0, always: false },
    getZoomCredentials: vi.fn(),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    logError: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select, update: mocks.update },
  workspaceSettings: {
    organizationId: {},
    zoomTokenCiphertext: {},
    zoomTokenIv: {},
    zoomTokenTag: {},
    zoomRefreshTokenCiphertext: {},
    zoomRefreshTokenIv: {},
    zoomRefreshTokenTag: {},
  },
}));

vi.mock("@/lib/crypto", () => ({
  encryptSecret: (value: string) => ({ ciphertext: `enc:${value}`, iv: "iv", tag: "tag" }),
  decryptSecret: ({ ciphertext }: { ciphertext: string }) => {
    if (ciphertext.startsWith("bad:")) throw new Error("bad auth tag");
    return ciphertext.replace(/^enc:/, "");
  },
  isEncryptionConfigured: () => true,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.logError, warn: vi.fn(), info: vi.fn() }),
}));

vi.mock("./config", () => ({
  getZoomCredentials: mocks.getZoomCredentials,
}));

// The lock itself is covered by oauth.refresh-lock.integration.test.ts. The
// transaction handle supports nested savepoints, as Drizzle's does.
vi.mock("@/server/provider-refresh-lock", () => ({
  withProviderRefreshLock: async (
    _workspaceId: string,
    _provider: string,
    critical: (tx: unknown) => Promise<unknown>,
  ) => {
    const tx: Record<string, unknown> = {
      select: mocks.select,
      update: mocks.update,
      transaction: async (fn: (savepoint: unknown) => Promise<unknown>) => fn(tx),
    };
    return critical(tx);
  },
}));

vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationSuccess: mocks.recordSuccess,
  recordIntegrationFailure: mocks.recordFailure,
}));

vi.stubGlobal("fetch", mocks.fetch);

import { refreshZoomAccessToken } from "./oauth";

const DECRYPT_MESSAGE = "Stored credentials cannot be decrypted — check the encryption key";

let workspaceCounter = 0;
/** A fresh workspace id per test, so module-level state never leaks between tests. */
function freshWorkspace() {
  workspaceCounter += 1;
  return `workspace-${workspaceCounter}`;
}

function seedRow(refreshCiphertext: string | null) {
  for (const key of Object.keys(mocks.row)) delete mocks.row[key];
  mocks.row.zoomTokenCiphertext = null;
  mocks.row.zoomTokenIv = null;
  mocks.row.zoomTokenTag = null;
  mocks.row.zoomRefreshTokenCiphertext = refreshCiphertext;
  mocks.row.zoomRefreshTokenIv = refreshCiphertext ? "iv" : null;
  mocks.row.zoomRefreshTokenTag = refreshCiphertext ? "tag" : null;
}

function storedRefresh(): string | null {
  const ciphertext = mocks.row.zoomRefreshTokenCiphertext;
  return ciphertext ? ciphertext.replace(/^enc:/, "") : null;
}

function tokenResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("refreshZoomAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockReset();
    mocks.persistFailures.remaining = 0;
    mocks.persistFailures.always = false;
    mocks.getZoomCredentials.mockResolvedValue({ clientId: "client-id", clientSecret: "client-secret" });
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          // The reader selects these aliases, so map the stored columns to them.
          limit: async () => [
            {
              accessCiphertext: mocks.row.zoomTokenCiphertext,
              accessIv: mocks.row.zoomTokenIv,
              accessTag: mocks.row.zoomTokenTag,
              refreshCiphertext: mocks.row.zoomRefreshTokenCiphertext,
              refreshIv: mocks.row.zoomRefreshTokenIv,
              refreshTag: mocks.row.zoomRefreshTokenTag,
            },
          ],
        }),
      }),
    }));
    mocks.update.mockImplementation(() => ({
      set: (values: Record<string, string | null>) => ({
        where: async () => {
          if (mocks.persistFailures.always || mocks.persistFailures.remaining > 0) {
            if (mocks.persistFailures.remaining > 0) mocks.persistFailures.remaining -= 1;
            throw new Error("connection terminated unexpectedly");
          }
          Object.assign(mocks.row, values);
        },
      }),
    }));
  });

  it("exchanges the refresh token, persists the rotated pair encrypted and records success", async () => {
    const workspace = freshWorkspace();
    seedRow("enc:refresh-1");
    mocks.fetch.mockResolvedValue(
      tokenResponse(200, { access_token: "access-2", refresh_token: "refresh-2" }),
    );

    const result = await refreshZoomAccessToken(workspace);

    expect(result).toEqual({ ok: true, accessToken: "access-2" });
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://zoom.us/oauth/token");
    expect(String(init.body)).toBe("grant_type=refresh_token&refresh_token=refresh-1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect(mocks.row).toMatchObject({
      zoomTokenCiphertext: "enc:access-2",
      zoomRefreshTokenCiphertext: "enc:refresh-2",
    });
    expect(mocks.recordSuccess).toHaveBeenCalledWith(workspace, "zoom");
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("marks the integration as needing reconnect when Zoom rejects the refresh token", async () => {
    const workspace = freshWorkspace();
    seedRow("enc:refresh-1");
    mocks.fetch.mockResolvedValue(
      tokenResponse(400, { error: "invalid_grant", reason: "Invalid refresh token" }),
    );

    const result = await refreshZoomAccessToken(workspace);

    expect(result).toMatchObject({ ok: false, reason: "auth" });
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      workspace,
      "zoom",
      expect.any(Error),
      { kind: "auth" },
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordSuccess).not.toHaveBeenCalled();
  });

  it("treats a missing stored refresh token as an auth failure without calling Zoom", async () => {
    const workspace = freshWorkspace();
    seedRow(null);

    const result = await refreshZoomAccessToken(workspace);

    expect(result).toMatchObject({ ok: false, reason: "no_refresh_token" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      workspace,
      "zoom",
      expect.any(String),
      { kind: "auth" },
    );
  });

  it("classifies a Zoom outage as transient and keeps the connection state", async () => {
    const workspace = freshWorkspace();
    seedRow("enc:refresh-1");
    mocks.fetch.mockResolvedValue(tokenResponse(503, { reason: "unavailable" }));

    const result = await refreshZoomAccessToken(workspace);

    expect(result).toMatchObject({ ok: false, reason: "transient" });
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      workspace,
      "zoom",
      expect.any(Error),
      { kind: "transient" },
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not call Zoom when credentials are not configured", async () => {
    mocks.getZoomCredentials.mockResolvedValue(null);

    const result = await refreshZoomAccessToken(freshWorkspace());

    expect(result).toMatchObject({ ok: false, reason: "no_credentials" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("shares one in-flight refresh between concurrent callers", async () => {
    seedRow("enc:refresh-1");
    mocks.fetch.mockResolvedValue(
      tokenResponse(200, { access_token: "access-2", refresh_token: "refresh-2" }),
    );
    const workspace = freshWorkspace();

    const [first, second] = await Promise.all([
      refreshZoomAccessToken(workspace),
      refreshZoomAccessToken(workspace),
    ]);

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  describe("rotated token that cannot be persisted", () => {
    it("retries the persist and succeeds when the second attempt works", async () => {
      const workspace = freshWorkspace();
      seedRow("enc:refresh-1");
      mocks.persistFailures.remaining = 1;
      mocks.fetch.mockResolvedValue(
        tokenResponse(200, { access_token: "access-2", refresh_token: "refresh-2" }),
      );

      const result = await refreshZoomAccessToken(workspace);

      expect(result).toEqual({ ok: true, accessToken: "access-2" });
      expect(mocks.update).toHaveBeenCalledTimes(2);
      expect(storedRefresh()).toBe("refresh-2");
      expect(mocks.recordSuccess).toHaveBeenCalledWith(workspace, "zoom");
      expect(mocks.recordFailure).not.toHaveBeenCalled();
    });

    it("keeps the rotated pair, records degraded (not reconnect), and never reuses the spent token", async () => {
      const workspace = freshWorkspace();
      seedRow("enc:refresh-1");
      mocks.persistFailures.always = true;
      mocks.fetch
        .mockResolvedValueOnce(tokenResponse(200, { access_token: "access-2", refresh_token: "refresh-2" }))
        .mockResolvedValueOnce(tokenResponse(200, { access_token: "access-3", refresh_token: "refresh-3" }));

      const first = await refreshZoomAccessToken(workspace);

      // The new access token is valid, so this call still succeeds.
      expect(first).toEqual({ ok: true, accessToken: "access-2" });
      expect(mocks.recordFailure).toHaveBeenLastCalledWith(
        workspace,
        "zoom",
        expect.any(String),
        { kind: "transient", forceState: "degraded" },
      );
      expect(mocks.logError).toHaveBeenCalled();
      // The stored refresh token is still the spent one; nothing was lost.
      expect(storedRefresh()).toBe("refresh-1");

      // The next call retries the persist before it touches the stored token.
      const second = await refreshZoomAccessToken(workspace);
      expect(second).toEqual({ ok: true, accessToken: "access-2" });
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(mocks.recordFailure).toHaveBeenCalledTimes(2);
      for (const [, , , options] of mocks.recordFailure.mock.calls) {
        expect(options).not.toMatchObject({ kind: "auth" });
      }

      // Once Postgres accepts writes again, the rotated pair is saved and used.
      mocks.persistFailures.always = false;
      const third = await refreshZoomAccessToken(workspace);
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      // The pending pair was saved first, so the exchange used refresh-2, not the spent refresh-1.
      const [, init] = mocks.fetch.mock.calls[1] as [string, RequestInit];
      expect(String(init.body)).toContain("refresh_token=refresh-2");
      expect(third).toEqual({ ok: true, accessToken: "access-3" });
      expect(storedRefresh()).toBe("refresh-3");
      expect(mocks.recordSuccess).toHaveBeenCalledWith(workspace, "zoom");
    });

    it("drops the pending pair when another writer has already stored a different token", async () => {
      const workspace = freshWorkspace();
      seedRow("enc:refresh-1");
      mocks.persistFailures.always = true;
      mocks.fetch.mockResolvedValue(
        tokenResponse(200, { access_token: "access-2", refresh_token: "refresh-2" }),
      );
      await refreshZoomAccessToken(workspace);

      // Another process stored its own pair while this one could not persist.
      mocks.persistFailures.always = false;
      seedRow("enc:refresh-other");
      mocks.fetch.mockResolvedValue(
        tokenResponse(200, { access_token: "access-other", refresh_token: "refresh-other-2" }),
      );

      const result = await refreshZoomAccessToken(workspace);

      expect(result).toEqual({ ok: true, accessToken: "access-other" });
      const [, init] = mocks.fetch.mock.calls[1] as [string, RequestInit];
      expect(String(init.body)).toContain("refresh_token=refresh-other");
    });
  });

  describe("stored credentials that cannot be decrypted", () => {
    it("reports the encryption problem instead of a reconnect, and never calls Zoom", async () => {
      const workspace = freshWorkspace();
      seedRow("bad:refresh-1");

      const result = await refreshZoomAccessToken(workspace);

      expect(result).toEqual({ ok: false, reason: "unreadable", error: DECRYPT_MESSAGE });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.recordFailure).toHaveBeenCalledWith(
        workspace,
        "zoom",
        DECRYPT_MESSAGE,
        { kind: "other", forceState: "error" },
      );
    });

    it("does not record anything when no refresh token was ever stored", async () => {
      const workspace = freshWorkspace();
      seedRow(null);
      mocks.fetch.mockResolvedValue(tokenResponse(200, { access_token: "x" }));
      await refreshZoomAccessToken(workspace);
      expect(mocks.recordFailure).not.toHaveBeenCalledWith(
        workspace,
        "zoom",
        DECRYPT_MESSAGE,
        expect.anything(),
      );
    });
  });
});
