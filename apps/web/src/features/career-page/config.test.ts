import { describe, expect, it } from "vitest";

import {
  CAREER_PRESETS,
  careerTemplates,
  careerPageConfigSchema,
  MAX_PROCESS_STEPS,
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

describe("career page config: additive Showcase fields", () => {
  it("parses a stored config that predates eyebrow, cta.url and process", () => {
    const legacy = {
      template: "join",
      hero: { headline: "Join us", ctaButtonText: "View jobs" },
      cta: { enabled: true, title: "Hi", body: "", color: null, buttonText: "Talk" },
    };
    const config = normalizeCareerPageConfig(legacy);
    expect(config.hero.eyebrow).toBe("");
    expect(config.cta.url).toBe("");
    expect(config.process).toEqual({ enabled: false, title: "How we hire", steps: [] });
    expect(careerPageConfigSchema.safeParse(config).success).toBe(true);
  });

  it("accepts a raw legacy config without the new keys at the save boundary", () => {
    const legacy = structuredClone(CAREER_PRESETS.minimal()) as Record<string, unknown>;
    delete legacy.process;
    const hero = legacy.hero as Record<string, unknown>;
    delete hero.eyebrow;
    const cta = legacy.cta as Record<string, unknown>;
    delete cta.url;
    expect(careerPageConfigSchema.safeParse(legacy).success).toBe(true);
  });

  it("keeps a safe cta.url and drops unsafe ones", () => {
    expect(normalizeCareerPageConfig({ cta: { url: "https://acme.com/talent" } }).cta.url).toBe(
      "https://acme.com/talent",
    );
    expect(normalizeCareerPageConfig({ cta: { url: "javascript:alert(1)" } }).cta.url).toBe("");
    const config = CAREER_PRESETS.showcase();
    config.cta.url = "javascript:alert(1)";
    expect(careerPageConfigSchema.safeParse(config).success).toBe(false);
    config.cta.url = "";
    expect(careerPageConfigSchema.safeParse(config).success).toBe(true);
  });

  it("normalizes process steps: drops malformed items and caps the count", () => {
    const steps = [
      { title: "Intro call", body: "30 minutes" },
      { title: "No body" },
      { body: "missing title" },
      null,
      "nope",
      ...Array.from({ length: 12 }, (_, i) => ({ title: `Step ${i}` })),
    ];
    const config = normalizeCareerPageConfig({ process: { enabled: true, title: "Hiring", steps } });
    expect(config.process?.enabled).toBe(true);
    expect(config.process?.title).toBe("Hiring");
    expect(config.process?.steps).toHaveLength(MAX_PROCESS_STEPS);
    expect(config.process?.steps[0]).toEqual({ title: "Intro call", body: "30 minutes" });
    expect(config.process?.steps[1]).toEqual({ title: "No body", body: "" });
    expect(careerPageConfigSchema.safeParse(config).success).toBe(true);
  });

  it("trims and caps the hero eyebrow", () => {
    expect(normalizeCareerPageConfig({ hero: { eyebrow: "  Now hiring  " } }).hero.eyebrow).toBe(
      "Now hiring",
    );
    expect(normalizeCareerPageConfig({ hero: { eyebrow: 42 } }).hero.eyebrow).toBe("");
  });

  it("knows the showcase template and every preset round-trips through normalize and save", () => {
    expect(normalizeCareerPageConfig({ template: "showcase" }).template).toBe("showcase");
    expect(normalizeCareerPageConfig({ template: "nope" }).template).toBe("");
    for (const template of careerTemplates) {
      const preset = CAREER_PRESETS[template]();
      expect(preset.template).toBe(template);
      const normalized = normalizeCareerPageConfig(preset);
      expect(careerPageConfigSchema.safeParse(normalized).success, template).toBe(true);
    }
  });

  it("showcase preset ships no fake content", () => {
    const preset = CAREER_PRESETS.showcase();
    expect(preset.overview.stats).toEqual([]);
    expect(preset.values.items).toEqual([]);
    expect(preset.testimonials.items).toEqual([]);
    expect(preset.process).toEqual({ enabled: false, title: "How we hire", steps: [] });
    expect(preset.positions.filters).toEqual(["department", "location", "type"]);
  });
});
