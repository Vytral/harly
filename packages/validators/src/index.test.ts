import { describe, expect, it } from "vitest";

import {
  allowedImageContentTypes,
  allowedResumeContentTypes,
  imageUploadRequestSchema,
  invitationSchema,
  inviteEmailSchema,
  maxImageFileSize,
  maxResumeFileSize,
  optionalHttpsUrlSchema,
  optionalNonNegativeIntSchema,
  optionalTrimmedString,
  resumeUploadRequestSchema,
} from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// resumeUploadRequestSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("resumeUploadRequestSchema", () => {
  const valid = {
    filename: "ada-lovelace-resume.pdf",
    contentType: "application/pdf" as const,
    contentLength: 1024,
  };

  it("accepts a valid PDF upload request", () => {
    expect(resumeUploadRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid DOC upload request", () => {
    expect(
      resumeUploadRequestSchema.safeParse({
        ...valid,
        contentType: "application/msword",
      }).success,
    ).toBe(true);
  });

  it("accepts a valid DOCX upload request", () => {
    expect(
      resumeUploadRequestSchema.safeParse({
        ...valid,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }).success,
    ).toBe(true);
  });

  it("rejects an unsupported content type", () => {
    const result = resumeUploadRequestSchema.safeParse({
      ...valid,
      contentType: "image/png",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty filename", () => {
    const result = resumeUploadRequestSchema.safeParse({
      ...valid,
      filename: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a filename longer than 255 characters", () => {
    const result = resumeUploadRequestSchema.safeParse({
      ...valid,
      filename: "a".repeat(256) + ".pdf",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive content length", () => {
    expect(
      resumeUploadRequestSchema.safeParse({ ...valid, contentLength: 0 }).success,
    ).toBe(false);
    expect(
      resumeUploadRequestSchema.safeParse({ ...valid, contentLength: -1 }).success,
    ).toBe(false);
  });

  it("rejects a content length exceeding the 10 MB limit", () => {
    const result = resumeUploadRequestSchema.safeParse({
      ...valid,
      contentLength: maxResumeFileSize + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a content length exactly at the 10 MB limit", () => {
    expect(
      resumeUploadRequestSchema.safeParse({
        ...valid,
        contentLength: maxResumeFileSize,
      }).success,
    ).toBe(true);
  });

  it("rejects a non-integer content length", () => {
    const result = resumeUploadRequestSchema.safeParse({
      ...valid,
      contentLength: 1024.5,
    });
    expect(result.success).toBe(false);
  });

  it("trims leading/trailing whitespace from the filename", () => {
    const result = resumeUploadRequestSchema.safeParse({
      ...valid,
      filename: "  resume.pdf  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filename).toBe("resume.pdf");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// imageUploadRequestSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("imageUploadRequestSchema", () => {
  const valid = {
    filename: "logo.png",
    contentType: "image/png" as const,
    contentLength: 512,
  };

  it("accepts PNG", () => {
    expect(imageUploadRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts JPEG", () => {
    expect(
      imageUploadRequestSchema.safeParse({ ...valid, contentType: "image/jpeg" })
        .success,
    ).toBe(true);
  });

  it("accepts SVG", () => {
    expect(
      imageUploadRequestSchema.safeParse({
        ...valid,
        contentType: "image/svg+xml",
      }).success,
    ).toBe(true);
  });

  it("accepts WEBP", () => {
    expect(
      imageUploadRequestSchema.safeParse({ ...valid, contentType: "image/webp" })
        .success,
    ).toBe(true);
  });

  it("rejects a PDF (wrong type for images)", () => {
    const result = imageUploadRequestSchema.safeParse({
      ...valid,
      contentType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a content length exceeding the 5 MB limit", () => {
    const result = imageUploadRequestSchema.safeParse({
      ...valid,
      contentLength: maxImageFileSize + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a content length exactly at the 5 MB limit", () => {
    expect(
      imageUploadRequestSchema.safeParse({
        ...valid,
        contentLength: maxImageFileSize,
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// allowedResumeContentTypes constant
// ─────────────────────────────────────────────────────────────────────────────

describe("allowedResumeContentTypes", () => {
  it("contains exactly three entries", () => {
    expect(allowedResumeContentTypes).toHaveLength(3);
  });

  it("includes application/pdf", () => {
    expect(allowedResumeContentTypes).toContain("application/pdf");
  });

  it("includes application/msword", () => {
    expect(allowedResumeContentTypes).toContain("application/msword");
  });

  it("includes the DOCX mime type", () => {
    expect(allowedResumeContentTypes).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("does NOT include image types", () => {
    expect(allowedResumeContentTypes).not.toContain("image/png");
    expect(allowedResumeContentTypes).not.toContain("image/jpeg");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// allowedImageContentTypes constant
// ─────────────────────────────────────────────────────────────────────────────

describe("allowedImageContentTypes", () => {
  it("contains exactly four entries", () => {
    expect(allowedImageContentTypes).toHaveLength(4);
  });

  it("includes image/png, image/jpeg, image/svg+xml, image/webp", () => {
    expect(allowedImageContentTypes).toContain("image/png");
    expect(allowedImageContentTypes).toContain("image/jpeg");
    expect(allowedImageContentTypes).toContain("image/svg+xml");
    expect(allowedImageContentTypes).toContain("image/webp");
  });

  it("does NOT include application/pdf", () => {
    expect(allowedImageContentTypes).not.toContain("application/pdf");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inviteEmailSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("inviteEmailSchema", () => {
  it("accepts a valid email", () => {
    const result = inviteEmailSchema.safeParse("Ada@Example.COM");
    expect(result.success).toBe(true);
  });

  it("lowercases the email", () => {
    const result = inviteEmailSchema.safeParse("Ada@Example.COM");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("ada@example.com");
    }
  });

  it("trims whitespace before validating", () => {
    const result = inviteEmailSchema.safeParse("  ada@example.com  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("ada@example.com");
    }
  });

  it("rejects a plain string that is not an email", () => {
    expect(inviteEmailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects an email missing the domain", () => {
    expect(inviteEmailSchema.safeParse("ada@").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(inviteEmailSchema.safeParse("").success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// invitationSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("invitationSchema", () => {
  it("accepts a valid invitation with default role", () => {
    const result = invitationSchema.safeParse({ email: "ada@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("recruiter");
    }
  });

  it("accepts each valid role", () => {
    for (const role of ["admin", "recruiter", "hiring_manager"] as const) {
      const result = invitationSchema.safeParse({
        email: "ada@example.com",
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid role", () => {
    const result = invitationSchema.safeParse({
      email: "ada@example.com",
      role: "owner",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email", () => {
    const result = invitationSchema.safeParse({ role: "admin" });
    expect(result.success).toBe(false);
  });

  it("lowercases and trims the email", () => {
    const result = invitationSchema.safeParse({
      email: "  Ada@Example.COM  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ada@example.com");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// optionalTrimmedString
// ─────────────────────────────────────────────────────────────────────────────

describe("optionalTrimmedString", () => {
  it("returns the trimmed value when input is a non-blank string", () => {
    const result = optionalTrimmedString.safeParse("  hello world  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("hello world");
    }
  });

  it("returns undefined for a blank string", () => {
    const result = optionalTrimmedString.safeParse("   ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined for an empty string", () => {
    const result = optionalTrimmedString.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined for null", () => {
    const result = optionalTrimmedString.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined for undefined", () => {
    const result = optionalTrimmedString.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined for non-string types (number)", () => {
    const result = optionalTrimmedString.safeParse(42);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// optionalHttpsUrlSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("optionalHttpsUrlSchema", () => {
  it("accepts a valid https URL", () => {
    const result = optionalHttpsUrlSchema.safeParse("https://example.com");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("https://example.com");
    }
  });

  it("accepts a valid https URL with path and query", () => {
    const result = optionalHttpsUrlSchema.safeParse(
      "https://linkedin.com/in/ada?trk=public",
    );
    expect(result.success).toBe(true);
  });

  it("rejects an http URL (not https)", () => {
    const result = optionalHttpsUrlSchema.safeParse("http://example.com");
    expect(result.success).toBe(false);
  });

  it("rejects a string that is not a URL at all", () => {
    const result = optionalHttpsUrlSchema.safeParse("not-a-url");
    expect(result.success).toBe(false);
  });

  it("returns undefined for a blank string", () => {
    const result = optionalHttpsUrlSchema.safeParse("   ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined for null", () => {
    const result = optionalHttpsUrlSchema.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined for undefined", () => {
    const result = optionalHttpsUrlSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("rejects ftp:// scheme", () => {
    const result = optionalHttpsUrlSchema.safeParse("ftp://example.com/file");
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// optionalNonNegativeIntSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("optionalNonNegativeIntSchema", () => {
  it("accepts a positive integer", () => {
    const result = optionalNonNegativeIntSchema.safeParse(100);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(100);
    }
  });

  it("accepts zero", () => {
    const result = optionalNonNegativeIntSchema.safeParse(0);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(0);
    }
  });

  it("coerces a numeric string", () => {
    const result = optionalNonNegativeIntSchema.safeParse("42");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(42);
    }
  });

  it("returns undefined for an empty string", () => {
    const result = optionalNonNegativeIntSchema.safeParse("");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined for null", () => {
    const result = optionalNonNegativeIntSchema.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined for undefined", () => {
    const result = optionalNonNegativeIntSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it("rejects a negative number", () => {
    const result = optionalNonNegativeIntSchema.safeParse(-1);
    expect(result.success).toBe(false);
  });

  it("rejects a float", () => {
    const result = optionalNonNegativeIntSchema.safeParse(3.14);
    expect(result.success).toBe(false);
  });
});
