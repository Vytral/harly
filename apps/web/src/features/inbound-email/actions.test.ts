import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  getWorkspaceContext: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  candidateMessages: {},
  db: { update: vi.fn() },
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { markInboundReplyRead } from "./actions";

describe("inbound reply actions", () => {
  beforeEach(() => {
    mocks.requirePermission.mockReset();
    mocks.getWorkspaceContext.mockReset();
  });

  it("requires collaboration permission before marking an inbound reply read", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Forbidden"));

    await expect(
      markInboundReplyRead({ messageId: "9a7f5c4e-4b88-40ed-a302-590f5d1c38f2" }),
    ).rejects.toThrow("Forbidden");

    expect(mocks.requirePermission).toHaveBeenCalledWith("collab:write");
    expect(mocks.getWorkspaceContext).not.toHaveBeenCalled();
  });
});
