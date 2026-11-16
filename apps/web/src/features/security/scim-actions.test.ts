import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  assertNotDemo: vi.fn(),
  requireSensitiveReauth: vi.fn(),
  logAuditEvent: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
  rows: [] as unknown[],
}));

vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);
vi.mock("drizzle-orm", () => ({ and: (...a: unknown[]) => ({ and: a }), eq: (a: unknown, b: unknown) => ({ eq: [a, b] }) }));
vi.mock("@harly/db", () => {
  const select = () => {
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => resolve(mocks.rows),
    };
    q.from = () => q;
    q.where = () => q;
    q.orderBy = () => q;
    return q;
  };
  return {
    db: {
      select,
      insert: () => ({ values: async (v: unknown) => mocks.insertValues(v) }),
      update: () => ({
        set: (v: unknown) => {
          mocks.updateSet(v);
          return { where: async () => undefined };
        },
      }),
    },
    scimTokens: { id: "id", workspaceId: "workspaceId", createdAt: "createdAt" },
  };
});
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: mocks.assertNotDemo }));
vi.mock("@/server/security/reauth", () => ({ requireSensitiveReauth: mocks.requireSensitiveReauth }));
vi.mock("@/server/scim/service", () => ({
  createScimTokenValue: () => ({ raw: "scim_raw_token", prefix: "scim_raw", hash: "hash-1" }),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.logAuditEvent }));

import { createScimTokenAction, listScimTokensAction, revokeScimTokenAction } from "./scim-actions";

function ctx(roleKey = "owner") {
  return {
    roleKey,
    organization: { id: "ws-1" },
    user: { id: "user-1", email: "owner@example.test" },
  };
}

describe("SCIM token actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [];
    mocks.requirePermission.mockResolvedValue(ctx());
    mocks.requireSensitiveReauth.mockResolvedValue(undefined);
  });

  it("lists tokens only behind security:manage", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("denied"));
    await expect(listScimTokensAction()).rejects.toThrow("denied");
    expect(mocks.requirePermission).toHaveBeenCalledWith("security:manage");
  });

  it("creates a token, returns the raw value once and audits it", async () => {
    const result = await createScimTokenAction({ name: "  Okta  " });
    expect(result).toEqual({ ok: true, token: "scim_raw_token" });
    expect(mocks.requireSensitiveReauth).toHaveBeenCalledWith("user-1", "ws-1");
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", name: "Okta", tokenHash: "hash-1", createdBy: "user-1" }),
    );
    // Only the hash and prefix are stored, never the raw secret.
    expect(JSON.stringify(mocks.insertValues.mock.calls)).not.toContain("scim_raw_token");
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "scim.token_created" }));
  });

  it("refuses non-owners without touching the database", async () => {
    mocks.requirePermission.mockResolvedValue(ctx("admin"));
    const result = await createScimTokenAction({ name: "Okta" });
    expect(result.ok).toBe(false);
    expect(mocks.requireSensitiveReauth).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("does not create a token without a fresh reauthentication", async () => {
    mocks.requireSensitiveReauth.mockRejectedValue(new Error("Confirm your identity with a registered passkey"));
    const result = await createScimTokenAction({ name: "Okta" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("passkey") });
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects blank names and past or invalid expirations", async () => {
    expect((await createScimTokenAction({ name: "   " })).ok).toBe(false);
    expect((await createScimTokenAction({ name: "x", expiresAt: "2000-01-01T00:00:00Z" })).ok).toBe(false);
    expect((await createScimTokenAction({ name: "x", expiresAt: "not-a-date" })).ok).toBe(false);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("blocks creation on the demo", async () => {
    mocks.assertNotDemo.mockImplementationOnce(() => {
      throw new Error("demo");
    });
    const result = await createScimTokenAction({ name: "Okta" });
    expect(result.ok).toBe(false);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("revokes for owners only, scoped to the workspace, and audits", async () => {
    mocks.requirePermission.mockResolvedValue(ctx("admin"));
    expect(await revokeScimTokenAction("tok-1")).toMatchObject({ ok: false });
    expect(mocks.updateSet).not.toHaveBeenCalled();

    mocks.requirePermission.mockResolvedValue(ctx());
    expect(await revokeScimTokenAction("tok-1")).toEqual({ ok: true });
    expect(mocks.updateSet).toHaveBeenCalledWith({ revokedAt: expect.any(Date) });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "scim.token_revoked", resourceId: "tok-1", workspaceId: "ws-1" }),
    );
  });
});
