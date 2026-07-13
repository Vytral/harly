import { describe, expect, it } from "vitest";

import {
  getResumeFileValidationError,
  sanitizeFilename,
  createResumeStorageKey,
  maxResumeFileSize,
  allowedResumeContentTypes,
} from "./storage-validation";

describe("getResumeFileValidationError", () => {
  it("returns null for valid PDF", () => {
    const file = new File(["test"], "resume.pdf", { type: "application/pdf" });
    expect(getResumeFileValidationError(file)).toBeNull();
  });

  it("returns null for valid DOC", () => {
    const file = new File(["test"], "resume.doc", { type: "application/msword" });
    expect(getResumeFileValidationError(file)).toBeNull();
  });

  it("returns null for valid DOCX", () => {
    const file = new File(["test"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(getResumeFileValidationError(file)).toBeNull();
  });

  it("rejects unsupported file type", () => {
    const file = new File(["test"], "resume.png", { type: "image/png" });
    const error = getResumeFileValidationError(file);
    expect(error).toContain("PDF, DOC, or DOCX");
  });

  it("rejects empty file", () => {
    const file = new File([], "resume.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "size", { value: 0 });
    const error = getResumeFileValidationError(file);
    expect(error).toContain("required");
  });

  it("rejects oversized file", () => {
    const file = new File(["test"], "resume.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", {
      value: maxResumeFileSize + 1,
    });
    const error = getResumeFileValidationError(file);
    expect(error).toContain("10MB");
  });
});

describe("sanitizeFilename", () => {
  it("preserves simple filename", () => {
    expect(sanitizeFilename("resume.pdf")).toBe("resume.pdf");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFilename("my resume.pdf")).toBe("my-resume.pdf");
  });

  it("replaces path separators with hyphens", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("..-..-etc-passwd");
  });

  it("removes accents and replaces special chars with hyphens", () => {
    expect(sanitizeFilename("résumé!@#.pdf")).toBe("r-sum-.pdf");
  });

  it("falls back for empty input", () => {
    expect(sanitizeFilename("")).toBe("resume");
  });

  it("collapses multiple hyphens", () => {
    expect(sanitizeFilename("lots---of---hyphens.pdf")).toBe("lots-of-hyphens.pdf");
  });
});

describe("createResumeStorageKey", () => {
  it("produces a key namespaced to its workspace", () => {
    const key = createResumeStorageKey("workspace_a", "resume.pdf");
    expect(key).toMatch(/^workspaces\/workspace_a\/resumes\/[\w-]+\/resume\.pdf$/);
  });

  it("sanitizes filename in key", () => {
    const key = createResumeStorageKey("workspace_a", "my résumé!.pdf");
    expect(key).not.toContain("!");
    expect(key).toMatch(/\.pdf$/);
  });

  it("generates unique keys for same filename", () => {
    const key1 = createResumeStorageKey("workspace_a", "resume.pdf");
    const key2 = createResumeStorageKey("workspace_a", "resume.pdf");
    expect(key1).not.toBe(key2);
  });
});

describe("allowedResumeContentTypes", () => {
  it("includes PDF", () => {
    expect(allowedResumeContentTypes).toContain("application/pdf");
  });

  it("includes DOC", () => {
    expect(allowedResumeContentTypes).toContain("application/msword");
  });

  it("includes DOCX", () => {
    expect(allowedResumeContentTypes).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});
