import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  updateReturning: vi.fn(),
  set: vi.fn(),
  selectLimit: vi.fn(),
  settingsRows: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
  }),
}));
vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);
vi.mock("@harly/db", () => ({
  securityReauthChallenges: {
    id: "id",
    userId: "userId",
    workspaceId: "workspaceId",
    purpose: "purpose",
    tokenHash: "tokenHash",
    consumedAt: "consumedAt",
    expiresAt: "expiresAt",
  },
  workspaceSettings: { securityReauthMinutes: "minutes", organizationId: "organizationId" },
  db: {
    update: () => ({
      set: (values: unknown) => {
        mocks.set(values);
        return { where: () => ({ returning: mocks.updateReturning }) };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => {
          const rows = mocks.settingsRows;
          return Object.assign([...rows], { limit: async () => rows });
        },
      }),
    }),
  },
}));

import { requireRecentReauth, requireSensitiveReauth } from "./reauth";

const input = { userId: "user-1", workspaceId: "ws-1", purpose: "sensitive_action" };

describe("requireRecentReauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = "raw-token";
    mocks.settingsRows = [];
  });

  it("fails without a cookie and touches nothing", async () => {
    mocks.cookieValue = undefined;
    await expect(requireRecentReauth(input)).resolves.toBe(false);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("marks the token consumed when it is valid", async () => {
    mocks.updateReturning.mockResolvedValue([{ id: "c-1" }]);
    await expect(requireRecentReauth(input)).resolves.toBe(true);
    expect(mocks.set).toHaveBeenCalledWith({ consumedAt: expect.any(Date) });
  });

  it("rejects a token that was already spent (no row updated)", async () => {
    mocks.updateReturning.mockResolvedValue([]);
    await expect(requireRecentReauth(input)).resolves.toBe(false);
  });
});

describe("requireSensitiveReauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = "raw-token";
    mocks.settingsRows = [{ minutes: 15 }];
  });

  it("throws the reauth-required message when the token cannot be spent", async () => {
    mocks.updateReturning.mockResolvedValue([]);
    await expect(requireSensitiveReauth("user-1", "ws-1")).rejects.toThrow(/passkey/i);
  });

  it("resolves when the token is spent successfully", async () => {
    mocks.updateReturning.mockResolvedValue([{ id: "c-1" }]);
    await expect(requireSensitiveReauth("user-1", "ws-1")).resolves.toBeUndefined();
  });
});
