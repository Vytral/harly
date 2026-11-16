import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insert: vi.fn(),
  update: vi.fn(),
  requirePermission: vi.fn(),
  logAuditEvent: vi.fn(),
  sendWorkspaceEmail: vi.fn(),
  provisionMemberSenderIdentity: vi.fn(),
  insertResult: [{ id: "new-member" }] as unknown[],
  getSession: vi.fn(),
}));

function chain(result: () => unknown) {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => resolve(result());
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);
vi.mock("@harly/db", () => {
  const table = new Proxy({}, { get: (_t, p) => String(p) });
  return {
    db: {
      select: () => chain(() => mocks.selectQueue.shift() ?? []),
      insert: (...args: unknown[]) => {
        mocks.insert(...args);
        return chain(() => mocks.insertResult);
      },
      update: (...args: unknown[]) => {
        mocks.update(...args);
        return chain(() => []);
      },
    },
    account: table,
    customRoles: table,
    invitation: table,
    member: table,
    organization: table,
    session: table,
    user: table,
    workspaceSettings: table,
  };
});
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/storage", () => ({ storage: {} }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/email", () => ({ sendWorkspaceEmail: mocks.sendWorkspaceEmail }));
vi.mock("@/lib/email/branding", () => ({
  getWorkspaceEmailBranding: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/public-origin", () => ({
  getHarlyPublicOrigin: () => "https://ats.example.test",
}));
vi.mock("@/lib/logo-convert", () => ({ convertAndStoreLogo: vi.fn() }));
vi.mock("@/features/workspaces/sender-identity", () => ({
  provisionMemberSenderIdentity: mocks.provisionMemberSenderIdentity,
}));
vi.mock("@/features/workspaces/context", () => ({ getWorkspaceContext: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  assignRolePrivilegeError: vi.fn().mockResolvedValue(null),
  manageMemberRolePrivilegeError: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/features/demo/assert-not-demo", () => ({ assertNotDemo: vi.fn() }));
vi.mock("@/features/demo/sandbox-access", () => ({
  assertNotDemoOutsideSandbox: vi.fn(),
}));
vi.mock("@harly/emails", () => ({
  WelcomeEmail: () => null,
  WorkspaceInvitation: () => null,
  workspaceInvitationSubject: () => "subject",
}));

import {
  inviteWorkspaceMemberAction,
  inviteWorkspaceMembersAction,
  joinViaInviteLinkAction,
} from "./actions";

const authUser = { id: "user-owner", name: "Olive Owner", email: "owner@example.test" };

function inviteForm(email: string, role: string) {
  const form = new FormData();
  form.set("email", email);
  form.set("role", role);
  return form;
}

describe("inviting an existing member", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectQueue.length = 0;
    mocks.insertResult = [{ id: "new-member" }];
    mocks.requirePermission.mockResolvedValue({
      organization: { id: "ws-1", name: "Example" },
      user: { id: "user-admin", name: "Admin", email: "admin@example.test" },
      membership: { id: "m-admin" },
    });
  });

  it("does not change the role of an existing member (single invite)", async () => {
    mocks.selectQueue.push([authUser], [{ id: "m-owner" }]);

    const result = await inviteWorkspaceMemberAction(
      { success: false },
      inviteForm("owner@example.test", "viewer"),
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already a member/i);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it("skips existing members in a bulk invite without updating roles", async () => {
    mocks.selectQueue.push([authUser], [{ id: "m-owner" }]);
    const form = new FormData();
    form.set(
      "invites",
      JSON.stringify([{ email: "owner@example.test", role: "viewer" }]),
    );

    const result = await inviteWorkspaceMembersAction({ success: false }, form);

    expect(result.success).toBe(true);
    expect(result.added).toBe(0);
    expect(result.skipped).toEqual([
      { email: "owner@example.test", reason: expect.stringMatching(/already a member/i) },
    ]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("still re-adds a removed user who has no membership", async () => {
    mocks.selectQueue.push([authUser], []);

    const result = await inviteWorkspaceMemberAction(
      { success: false },
      inviteForm("owner@example.test", "viewer"),
    );

    expect(result.success).toBe(true);
    expect(mocks.insert).toHaveBeenCalled();
    expect(mocks.provisionMemberSenderIdentity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ memberId: expect.any(String), userId: "user-owner" }),
    );
  });
});

describe("joinViaInviteLinkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectQueue.length = 0;
    mocks.insertResult = [{ id: "new-member" }];
    mocks.getSession.mockResolvedValue({
      user: { id: "user-new", name: "Nia Newcomer", email: "nia@example.test" },
    });
  });

  it("records member.joined for a person who actually joins", async () => {
    mocks.selectQueue.push(
      [{ organizationId: "ws-1", role: "recruiter", enabled: true }],
      [{ id: "m-new" }],
    );

    const result = await joinViaInviteLinkAction("link-token");

    expect(result).toEqual({ success: true, organizationId: "ws-1" });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        actorId: "user-new",
        action: "member.joined",
        metadata: { via: "invite_link", role: "recruiter" },
      }),
    );
  });

  it("does not log a join (or touch the role) when the person is already a member", async () => {
    mocks.insertResult = [];
    mocks.selectQueue.push(
      [{ organizationId: "ws-1", role: "viewer", enabled: true }],
      [{ id: "m-existing" }],
    );

    const result = await joinViaInviteLinkAction("link-token");

    expect(result.success).toBe(true);
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
