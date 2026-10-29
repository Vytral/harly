import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: null as Record<string, string | null> | null,
  recordFailure: vi.fn(),
  storedHealth: {} as Record<string, unknown>,
  encryptionReady: true,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (mocks.row ? [mocks.row] : []),
        }),
      }),
    }),
  },
  workspaceSettings: {
    organizationId: {},
    zoomTokenCiphertext: {},
    zoomTokenIv: {},
    zoomTokenTag: {},
    zoomClientId: {},
    zoomClientSecretCiphertext: {},
    zoomClientSecretIv: {},
    zoomClientSecretTag: {},
    zoomEnabled: {},
    zoomAccountId: {},
    zoomAccountEmail: {},
  },
}));

vi.mock("@/lib/crypto", () => ({
  decryptSecret: ({ ciphertext }: { ciphertext: string }) => {
    if (ciphertext.startsWith("bad:")) throw new Error("bad auth tag");
    return ciphertext.replace(/^enc:/, "");
  },
  isEncryptionConfigured: () => mocks.encryptionReady,
}));

vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationFailure: mocks.recordFailure,
  getIntegrationHealth: async () => mocks.storedHealth,
}));

import { getZoomToken, getZoomTokenState } from "./config";

const DECRYPT_MESSAGE = "Stored credentials cannot be decrypted — check the encryption key";

describe("getZoomTokenState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.encryptionReady = true;
    mocks.row = null;
    mocks.storedHealth = {};
  });

  it("is not_connected, and records nothing, when no access token was ever stored", async () => {
    mocks.row = { zoomTokenCiphertext: null, zoomTokenIv: null, zoomTokenTag: null };
    await expect(getZoomTokenState("workspace-1")).resolves.toEqual({ status: "not_connected" });
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("returns the decrypted token when it is readable", async () => {
    mocks.row = { zoomTokenCiphertext: "enc:access-1", zoomTokenIv: "iv", zoomTokenTag: "tag" };
    await expect(getZoomTokenState("workspace-1")).resolves.toEqual({ status: "ready", token: "access-1" });
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("reports unreadable and records an error with the encryption reason when decryption fails", async () => {
    mocks.row = { zoomTokenCiphertext: "bad:access-1", zoomTokenIv: "iv", zoomTokenTag: "tag" };
    await expect(getZoomTokenState("workspace-1")).resolves.toEqual({ status: "unreadable" });
    expect(mocks.recordFailure).toHaveBeenCalledWith("workspace-1", "zoom", DECRYPT_MESSAGE, {
      kind: "other",
      forceState: "error",
    });
  });

  it("treats a stored token as unreadable when the encryption key is not configured", async () => {
    mocks.encryptionReady = false;
    mocks.row = { zoomTokenCiphertext: "enc:access-1", zoomTokenIv: "iv", zoomTokenTag: "tag" };
    await expect(getZoomTokenState("workspace-1")).resolves.toEqual({ status: "unreadable" });
    expect(mocks.recordFailure).toHaveBeenCalledTimes(1);
  });

  it("getZoomToken keeps its null contract for unreadable tokens", async () => {
    mocks.row = { zoomTokenCiphertext: "bad:access-1", zoomTokenIv: "iv", zoomTokenTag: "tag" };
    await expect(getZoomToken("workspace-1")).resolves.toBeNull();
  });

  it("getZoomToken withholds a stored token while Zoom needs reconnecting", async () => {
    mocks.row = { zoomTokenCiphertext: "enc:access-1", zoomTokenIv: "iv", zoomTokenTag: "tag" };
    mocks.storedHealth = {
      zoom: { state: "needs_reconnect", lastOkAt: null, lastErrorAt: null, lastError: "invalid_grant", consecutiveFailures: 1 },
    };
    await expect(getZoomToken("workspace-1")).resolves.toBeNull();
    // The token is still readable, so the state reader still reports it for the reconnect message.
    await expect(getZoomTokenState("workspace-1")).resolves.toEqual({ status: "ready", token: "access-1" });
  });

  it("getZoomToken withholds a stored token whose credentials are in error", async () => {
    mocks.row = { zoomTokenCiphertext: "enc:access-1", zoomTokenIv: "iv", zoomTokenTag: "tag" };
    mocks.storedHealth = {
      zoom: { state: "error", lastOkAt: null, lastErrorAt: null, lastError: "decrypt", consecutiveFailures: 1 },
    };
    await expect(getZoomToken("workspace-1")).resolves.toBeNull();
  });

  it("getZoomToken returns the token while Zoom is healthy or only degraded", async () => {
    mocks.row = { zoomTokenCiphertext: "enc:access-1", zoomTokenIv: "iv", zoomTokenTag: "tag" };
    mocks.storedHealth = {
      zoom: { state: "degraded", lastOkAt: null, lastErrorAt: null, lastError: "ETIMEDOUT", consecutiveFailures: 3 },
    };
    await expect(getZoomToken("workspace-1")).resolves.toBe("access-1");
  });
});
