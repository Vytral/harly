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
});
