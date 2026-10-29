import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  getZoomCredentials: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select, update: mocks.update },
  workspaceSettings: {
    organizationId: {},
    zoomRefreshTokenCiphertext: {},
    zoomRefreshTokenIv: {},
    zoomRefreshTokenTag: {},
  },
}));

vi.mock("@/lib/crypto", () => ({
  encryptSecret: (value: string) => ({ ciphertext: `enc:${value}`, iv: "iv", tag: "tag" }),
  decryptSecret: ({ ciphertext }: { ciphertext: string }) => ciphertext.replace(/^enc:/, ""),
  isEncryptionConfigured: () => true,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock("./config", () => ({
  getZoomCredentials: mocks.getZoomCredentials,
}));

// The lock itself is covered by oauth.refresh-lock.integration.test.ts.
vi.mock("@/server/provider-refresh-lock", () => ({
  withProviderRefreshLock: async (
    _workspaceId: string,
    _provider: string,
    critical: (tx: unknown) => Promise<unknown>,
  ) => critical({ select: mocks.select, update: mocks.update }),
}));

vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationSuccess: mocks.recordSuccess,
  recordIntegrationFailure: mocks.recordFailure,
}));

vi.stubGlobal("fetch", mocks.fetch);

import { refreshZoomAccessToken } from "./oauth";

function storedRefreshToken(value: string | null) {
  const row = {
    accessCiphertext: null,
    accessIv: null,
    accessTag: null,
    refreshCiphertext: value ? `enc:${value}` : null,
    refreshIv: value ? "iv" : null,
    refreshTag: value ? "tag" : null,
  };
  mocks.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [row] }) }),
  });
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
    mocks.getZoomCredentials.mockResolvedValue({ clientId: "client-id", clientSecret: "client-secret" });
    mocks.update.mockReturnValue({
      set: (values: unknown) => {
        mocks.set(values);
        return { where: async () => undefined };
      },
    });
  });

  it("exchanges the refresh token, persists the rotated pair encrypted and records success", async () => {
    storedRefreshToken("refresh-1");
    mocks.fetch.mockResolvedValue(
      tokenResponse(200, { access_token: "access-2", refresh_token: "refresh-2" }),
    );

    const result = await refreshZoomAccessToken("workspace-1");

    expect(result).toEqual({ ok: true, accessToken: "access-2" });
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://zoom.us/oauth/token");
    expect(String(init.body)).toBe("grant_type=refresh_token&refresh_token=refresh-1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        zoomTokenCiphertext: "enc:access-2",
        zoomRefreshTokenCiphertext: "enc:refresh-2",
      }),
    );
    expect(mocks.recordSuccess).toHaveBeenCalledWith("workspace-1", "zoom");
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("marks the integration as needing reconnect when Zoom rejects the refresh token", async () => {
    storedRefreshToken("refresh-1");
    mocks.fetch.mockResolvedValue(
      tokenResponse(400, { error: "invalid_grant", reason: "Invalid refresh token" }),
    );

    const result = await refreshZoomAccessToken("workspace-1");

    expect(result).toMatchObject({ ok: false, reason: "auth" });
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "workspace-1",
      "zoom",
      expect.any(Error),
      { kind: "auth" },
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.recordSuccess).not.toHaveBeenCalled();
  });

  it("treats a missing stored refresh token as an auth failure without calling Zoom", async () => {
    storedRefreshToken(null);

    const result = await refreshZoomAccessToken("workspace-1");

    expect(result).toMatchObject({ ok: false, reason: "no_refresh_token" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "workspace-1",
      "zoom",
      expect.any(String),
      { kind: "auth" },
    );
  });

  it("classifies a Zoom outage as transient and keeps the connection state", async () => {
    storedRefreshToken("refresh-1");
    mocks.fetch.mockResolvedValue(tokenResponse(503, { reason: "unavailable" }));

    const result = await refreshZoomAccessToken("workspace-1");

    expect(result).toMatchObject({ ok: false, reason: "transient" });
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "workspace-1",
      "zoom",
      expect.any(Error),
      { kind: "transient" },
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not call Zoom when credentials are not configured", async () => {
    mocks.getZoomCredentials.mockResolvedValue(null);

    const result = await refreshZoomAccessToken("workspace-1");

    expect(result).toMatchObject({ ok: false, reason: "no_credentials" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("shares one in-flight refresh between concurrent callers", async () => {
    storedRefreshToken("refresh-1");
    mocks.fetch.mockResolvedValue(
      tokenResponse(200, { access_token: "access-2", refresh_token: "refresh-2" }),
    );

    const [first, second] = await Promise.all([
      refreshZoomAccessToken("workspace-1"),
      refreshZoomAccessToken("workspace-1"),
    ]);

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});
