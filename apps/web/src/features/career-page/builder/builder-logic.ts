/**
 * Pure builder helpers (no React): design-only reset, mapping save-validation
 * issues onto builder fields, and the accent contrast guard. Unit tested in
 * builder-logic.test.ts.
 */
import {
  CAREER_PRESETS,
  careerPageConfigSchema,
  type CareerPageConfig,
  type CareerTemplate,
} from "@/features/career-page/config";
import { contrastRatio, readableInk, shade, tint } from "@/features/career-page/color";

import type { BuilderSection } from "./types";
import { capabilitiesFor } from "./template-capabilities";

/* ------------------------------------------------------------------ */
/*  Reset                                                             */
/* ------------------------------------------------------------------ */

/**
 * "Reset design": the template preset's look and layout only. Everything the
 * recruiter wrote or uploaded (headlines, intro, sections, images), SEO,
 * indexing, socials and legal links are kept.
 */
export function resetDesign(config: CareerPageConfig): CareerPageConfig {
  const template = (config.template || "minimal") as CareerTemplate;
  const preset = CAREER_PRESETS[template]();
  const next = structuredClone(config);
  next.template = template;
  next.theme = preset.theme;
  next.hero = {
    ...next.hero,
    overlay: preset.hero.overlay,
    overlayFrom: preset.hero.overlayFrom,
    overlayTo: preset.hero.overlayTo,
    logoPosition: preset.hero.logoPosition,
    showName: preset.hero.showName,
    showHeadline: preset.hero.showHeadline,
    bannerEnabled: preset.hero.bannerEnabled,
    overlayOpacity: preset.hero.overlayOpacity,
    logoType: preset.hero.logoType,
    bannerLogoVariant: preset.hero.bannerLogoVariant,
  };
  next.positions = { ...next.positions, filters: preset.positions.filters };
  next.gallery = {
    ...next.gallery,
    autoplay: preset.gallery.autoplay,
    speed: preset.gallery.speed,
  };
  next.cta = { ...next.cta, color: preset.cta.color };
  return next;
}

/** "Reset everything": the bare template preset. */
export function resetEverything(config: CareerPageConfig): CareerPageConfig {
  return CAREER_PRESETS[(config.template || "minimal") as CareerTemplate]();
}

/* ------------------------------------------------------------------ */
/*  Validation                                                        */
/* ------------------------------------------------------------------ */

/** Dotted config path ("faq.items.2.a") → message. */
export type FieldErrors = Record<string, string>;

const SECTION_OF: Record<string, BuilderSection> = {
  template: "template",
  hero: "content",
  intro: "content",
  overview: "sections",
  values: "sections",
  gallery: "sections",
  testimonials: "sections",
  process: "sections",
  faq: "sections",
  cta: "sections",
  positions: "jobs",
  theme: "design",
  footer: "footer",
  seo: "discovery",
};

export function sectionOfPath(path: string): BuilderSection {
  return SECTION_OF[path.split(".")[0]] ?? "content";
}

/** Runs the same zod schema the server uses and keys each issue by path. */
export function validateConfig(config: CareerPageConfig): FieldErrors {
  const parsed = careerPageConfigSchema.safeParse(config);
  if (parsed.success) return {};
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join(".");
    if (!errors[path]) errors[path] = friendlyMessage(issue);
  }
  return errors;
}

function friendlyMessage(issue: { code: string; message: string; maximum?: unknown; origin?: unknown }): string {
  if (issue.code === "too_big" && typeof issue.maximum !== "undefined") {
    return issue.origin === "array"
      ? `Keep this to ${String(issue.maximum)} items or fewer.`
      : `Keep this under ${String(issue.maximum)} characters.`;
  }
  if (issue.code === "custom" || issue.code === "invalid_format") return issue.message;
  return "This value isn't valid.";
}

/** Error count per builder section, for the nav rail. */
export function errorsBySection(errors: FieldErrors): Partial<Record<BuilderSection, number>> {
  const counts: Partial<Record<BuilderSection, number>> = {};
  for (const path of Object.keys(errors)) {
    const section = sectionOfPath(path);
    counts[section] = (counts[section] ?? 0) + 1;
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/*  Contrast                                                          */
/* ------------------------------------------------------------------ */

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;

export function isCompleteHex(value: string | null | undefined): value is string {
  return Boolean(value && (HEX6.test(value) || HEX3.test(value)));
}

/**
 * Nudges `color` darker (or lighter, against a dark `against`) in small steps
 * until it reaches `min` contrast with `against`. Null when impossible.
 */
export function readableShade(color: string, against: string, min = 4.5): string | null {
  if (contrastRatio(color, against) >= min) return color;
  const darken = contrastRatio("#000000", against) > contrastRatio("#ffffff", against);
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const candidate = darken ? shade(color, t) : tint(color, t);
    if (contrastRatio(candidate, against) >= min) return candidate;
  }
  return null;
}

export type ContrastWarning = {
  id: "on-accent" | "accent-on-background";
  message: string;
  ratio: number;
  /** One-click fix: the accent value to apply. */
  suggestion: string | null;
};

/**
 * Checks the accent (or a section colour) against the text the active template
 * puts on it, and against the page background it sits on.
 */
export function accentContrastWarnings(
  config: CareerPageConfig,
  color: string,
  { checkBackground = true }: { checkBackground?: boolean } = {},
): ContrastWarning[] {
  if (!isCompleteHex(color)) return [];
  const caps = capabilitiesFor(config.template);
  const warnings: ContrastWarning[] = [];

  const ink = caps.onAccentText === "white" ? "#ffffff" : readableInk(color);
  const onAccent = contrastRatio(ink, color);
  if (onAccent < 4.5) {
    warnings.push({
      id: "on-accent",
      ratio: onAccent,
      message: `${ink === "#ffffff" ? "White" : "Dark"} text on this colour is ${onAccent.toFixed(1)}:1. Buttons need 4.5:1 to be readable.`,
      suggestion: readableShade(color, ink, 4.5),
    });
  }

  const background = config.theme.background;
  if (checkBackground && isCompleteHex(background)) {
    const onBg = contrastRatio(color, background);
    // Accent is used for links, icons and highlights: 3:1 is the floor for
    // non-text UI and large text.
    if (onBg < 3) {
      warnings.push({
        id: "accent-on-background",
        ratio: onBg,
        message: `This colour is ${onBg.toFixed(1)}:1 against your background, so accent links and icons are hard to see.`,
        suggestion: readableShade(color, background, 3),
      });
    }
  }
  return warnings;
}
