import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  storageRead: vi.fn(),
  list: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: async () => ({
    organization: { id: "ws-1" },
    user: { id: "user-1", email: "user@example.test" },
  }),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/storage", () => ({ storage: { read: mocks.storageRead } }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/features/mailbox/data", () => ({ mailThreadScopeSql: () => "scope-sentinel" }));
vi.mock("@/features/search/workspace-search", () => ({ resolveSearchActor: async () => ({}) }));
vi.mock("@/lib/mailbox/attachment-access", () => ({
  listWorkspaceMailboxAttachments: mocks.list,
}));

import { GET } from "./[messageId]/[index]/route";

const ATTACHMENTS = [
  { id: "att-1", filename: "a.pdf", contentType: "application/pdf", size: 3, storageKey: "k/a" },
  { id: "att-2", filename: "b.pdf", contentType: "application/pdf", size: 3, storageKey: "k/b" },
];

beforeEach(() => {
  mocks.requirePermission.mockReset().mockResolvedValue(undefined);
  mocks.storageRead.mockReset().mockResolvedValue(Buffer.from("abc"));
  mocks.list.mockReset().mockResolvedValue(ATTACHMENTS);
  mocks.audit.mockReset();
});

describe("inbound attachment download", () => {
  it("serves the attachment at the index with nosniff and records an audit event", async () => {
    const res = await GET(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ messageId: "msg-1", index: "1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.storageRead).toHaveBeenCalledWith("k/b");
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", threadScope: "scope-sentinel" }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mailbox.attachment.downloaded",
        resourceType: "mail_attachment",
        resourceId: "att-2",
      }),
    );
  });

  it("does not audit a missing attachment", async () => {
    const res = await GET(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ messageId: "msg-1", index: "5" }),
    });
    expect(res.status).toBe(404);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
