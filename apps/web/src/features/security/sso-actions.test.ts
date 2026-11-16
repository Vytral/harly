import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWorkspaceContext: vi.fn(),
  assertNotDemo: vi.fn(),
  requireSensitiveReauth: vi.fn(),
  logAuditEvent: vi.fn(),
  registerSSOProvider: vi.fn(),
  updateSSOProvider: vi.fn(),
  deleteSSOProvider: vi.fn(),
  listSSOProviders: vi.fn(),
  verifyDomain: vi.fn(),
}));

vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      registerSSOProvider: mocks.registerSSOProvider,
      updateSSOProvider: mocks.updateSSOProvider,
      deleteSSOProvider: mocks.deleteSSOProvider,
      listSSOProviders: mocks.listSSOProviders,
      verifyDomain: mocks.verifyDomain,
    },
  },
}));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: mocks.assertNotDemo }));
vi.mock("@/server/security/reauth", () => ({ requireSensitiveReauth: mocks.requireSensitiveReauth }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/logger", () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock("@harly/config", () => ({ loadHarlyConfig: () => ({ HARLY_URL: "https://ats.example.test" }) }));
vi.mock("@harly/auth/saml-config", () => ({ validateSamlRegistration: vi.fn() }));

import {
  deleteSSOProviderAction,
  listSSOProvidersAction,
  registerSSOProviderAction,
  verifySSODomainAction,
} from "./sso-actions";

function ctx(roleKey = "owner") {
  return {
    roleKey,
    organization: { id: "ws-1" },
    user: { id: "user-1", email: "owner@example.test" },
  };
}

const oidcInput = {
  providerId: "okta",
  issuer: "https://idp.example.test",
  domain: "example.test",
  oidcConfig: { clientId: "client", clientSecret: "secret" },
};

describe("SSO actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(ctx());
    mocks.getWorkspaceContext.mockResolvedValue(ctx());
    mocks.requireSensitiveReauth.mockResolvedValue(undefined);
    mocks.registerSSOProvider.mockResolvedValue({});
    mocks.listSSOProviders.mockResolvedValue({
      providers: [
        { id: "p1", providerId: "okta", type: "oidc", issuer: "https://idp.example.test", domain: "example.test", organizationId: "ws-1" },
        { id: "p2", providerId: "other-org", type: "oidc", issuer: "https://x.example.test", domain: "x.test", organizationId: "ws-2" },
      ],
    });
  });

  it("registers an OIDC provider for the caller's workspace after reauth and audits it", async () => {
    const result = await registerSSOProviderAction(oidcInput);
    expect(result).toEqual({ ok: true, providerId: "okta" });
    expect(mocks.requireSensitiveReauth).toHaveBeenCalledWith("user-1", "ws-1");
    expect(mocks.registerSSOProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ providerId: "okta", organizationId: "ws-1" }),
      }),
    );
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "sso.provider_registered" }));
  });

  it("refuses registration for non-owners before any reauth or provider call", async () => {
    mocks.requirePermission.mockResolvedValue(ctx("admin"));
    const result = await registerSSOProviderAction(oidcInput);
    expect(result.ok).toBe(false);
    expect(mocks.requireSensitiveReauth).not.toHaveBeenCalled();
    expect(mocks.registerSSOProvider).not.toHaveBeenCalled();
  });

  it("does not register without a fresh passkey reauthentication", async () => {
    mocks.requireSensitiveReauth.mockRejectedValue(new Error("Confirm your identity with a registered passkey"));
    const result = await registerSSOProviderAction(oidcInput);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("passkey") });
    expect(mocks.registerSSOProvider).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("blocks registration on the demo", async () => {
    mocks.assertNotDemo.mockImplementationOnce(() => {
      throw new Error("disabled in the demo");
    });
    const result = await registerSSOProviderAction(oidcInput);
    expect(result.ok).toBe(false);
    expect(mocks.registerSSOProvider).not.toHaveBeenCalled();
  });

  it("surfaces provider API failures without auditing", async () => {
    mocks.registerSSOProvider.mockRejectedValue(new Error("duplicate provider"));
    const result = await registerSSOProviderAction(oidcInput);
    expect(result).toEqual({ ok: false, error: "duplicate provider" });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("lists only this workspace's providers and returns [] on failure", async () => {
    const providers = await listSSOProvidersAction();
    expect(providers.map((p) => p.providerId)).toEqual(["okta"]);

    mocks.listSSOProviders.mockRejectedValue(new Error("boom"));
    await expect(listSSOProvidersAction()).resolves.toEqual([]);
  });

  it("will not delete or verify a provider that belongs to another workspace", async () => {
    expect(await deleteSSOProviderAction("other-org")).toMatchObject({ ok: false });
    expect(await verifySSODomainAction("other-org")).toMatchObject({ ok: false });
    expect(mocks.deleteSSOProvider).not.toHaveBeenCalled();
    expect(mocks.verifyDomain).not.toHaveBeenCalled();
  });

  it("deletes an owned provider for owners and audits it, but not for admins", async () => {
    mocks.requirePermission.mockResolvedValue(ctx("admin"));
    expect((await deleteSSOProviderAction("okta")).ok).toBe(false);
    expect(mocks.deleteSSOProvider).not.toHaveBeenCalled();

    mocks.requirePermission.mockResolvedValue(ctx());
    expect(await deleteSSOProviderAction("okta")).toEqual({ ok: true });
    expect(mocks.deleteSSOProvider).toHaveBeenCalledWith(expect.objectContaining({ body: { providerId: "okta" } }));
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "sso.provider_deleted" }));
  });
});
