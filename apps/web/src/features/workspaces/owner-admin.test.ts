import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  redirect: vi.fn(),
  select: vi.fn(),
  getWorkspaceAuditLogs: vi.fn(async () => []),
  logAuditEvent: vi.fn(async () => undefined),
  updateSenderIdentity: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/security/data", () => ({
  getWorkspaceAuditLogs: mocks.getWorkspaceAuditLogs,
}));
vi.mock("@/lib/audit-log", () => ({
  extractRequestMeta: () => ({}),
  logAuditEvent: mocks.logAuditEvent,
}));
vi.mock("@/features/workspaces/sender-identity", () => ({
  provisionMemberSenderIdentity: mocks.updateSenderIdentity,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select, update: vi.fn(), insert: vi.fn(), delete: vi.fn() },
  customRoles: {},
  member: {},
  user: {},
  consentRecords: {},
  candidates: {},
}));

import { ApiError } from "@harly/api";

import {
  requireAnyPagePermission,
  requireOwner,
  requireOwnerOrAdmin,
} from "./permissions-server";
import { updateMemberSenderIdentityAction } from "./sender-identity-actions";

function contextFor(roleKey: string) {
  return {
    organization: { id: "workspace-1" },
    user: { id: "user-1", email: "user@example.test", name: "User" },
    membership: { id: "member-1", role: roleKey },
    role: roleKey,
    roleKey,
    session: {},
  };
}

function selectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

describe("owner and admin helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(selectReturning([]));
  });

  it("requireOwnerOrAdmin admits owners and admins", async () => {
    for (const roleKey of ["owner", "admin"]) {
      mocks.getWorkspaceContext.mockResolvedValue(contextFor(roleKey));
      await expect(requireOwnerOrAdmin()).resolves.toMatchObject({ roleKey });
    }
  });

  it("requireOwnerOrAdmin rejects members and recruiters with a 403 ApiError", async () => {
    for (const roleKey of ["recruiter", "hiring_manager", "custom-role"]) {
      mocks.getWorkspaceContext.mockResolvedValue(contextFor(roleKey));
      const error = await requireOwnerOrAdmin("Only admins.").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 403, message: "Only admins." });
    }
  });

  it("requireOwner admits only the owner", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("owner"));
    await expect(requireOwner()).resolves.toMatchObject({ roleKey: "owner" });

    mocks.getWorkspaceContext.mockResolvedValue(contextFor("admin"));
    await expect(requireOwner()).rejects.toMatchObject({ status: 403 });
  });

  it("requireAnyPagePermission passes when one permission is held and redirects otherwise", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("hiring_manager"));
    // hiring_manager holds documents:read but not templates:manage.
    await requireAnyPagePermission(["documents:read", "templates:manage"]);
    expect(mocks.redirect).not.toHaveBeenCalled();

    await requireAnyPagePermission(["templates:manage", "automations:manage"]);
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("sender identity edits stay owner-only: admins and recruiters get the existing error", async () => {
    for (const roleKey of ["admin", "recruiter"]) {
      mocks.getWorkspaceContext.mockResolvedValue(contextFor(roleKey));
      await expect(
        updateMemberSenderIdentityAction({ memberId: "m-1", localPart: "sales" }),
      ).resolves.toEqual({ success: false, error: "Only the workspace owner can do this." });
    }
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe("owner and admin export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(selectReturning([]));
  });

  it("rejects a recruiter from the audit log export with the existing 403 body", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("recruiter"));
    const { GET } = await import("@/app/api/security/audit-logs/export/route");
    const response = await GET(new Request("https://app.example.test/api/security/audit-logs/export"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only workspace owners and admins can export audit logs.",
    });
    expect(mocks.getWorkspaceAuditLogs).not.toHaveBeenCalled();
  });

  it("rejects a hiring manager from the consent report with the existing 403 body", async () => {
    mocks.getWorkspaceContext.mockResolvedValue(contextFor("hiring_manager"));
    const { GET } = await import("@/app/api/security/consent-report/route");
    const response = await GET(new Request("https://app.example.test/api/security/consent-report"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only workspace owners and admins can export consent reports.",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
