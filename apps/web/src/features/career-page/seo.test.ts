import { describe, expect, it, vi } from "vitest";

import { normalizeCareerPageConfig } from "./config";
import { publicBoardMetadata, serializeJsonLd } from "./seo";

vi.mock("next-intl/server", async () => (await import("@/test-support/intl-server-mock")).intlServerMock);

describe("career page SEO", () => {
  it("escapes script terminators in JSON-LD", () => {
    const serialized = serializeJsonLd({ description: "</script><script>alert(1)" });

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
  });

  it("uses workspace branding as the default title and favicon", async () => {
    const metadata = await publicBoardMetadata(
      {
        name: "Syntrix",
        slug: "syntrix",
        logoUrl: "https://cdn.example.com/syntrix.svg",
        fullLogoUrl: null,
        tagline: null,
        description: null,
        websiteUrl: null,
        primaryColor: "#123456",
        heroImageUrl: null,
        boardStyle: "minimal",
        logoStyle: "bordered",
        legalConfigured: false,
        consentCheckboxText: null,
        legalPages: null,
      },
      normalizeCareerPageConfig({}),
    );

    expect(metadata.title).toBe("Syntrix");
    expect(metadata.icons).toEqual({ icon: "https://cdn.example.com/syntrix.svg" });
  });

  it("uses the Harly favicon when workspace branding has no logo", async () => {
    const metadata = await publicBoardMetadata(
      {
        name: "Syntrix",
        slug: "syntrix",
        logoUrl: null,
        fullLogoUrl: null,
        tagline: null,
        description: null,
        websiteUrl: null,
        primaryColor: "#123456",
        heroImageUrl: null,
        boardStyle: "minimal",
        logoStyle: "bordered",
        legalConfigured: false,
        consentCheckboxText: null,
        legalPages: null,
      },
      normalizeCareerPageConfig({}),
    );

    expect(metadata.icons).toEqual({ icon: "/favicon.svg" });
  });
});
