import { describe, expect, it } from "vitest";

import { CAREER_PRESETS, careerTemplates } from "@/features/career-page/config";
import { contrastRatio } from "@/features/career-page/color";

import {
  accentContrastWarnings,
  errorsBySection,
  readableShade,
  resetDesign,
  resetEverything,
  validateConfig,
} from "./builder-logic";
import { TEMPLATE_CAPABILITIES } from "./template-capabilities";

function customised() {
  const c = CAREER_PRESETS.playful();
  c.hero.headline = "Build with us";
  c.intro.body = "<p>Our story</p>";
  c.faq.items = [{ q: "Remote?", a: "Yes" }];
  c.seo = { indexable: false, title: "Jobs", description: "d", faviconUrl: "/f.png", socialImageUrl: null };
  c.footer = { socials: [{ platform: "x", url: "https://x.com/acme" }], legalLinks: ["privacy-policy"] };
  c.theme = { mode: "dark", background: "#111111", font: "mono", accent: "#ff0000", rounded: "sharp" };
  c.hero.overlay = "none";
  c.positions.filters = [];
  return c;
}

describe("resetDesign", () => {
  it("restores the template look and keeps content, SEO and footer", () => {
    const next = resetDesign(customised());
    const preset = CAREER_PRESETS.playful();
    expect(next.theme).toEqual(preset.theme);
    expect(next.hero.overlay).toBe(preset.hero.overlay);
    expect(next.positions.filters).toEqual(preset.positions.filters);
    expect(next.hero.headline).toBe("Build with us");
    expect(next.intro.body).toBe("<p>Our story</p>");
    expect(next.faq.items).toHaveLength(1);
    expect(next.seo.indexable).toBe(false);
    expect(next.seo.title).toBe("Jobs");
    expect(next.footer.socials).toHaveLength(1);
    expect(next.footer.legalLinks).toEqual(["privacy-policy"]);
  });

  it("does not mutate its input", () => {
    const input = customised();
    resetDesign(input);
    expect(input.theme.accent).toBe("#ff0000");
  });

  it("resetEverything returns the bare preset", () => {
    expect(resetEverything(customised())).toEqual(CAREER_PRESETS.playful());
  });
});

describe("validateConfig", () => {
  it("passes every preset", () => {
    for (const t of careerTemplates) expect(validateConfig(CAREER_PRESETS[t]())).toEqual({});
  });

  it("keys issues by field path and groups them by section", () => {
    const c = CAREER_PRESETS.minimal();
    c.footer.socials = [{ platform: "x", url: "x.com/acme" }];
    c.faq.items = [{ q: "q", a: "a".repeat(2001) }];
    const errors = validateConfig(c);
    expect(errors["footer.socials.0.url"]).toMatch(/http/);
    expect(errors["faq.items.0.a"]).toMatch(/2000/);
    expect(errorsBySection(errors)).toEqual({ footer: 1, sections: 1 });
  });
});

describe("contrast guard", () => {
  it("trusts readable ink on the accent (every template now uses readableInk)", () => {
    const ids = accentContrastWarnings(CAREER_PRESETS.minimal(), "#777777", { checkBackground: false });
    expect(ids).toEqual([]);
  });

  it("readableShade darkens until white text passes", () => {
    const shade = readableShade("#B8F04A", "#ffffff", 4.5)!;
    expect(contrastRatio("#ffffff", shade)).toBeGreaterThanOrEqual(4.5);
  });

  it("flags a light accent against a light background", () => {
    const ids = accentContrastWarnings(CAREER_PRESETS.minimal(), "#B8F04A").map((w) => w.id);
    expect(ids).toContain("accent-on-background");
  });

  it("stays quiet for a dark accent on a light page", () => {
    expect(accentContrastWarnings(CAREER_PRESETS.minimal(), "#1f2937")).toEqual([]);
  });

  it("readableShade lightens against a dark background", () => {
    const shade = readableShade("#333333", "#0b0b0c", 3)!;
    expect(contrastRatio(shade, "#0b0b0c")).toBeGreaterThanOrEqual(3);
  });
});

describe("template capabilities", () => {
  it("covers every template", () => {
    for (const t of careerTemplates) expect(TEMPLATE_CAPABILITIES[t]).toBeDefined();
  });
});
