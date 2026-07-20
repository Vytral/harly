import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  getWorkspaceAuditLogs: vi.fn(),
  logAuditEvent: vi.fn(),
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

import { GET } from "./route";

describe("audit log export", () => {
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
});
