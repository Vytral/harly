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
const invalidateWorkspaceGCalConnection = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/gcal/config", () => ({
  getWorkspaceGCalConfig: vi.fn(async () => ({ oauth2Client: {} })),
  invalidateWorkspaceGCalConnection,
  recordGCalCallFailure: vi.fn(async () => false),
}));
vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationSuccess: vi.fn(async () => undefined),
  clearIntegrationHealth: vi.fn(async () => undefined),
  recordIntegrationFailure: vi.fn(async () => undefined),
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
    // The dead token is cleared through the shared helper, which keeps the
    // enabled intent and records the reason (it is mocked here).
    expect(invalidateWorkspaceGCalConnection).toHaveBeenCalledWith(
      "workspace-a",
      expect.any(Error),
    );
    expect(updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ gcalEnabled: false }),
    );
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
