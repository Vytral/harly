import { describe, expect, it } from "vitest";

import {
  isOwnedAvatarUrl,
  portalProfileSchema,
} from "./profile-validation";

describe("portalProfileSchema", () => {
  it("normalizes optional fields and accepts safe web URLs", () => {
    const result = portalProfileSchema.safeParse({
      firstName: "  Ada  ",
      lastName: " ",
      phone: " +1 555 0100 ",
      location: " Santiago ",
      linkedinUrl: " https://linkedin.com/in/ada ",
      githubUrl: "",
      websiteUrl: "https://example.com",
      headline: " Engineer ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        firstName: "Ada",
        lastName: null,
        githubUrl: null,
        location: "Santiago",
      });
    }
  });

  it("rejects unsafe URLs and malformed phone numbers", () => {
    const result = portalProfileSchema.safeParse({
      firstName: "Ada",
      lastName: null,
      phone: "call me",
      location: null,
      linkedinUrl: "javascript:alert(1)",
      githubUrl: null,
      websiteUrl: null,
      headline: null,
    });

    expect(result.success).toBe(false);
  });
});

describe("isOwnedAvatarUrl", () => {
  const key = "workspaces/workspace_123/images/uuid/avatar.jpg";

  it("only accepts the exact local-storage URL for the workspace key", () => {
    expect(isOwnedAvatarUrl("workspace_123", key, `/uploads/${key}`, {})).toBe(true);
    expect(isOwnedAvatarUrl("workspace_123", key, "https://example.com/avatar.jpg", {})).toBe(false);
    expect(isOwnedAvatarUrl("other", key, `/uploads/${key}`, {})).toBe(false);
  });

  it("checks the configured S3 public URL", () => {
    expect(isOwnedAvatarUrl(
      "workspace_123",
      key,
      "https://assets.example.com/workspaces/workspace_123/images/uuid/avatar.jpg",
      { STORAGE_PROVIDER: "s3", S3_PUBLIC_URL: "https://assets.example.com/" },
    )).toBe(true);
  });
});
