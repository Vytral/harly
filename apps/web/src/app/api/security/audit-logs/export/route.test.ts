import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  getWorkspaceAuditLogs: vi.fn(),
  logAuditEvent: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/security/data", () => ({
  getWorkspaceAuditLogs: mocks.getWorkspaceAuditLogs,
}));
vi.mock("@/lib/audit-log", () => ({
  extractRequestMeta: () => ({ ipAddress: "127.0.0.1", userAgent: "test" }),
  logAuditEvent: mocks.logAuditEvent,
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  customRoles: {},
  member: {},
  user: {},
  applications: {},
  candidates: {},
  offers: {},
  interviews: {},
  jobHiringTeam: {},
  jobs: {},
}));

import { GET } from "./route";

/** A query builder whose terminal `limit` resolves to `rows` (custom role lookup). */
function selectReturning(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: async () => rows,
  };
  return builder;
}

describe("audit log export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(selectReturning([]));
  });

  it("allows built-in owners and admins and emits sanitized CSV", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "admin",
      user: { id: "user-1", email: "admin@example.com" },
    });
    mocks.getWorkspaceAuditLogs.mockResolvedValue([
      {
        createdAt: "2026-07-20T12:00:00.000Z",
        action: "mailbox.reply.sent",
        severity: "info",
        actorEmail: "admin@example.com",
        resourceType: "mail_thread",
        resourceId: "thread-1",
        ipAddress: "127.0.0.1",
        userAgent: "test",
        metadata: { sentCopySaved: true },
      },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/security/audit-logs/export?q=mailbox&severity=info",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain(
      "harly-audit-logs-",
    );
    const csv = await response.text();
    expect(csv).toContain("created_at,action,severity");
    expect(csv).toContain("mailbox.reply.sent");
    expect(mocks.getWorkspaceAuditLogs).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ query: "mailbox", severity: "info" }),
    );
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "audit_logs.exported" }),
    );
  });

  it("denies custom roles even when they can view security settings", async () => {
    mocks.getWorkspaceAuditLogs.mockClear();
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "custom-security-reviewer",
      user: { id: "user-2", email: "reviewer@example.com" },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/security/audit-logs/export"),
    );

    expect(response.status).toBe(403);
    expect(mocks.getWorkspaceAuditLogs).not.toHaveBeenCalled();
  });

  it("refuses a DSAR reviewer that lacks security:manage", async () => {
    mocks.getWorkspaceAuditLogs.mockClear();
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "dsar-only",
      user: { id: "user-5", email: "dsaronly@example.com" },
    });
    mocks.select.mockReturnValue(selectReturning([{ permissions: ["dsar:manage"], scope: {} }]));

    const response = await GET(new NextRequest("http://localhost/api/security/audit-logs/export"));

    expect(response.status).toBe(403);
    expect(mocks.getWorkspaceAuditLogs).not.toHaveBeenCalled();
  });

  it("refuses a custom role with settings and security access but no dsar:manage", async () => {
    mocks.getWorkspaceAuditLogs.mockClear();
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "settings-editor",
      user: { id: "user-3", email: "editor@example.com" },
    });
    mocks.select.mockReturnValue(
      selectReturning([{ permissions: ["settings:edit", "security:manage"], scope: {} }]),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/security/audit-logs/export"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Exporting audit logs requires the Review privacy requests and Manage security permissions.",
    });
    expect(mocks.getWorkspaceAuditLogs).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("admits a custom role that holds dsar:manage and security:manage", async () => {
    mocks.getWorkspaceAuditLogs.mockResolvedValue([]);
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "dsar-reviewer",
      user: { id: "user-4", email: "dsar@example.com" },
    });
    mocks.select.mockReturnValue(
      selectReturning([{ permissions: ["dsar:manage", "security:manage"], scope: {} }]),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/security/audit-logs/export?format=json"),
    );

    expect(response.status).toBe(200);
    expect(mocks.getWorkspaceAuditLogs).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ limit: 50_001 }),
    );
  });

  it("refuses the workspace audit log to a scope-restricted role that holds both export permissions", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "scoped-auditor",
      user: { id: "user-1", email: "auditor@example.com" },
    });
    mocks.select.mockReturnValue(
      selectReturning([
        {
          permissions: ["dsar:manage", "security:manage"],
          scope: { jobAccess: "assigned", departments: [], regions: [] },
        },
      ]),
    );

    const response = await GET(new NextRequest("https://app.example.test/api/security/audit-logs/export"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Exporting the audit log requires an unrestricted role scope.",
    });
    expect(mocks.getWorkspaceAuditLogs).not.toHaveBeenCalled();
  });

  it("marks a JSON audit export that reached the row cap as truncated", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "admin",
      user: { id: "user-1", email: "admin@example.com" },
    });
    const entry = {
      id: "log-1",
      actorEmail: "admin@example.com",
      action: "member.updated",
      resourceType: "member",
      resourceId: "m-1",
      ipAddress: null,
      userAgent: null,
      metadata: null,
      severity: "info",
      createdAt: "2026-06-01T12:00:00.000Z",
    };
    mocks.getWorkspaceAuditLogs.mockResolvedValue(
      Array.from({ length: 50_001 }, (_, index) => ({ ...entry, id: `log-${index}` })),
    );

    const response = await GET(
      new NextRequest("https://app.example.test/api/security/audit-logs/export?format=json"),
    );

    expect(mocks.getWorkspaceAuditLogs).toHaveBeenCalledWith("ws-1", expect.objectContaining({ limit: 50_001 }));
    const body = await response.json();
    expect(body.truncated).toBe(true);
    expect(body.logs).toHaveLength(50_000);
  });

  it("flags a truncated CSV audit export in a header", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: "ws-1" },
      roleKey: "admin",
      user: { id: "user-1", email: "admin@example.com" },
    });
    mocks.getWorkspaceAuditLogs.mockResolvedValue(
      Array.from({ length: 50_001 }, (_, index) => ({
        id: `log-${index}`,
        actorEmail: null,
        action: "member.updated",
        resourceType: "member",
        resourceId: null,
        ipAddress: null,
        userAgent: null,
        metadata: null,
        severity: "info",
        createdAt: "2026-06-01T12:00:00.000Z",
      })),
    );

    const response = await GET(new NextRequest("https://app.example.test/api/security/audit-logs/export"));

    expect(response.headers.get("X-Harly-Truncated")).toBe("true");
    const lines = (await response.text()).trimEnd().split("\r\n");
    expect(lines.at(-1)).toMatch(/truncated/i);
  });
});
