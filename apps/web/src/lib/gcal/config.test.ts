import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: null as Record<string, string | boolean | null> | null,
  recordFailure: vi.fn(),
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
    gcalEnabled: {},
    gcalAccountEmail: {},
    gcalCalendarId: {},
    gcalRefreshTokenCiphertext: {},
    gcalRefreshTokenIv: {},
    gcalRefreshTokenTag: {},
  },
}));
vi.mock("@/lib/crypto", () => ({
  decryptSecret: ({ ciphertext }: { ciphertext: string }) => {
    if (ciphertext.startsWith("bad:")) throw new Error("bad auth tag");
    return ciphertext.replace(/^enc:/, "");
  },
  isEncryptionConfigured: () => mocks.encryptionReady,
}));
vi.mock("@/lib/public-origin", () => ({
  getHarlyPublicOrigin: () => "https://harly.example.test",
}));
vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationFailure: mocks.recordFailure,
}));

import { getWorkspaceGCalConfig } from "./config";

const DECRYPT_MESSAGE = "Stored credentials cannot be decrypted — check the encryption key";

describe("getWorkspaceGCalConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.test");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    mocks.encryptionReady = true;
    mocks.row = { gcalEnabled: true, gcalCalendarId: "primary", gcalRefreshTokenCiphertext: "enc:refresh-1", gcalRefreshTokenIv: "iv", gcalRefreshTokenTag: "tag" };
  });

  it("returns a config when the refresh token is readable", async () => {
    await expect(getWorkspaceGCalConfig("workspace-1")).resolves.toMatchObject({ calendarId: "primary" });
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("returns null without recording anything when no refresh token was stored", async () => {
    mocks.row = { gcalEnabled: true, gcalCalendarId: "primary", gcalRefreshTokenCiphertext: null, gcalRefreshTokenIv: null, gcalRefreshTokenTag: null };
    await expect(getWorkspaceGCalConfig("workspace-1")).resolves.toBeNull();
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("records an encryption error, not a dead login, when the stored token cannot be decrypted", async () => {
    mocks.row = { ...mocks.row!, gcalRefreshTokenCiphertext: "bad:refresh-1" };
    await expect(getWorkspaceGCalConfig("workspace-1")).resolves.toBeNull();
    expect(mocks.recordFailure).toHaveBeenCalledWith("workspace-1", "gcal", DECRYPT_MESSAGE, {
      kind: "other",
      forceState: "error",
    });
  });

  it("records the same encryption error when the key is not configured", async () => {
    mocks.encryptionReady = false;
    await expect(getWorkspaceGCalConfig("workspace-1")).resolves.toBeNull();
    expect(mocks.recordFailure).toHaveBeenCalledWith("workspace-1", "gcal", DECRYPT_MESSAGE, {
      kind: "other",
      forceState: "error",
    });
  });
});
