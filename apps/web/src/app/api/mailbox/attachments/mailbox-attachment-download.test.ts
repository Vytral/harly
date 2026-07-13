import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// F2-10: authenticated, workspace-scoped download for mailbox attachments. The
// SELECT is scoped to the caller's workspace, so a row belonging to another
// workspace yields no result (404) rather than serving the file.

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  requirePermission: vi.fn(),
  storageRead: vi.fn(),
  attachmentRows: [] as unknown[],
}));

vi.mock("@harly/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.attachmentRows,
        }),
      }),
    })),
  },
  mailAttachments: {},
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/storage", () => ({
  storage: { read: mocks.storageRead },
}));

import { GET } from "./[attachmentId]/route";

const WORKSPACE_ID = "ws-1";

describe("F2-10 mailbox attachment download authorization", () => {
  it("returns 403 when the caller lacks permission", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
    });
    mocks.requirePermission.mockRejectedValue(new Error("Forbidden"));

    const res = await GET(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ attachmentId: "att-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 for an attachment that does not belong to the workspace", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
    });
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.attachmentRows = []; // no row scoped to this workspace

    const res = await GET(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ attachmentId: "att-other-ws" }),
    });

    expect(res.status).toBe(404);
    expect(mocks.storageRead).not.toHaveBeenCalled();
  });

  it("serves the file bytes with safe headers when authorized", async () => {
    mocks.getWorkspaceContext.mockResolvedValue({
      organization: { id: WORKSPACE_ID },
    });
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.attachmentRows = [
      {
        filename: "cv.pdf",
        contentType: "application/pdf",
        size: 9,
        storageKey: "workspaces/ws-1/mailbox/att-1/cv.pdf",
      },
    ];
    mocks.storageRead.mockResolvedValue(Buffer.from("file-bytes"));

    const res = await GET(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ attachmentId: "att-1" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.storageRead).toHaveBeenCalledWith(
      "workspaces/ws-1/mailbox/att-1/cv.pdf",
    );
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toMatch(/cv\.pdf/);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString()).toBe("file-bytes");
  });
});
