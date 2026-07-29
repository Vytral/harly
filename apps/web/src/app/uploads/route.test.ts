import { describe, expect, it, vi } from "vitest";

const { getWorkspaceContextOrNull, requirePermission } = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission,
}));

import { GET } from "./[...key]/route";
import { isPrivateResumeStorageKey } from "@/lib/upload-access";

describe("local upload serving", () => {
  it("classifies resumes as private while leaving images public", () => {
    expect(isPrivateResumeStorageKey("workspaces/ws-1/resumes/cv.pdf")).toBe(true);
    expect(isPrivateResumeStorageKey("resumes/legacy/cv.pdf")).toBe(true);
    expect(isPrivateResumeStorageKey("workspaces/ws-1/images/avatar.png")).toBe(false);
  });

  it("does not serve a resume to an anonymous URL request", async () => {
    getWorkspaceContextOrNull.mockResolvedValue(null);

    const response = await GET(new Request("http://harly.test/uploads/cv.pdf"), {
      params: Promise.resolve({ key: ["workspaces", "ws-1", "resumes", "cv.pdf"] }),
    });

    expect(response.status).toBe(404);
  });

  it("does not serve a resume to a workspace member without candidate access", async () => {
    getWorkspaceContextOrNull.mockResolvedValue({
      organization: { id: "ws-1" },
    });
    requirePermission.mockRejectedValue(new Error("forbidden"));

    const response = await GET(new Request("http://harly.test/uploads/cv.pdf"), {
      params: Promise.resolve({ key: ["workspaces", "ws-1", "resumes", "cv.pdf"] }),
    });

    expect(response.status).toBe(404);
    expect(requirePermission).toHaveBeenCalledWith("candidates:view");
  });
});
