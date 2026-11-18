import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; portalEnabled: boolean }>,
  liveSandbox: true,
  requireCandidatePermission: vi.fn(async () => ({
    organization: { id: "sandbox-1" },
    user: { id: "user-1", email: "sandbox-abc@sandbox.harly.dev" },
  })),
  establishPortalSession: vi.fn(async () => {}),
  auditPortalEvent: vi.fn(async () => {}),
  isLiveSandboxWorkspace: vi.fn(async () => mocks.liveSandbox),
  requirePermission: vi.fn(async () => ({ organization: { id: "sandbox-1" } })),
  workspaceContext: { organization: { id: "sandbox-1" } } as { organization: { id: string } } | null,
}));

vi.mock("@harly/db", () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => mocks.rows,
  };
  return {
    db: { select: () => chain },
    candidates: { id: "id", workspaceId: "workspace_id", deletedAt: "deleted_at", createdAt: "created_at" },
    organization: { id: "id", createdAt: "created_at" },
    workspaceSettings: { organizationId: "organization_id", candidatePortalEnabled: "enabled" },
  };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/i18n/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireCandidatePermission: mocks.requireCandidatePermission,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/portal-session", () => ({ establishPortalSession: mocks.establishPortalSession }));
vi.mock("@/lib/portal-credentials", () => ({ auditPortalEvent: mocks.auditPortalEvent }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: async () => mocks.workspaceContext,
}));
vi.mock("./sandbox-state", () => ({ isLiveSandboxWorkspace: mocks.isLiveSandboxWorkspace }));

import {
  openDemoCandidatePortalAction,
  openDemoPortalAsSampleCandidateAction,
} from "./candidate-portal-actions";

const candidateId = "6f1c2c1e-6d7a-4e3b-9a52-6c1d2a0b9e11";

describe("openDemoCandidatePortalAction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.rows = [];
    mocks.liveSandbox = true;
    vi.clearAllMocks();
  });

  it("is rejected when demo mode is off, before any lookup or session", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    mocks.rows = [{ id: candidateId, portalEnabled: true }];
    const result = await openDemoCandidatePortalAction({ candidateId });
    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect(mocks.requireCandidatePermission).not.toHaveBeenCalled();
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });

  it("is rejected when DEMO_MODE is unset", async () => {
    mocks.rows = [{ id: candidateId, portalEnabled: true }];
    const result = await openDemoCandidatePortalAction({ candidateId });
    expect(result.ok).toBe(false);
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });

  it("refuses the shared template or an expired sandbox", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.liveSandbox = false;
    mocks.rows = [{ id: candidateId, portalEnabled: true }];
    const result = await openDemoCandidatePortalAction({ candidateId });
    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });

  it("refuses a candidate the caller cannot view (other sandbox)", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.requireCandidatePermission.mockRejectedValueOnce(new Error("denied"));
    const result = await openDemoCandidatePortalAction({ candidateId });
    expect(result.ok).toBe(false);
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });

  it("refuses candidates that are not part of the seeded sandbox data", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.rows = [];
    const result = await openDemoCandidatePortalAction({ candidateId });
    expect(result).toEqual({ ok: false, error: "seededOnly" });
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });

  it("rejects malformed ids", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const result = await openDemoCandidatePortalAction({ candidateId: "nope" });
    expect(result.ok).toBe(false);
    expect(mocks.requireCandidatePermission).not.toHaveBeenCalled();
  });

  it("signs a seeded candidate of the visitor's own sandbox into the portal", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.rows = [{ id: candidateId, portalEnabled: true }];
    const result = await openDemoCandidatePortalAction({ candidateId });
    expect(result).toEqual({ ok: true, url: "/portal/dashboard" });
    expect(mocks.establishPortalSession).toHaveBeenCalledWith(candidateId, "sandbox-1", undefined);
    expect(mocks.auditPortalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "sandbox-1", action: "portal.demo_preview_opened" }),
    );
  });
});

describe("openDemoPortalAsSampleCandidateAction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.liveSandbox = true;
    mocks.workspaceContext = { organization: { id: "sandbox-1" } };
    vi.clearAllMocks();
  });

  it("is rejected when demo mode is off, before any lookup", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const result = await openDemoPortalAsSampleCandidateAction();
    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });

  it("sends a visitor without a demo workspace to the demo entry", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.workspaceContext = null;
    const result = await openDemoPortalAsSampleCandidateAction();
    expect(result).toEqual({ ok: false, error: "unavailable", enterDemo: true });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });

  it("shows an error, not the demo entry, when the permission lookup fails", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.requirePermission.mockRejectedValueOnce(new Error("lookup failed"));
    const result = await openDemoPortalAsSampleCandidateAction();
    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });

  it("refuses the shared template or an expired sandbox", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.liveSandbox = false;
    const result = await openDemoPortalAsSampleCandidateAction();
    expect(result).toEqual({ ok: false, error: "unavailable", enterDemo: true });
    expect(mocks.establishPortalSession).not.toHaveBeenCalled();
  });
});
