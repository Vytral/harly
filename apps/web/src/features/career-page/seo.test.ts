import { describe, expect, it } from "vitest";

import { normalizeCareerPageConfig } from "./config";
import { publicBoardMetadata, serializeJsonLd } from "./seo";

describe("career page SEO", () => {
  it("escapes script terminators in JSON-LD", () => {
    const serialized = serializeJsonLd({ description: "</script><script>alert(1)" });

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
  });

  it("uses workspace branding as the default title and favicon", () => {
    const metadata = publicBoardMetadata(
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
});
