import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWorkspaceContext: vi.fn(),
  getSession: vi.fn(),
  assertNotDemo: vi.fn(),
  requireSensitiveReauth: vi.fn(),
  logAuditEvent: vi.fn(),
  deleteWhere: vi.fn(),
  insertValues: vi.fn(),
  onConflict: vi.fn(),
}));

vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  ne: (a: unknown, b: unknown) => ({ ne: [a, b] }),
}));
vi.mock("@harly/db", () => ({
  db: {
    delete: () => ({ where: async (w: unknown) => mocks.deleteWhere(w) }),
    insert: () => ({
      values: (v: unknown) => {
        mocks.insertValues(v);
        return { onConflictDoUpdate: async (c: unknown) => mocks.onConflict(c) };
      },
    }),
  },
  passkeys: { id: "passkeys.id", userId: "passkeys.userId" },
  workspaceSettings: { organizationId: "organizationId" },
  oauthProviders: {},
  account: {},
  session: {},
  user: {},
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: vi.fn(), isEncryptionConfigured: () => true }));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: mocks.assertNotDemo }));
vi.mock("@/server/security/reauth", () => ({ requireSensitiveReauth: mocks.requireSensitiveReauth }));

import {
  completeForcedPasswordChangeAction,
  deletePasskeyAction,
  toggleForce2FAAction,
  updateAdvancedSecurityPolicyAction,
  updateEnabledLoginMethodsAction,
} from "./actions";

function ctx(roleKey = "owner") {
  return {
    roleKey,
    organization: { id: "ws-1" },
    user: { id: "user-1", email: "owner@example.test" },
  };
}

describe("security actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(ctx());
    mocks.getWorkspaceContext.mockResolvedValue(ctx());
    mocks.getSession.mockResolvedValue({ user: { id: "user-1", email: "owner@example.test" } });
    mocks.requireSensitiveReauth.mockResolvedValue(undefined);
  });

  describe("deletePasskeyAction", () => {
    it("needs a fresh reauthentication and deletes nothing without it", async () => {
      mocks.requireSensitiveReauth.mockRejectedValue(new Error("reauth"));
      await expect(deletePasskeyAction("pk-1")).rejects.toThrow("reauth");
      expect(mocks.deleteWhere).not.toHaveBeenCalled();
      expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    });

    it("deletes only the caller's passkey and audits it", async () => {
      await deletePasskeyAction("pk-1");
      expect(mocks.requireSensitiveReauth).toHaveBeenCalledWith("user-1", "ws-1");
      expect(JSON.stringify(mocks.deleteWhere.mock.calls[0][0])).toContain("passkeys.userId");
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "passkey.deleted", resourceId: "pk-1" }),
      );
    });

    it("rejects an unauthenticated caller", async () => {
      mocks.getSession.mockResolvedValue(null);
      await expect(deletePasskeyAction("pk-1")).rejects.toThrow("Unauthorized");
      expect(mocks.deleteWhere).not.toHaveBeenCalled();
    });
  });

  describe("toggleForce2FAAction", () => {
    it("is owner-only", async () => {
      mocks.requirePermission.mockResolvedValue(ctx("admin"));
      const result = await toggleForce2FAAction(true);
      expect(result.ok).toBe(false);
      expect(mocks.insertValues).not.toHaveBeenCalled();
    });

    it("requires reauth, then stores the flag and audits at critical severity", async () => {
      expect(await toggleForce2FAAction(true)).toEqual({ ok: true });
      expect(mocks.requireSensitiveReauth).toHaveBeenCalled();
      expect(mocks.insertValues).toHaveBeenCalledWith({ organizationId: "ws-1", require2fa: true });
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "settings.2fa_enforced", severity: "critical" }),
      );
    });

    it("changes nothing when reauth fails", async () => {
      mocks.requireSensitiveReauth.mockRejectedValue(new Error("Confirm your identity"));
      const result = await toggleForce2FAAction(false);
      expect(result).toEqual({ ok: false, error: "Confirm your identity" });
      expect(mocks.insertValues).not.toHaveBeenCalled();
    });
  });

  describe("updateAdvancedSecurityPolicyAction", () => {
    const input = {
      ipAllowlist: [" 10.0.0.0/8 "],
      allowedDomains: ["@Example.test"],
      riskDetectionEnabled: true,
      reauthMinutes: 999,
      requirePasskey: false,
    };

    it("normalizes and stores the policy after reauth", async () => {
      expect(await updateAdvancedSecurityPolicyAction(input)).toEqual({ ok: true });
      expect(mocks.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          securityIpAllowlist: ["10.0.0.0/8"],
          securityAllowedDomains: ["example.test"],
          securityReauthMinutes: 60,
        }),
      );
    });

    it("is owner-only and gated by reauth", async () => {
      mocks.requirePermission.mockResolvedValue(ctx("admin"));
      expect((await updateAdvancedSecurityPolicyAction(input)).ok).toBe(false);
      mocks.requirePermission.mockResolvedValue(ctx());
      mocks.requireSensitiveReauth.mockRejectedValue(new Error("reauth"));
      expect((await updateAdvancedSecurityPolicyAction(input)).ok).toBe(false);
      expect(mocks.insertValues).not.toHaveBeenCalled();
    });
  });

  describe("updateEnabledLoginMethodsAction", () => {
    it("drops unknown methods, keeps canonical order and audits", async () => {
      const result = await updateEnabledLoginMethodsAction(["passkey", "bogus", "password"] as never);
      expect(result).toEqual({ ok: true });
      const stored = mocks.insertValues.mock.calls[0][0].enabledLoginMethods as string[];
      expect(stored).not.toContain("bogus");
      expect(new Set(stored)).toEqual(new Set(["password", "passkey"]));
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "settings.login_methods_updated" }),
      );
    });

    it("records 'auto' for an empty list and rejects non-owners", async () => {
      await updateEnabledLoginMethodsAction([]);
      expect(mocks.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { methods: ["auto"] } }),
      );
      mocks.insertValues.mockClear();
      mocks.requirePermission.mockResolvedValue(ctx("admin"));
      expect((await updateEnabledLoginMethodsAction([])).ok).toBe(false);
      expect(mocks.insertValues).not.toHaveBeenCalled();
    });
  });

  describe("completeForcedPasswordChangeAction", () => {
    it("requires a session and a password of at least 8 characters", async () => {
      mocks.getSession.mockResolvedValue(null);
      expect((await completeForcedPasswordChangeAction({ password: "long-enough-pw" })).ok).toBe(false);
      mocks.getSession.mockResolvedValue({ user: { id: "user-1" }, session: { token: "t" } });
      expect((await completeForcedPasswordChangeAction({ password: "short" })).ok).toBe(false);
    });
  });
});
