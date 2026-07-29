import { describe, expect, it } from "vitest";

import { resumeKeyFromUrl } from "./storage-key";

describe("resumeKeyFromUrl", () => {
  it("preserves the workspace namespace of a local upload", () => {
    expect(
      resumeKeyFromUrl(
        "/uploads/workspaces/workspace-a/resumes/file/resume.pdf",
      ),
    ).toBe("workspaces/workspace-a/resumes/file/resume.pdf");
  });

  it("keeps legacy unscoped resume keys readable", () => {
    expect(resumeKeyFromUrl("/uploads/resumes/file/resume.pdf")).toBe(
      "resumes/file/resume.pdf",
    );
  });

  it("recovers keys from private application URLs", () => {
    expect(
      resumeKeyFromUrl(
        "/api/storage/file?key=workspaces%2Fworkspace-a%2Fresumes%2Ffile%2Fresume.pdf",
      ),
    ).toBe("workspaces/workspace-a/resumes/file/resume.pdf");
  });

  it("rejects traversal from private application URLs", () => {
    expect(resumeKeyFromUrl("/api/storage/file?key=workspaces%2Fa%2Fresumes%2F..%2Fsecret")).toBeNull();
  });
});
