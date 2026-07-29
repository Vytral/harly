import { beforeEach, describe, expect, it, vi } from "vitest";

const updateWhere = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const updateSet = vi.hoisted(() => vi.fn(() => ({ where: updateWhere })));
const update = vi.hoisted(() => vi.fn(() => ({ set: updateSet })));
const listCalendars = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => "where") }));
vi.mock("@harly/db", () => ({
  db: { update },
  workspaceSettings: {
    organizationId: "organizationId",
    gcalEnabled: "gcalEnabled",
    gcalRefreshTokenCiphertext: "gcalRefreshTokenCiphertext",
    gcalRefreshTokenIv: "gcalRefreshTokenIv",
    gcalRefreshTokenTag: "gcalRefreshTokenTag",
    updatedAt: "updatedAt",
  },
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({ organization: { id: "workspace-a" } })),
}));
vi.mock("@/lib/gcal/config", () => ({
  getWorkspaceGCalConfig: vi.fn(async () => ({ oauth2Client: {} })),
}));
vi.mock("@/lib/gcal/client", () => ({ listCalendars }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { testGCalConnectionAction } from "./gcal-settings-actions";

describe("Google Calendar settings connection errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the connection and returns a safe message for invalid OAuth client credentials", async () => {
    listCalendars.mockRejectedValueOnce(
      new Error("invalid_client: The provided client secret is invalid."),
    );

    const result = await testGCalConnectionAction();

    expect(result).toEqual({
      ok: false,
      error:
        "Google OAuth credentials are invalid. Update GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET and reconnect Google Calendar.",
    });
    expect(update).toHaveBeenCalledWith(expect.anything());
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        gcalEnabled: false,
        gcalRefreshTokenCiphertext: null,
        gcalRefreshTokenIv: null,
        gcalRefreshTokenTag: null,
      }),
    );
    expect(updateWhere).toHaveBeenCalled();
  });

  it("keeps the reconnect guidance for a revoked refresh token", async () => {
    listCalendars.mockRejectedValueOnce(new Error("invalid_grant"));

    const result = await testGCalConnectionAction();

    expect(result).toEqual({
      ok: false,
      error: "Google revoked this connection. Disconnect and reconnect Google Calendar.",
    });
  });
});
