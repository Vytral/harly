import { describe, expect, it } from "vitest";

import {
  CAREER_PRESETS,
  careerPageConfigSchema,
  normalizeCareerPageConfig,
  safeHttpUrl,
  safeImageUrl,
} from "./config";

describe("career page config safety", () => {
  it("accepts uploaded/local images and rejects executable protocols", () => {
    expect(safeImageUrl("/uploads/logo.svg")).toBe("/uploads/logo.svg");
    expect(safeImageUrl("https://cdn.example.com/logo.svg")).toBe(
      "https://cdn.example.com/logo.svg",
    );
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("data:text/html,alert(1)")).toBeNull();
    expect(safeImageUrl("//attacker.example/logo.svg")).toBeNull();
  });

  it("accepts only real http(s) social links", () => {
    expect(safeHttpUrl("https://linkedin.com/company/harly")).toBe(
      "https://linkedin.com/company/harly",
    );
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://")).toBeNull();
  });

  it("normalizes unsafe legacy assets instead of rendering them", () => {
    const config = normalizeCareerPageConfig({
      template: "minimal",
      hero: {
        imageUrl: "javascript:alert(1)",
        overlayFrom: "url(javascript:alert(1))",
      },
      gallery: { images: ["data:text/html,alert(1)"] },
      footer: { legalLinks: ["not-a-legal-page"] },
      theme: { background: "url(javascript:alert(1))" },
    });

    expect(config.hero.imageUrl).toBeNull();
    expect(config.hero.overlayFrom).toBeNull();
    expect(config.gallery.images).toEqual([]);
    expect(config.footer.legalLinks).toEqual([]);
    expect(config.theme.background).toBe("#ffffff");
  });

  it("rejects unsafe assets at the save boundary", () => {
    const config = structuredClone(CAREER_PRESETS.minimal());
    config.hero.imageUrl = "javascript:alert(1)";
    expect(careerPageConfigSchema.safeParse(config).success).toBe(false);
  });
});
