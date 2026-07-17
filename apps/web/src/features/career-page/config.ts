/**
 * Career-page builder config. Stored as `workspaceSettings.careerPageConfig`
 * (jsonb). A `template` picks a preset look; every section below is then fully
 * overridable, so "todo personalizable". Client- and server-safe.
 */
import { z } from "zod";

export const careerTemplates = ["minimal", "playful", "ashby", "folio"] as const;
export type CareerTemplate = (typeof careerTemplates)[number];

export const fontFamilies = ["sans", "serif", "display", "mono"] as const;
export type FontFamily = (typeof fontFamilies)[number];

export const colorModes = ["light", "dark"] as const;
export type ColorMode = (typeof colorModes)[number];

export type CareerChip = { label: string; icon?: string };
export type CareerStat = { label: string; value: string; icon?: string };
export type CareerValue = { title: string; body: string; art?: string };
export type CareerFaqItem = { q: string; a: string };
export type CareerTestimonial = { quote: string; name: string; role: string; avatar: string };

/**
 * Folio-only editorial chrome. Re-presented sections (overview.values,
 * testimonials, faq, cta) keep using the shared fields above; these knobs
 * shape the magazine voice , masthead, byline, drop cap, numbered sections,
 * and a standalone pull quote that floats between the brief and the roles.
 */
export type CareerEditorial = {
  /** Masthead kicker, e.g. "CAREERS , vol. IV". Sits top-left in mono. */
  mastKicker: string;
  /** Issue line shown top-right of the masthead, e.g. "Issue 04 , Jul 2026". */
  issueLabel: string;
  /** Byline shown under the lede, e.g. "By the Acme team". */
  byline: string;
  /** Render the intro's first letter as an oversized drop cap. */
  dropCap: boolean;
  /** Prefix each section heading with an ordinal "01 / 02 / 03". */
  numberedSections: boolean;
  /** Render the oversized pull-quote section (uses testimonials[0]). */
  pullQuoteEnabled: boolean;
};

export const socialPlatforms = [
  "x",
  "linkedin",
  "github",
  "instagram",
  "youtube",
  "facebook",
  "discord",
  "website",
] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

export type CareerSocialLink = { platform: SocialPlatform; url: string };

export type CareerSeo = {
  /** Public pages are discoverable unless the workspace explicitly opts out. */
  indexable: boolean;
  /** Optional overrides. Empty values fall back to the workspace branding. */
  title: string;
  description: string;
  faviconUrl: string | null;
  socialImageUrl: string | null;
};

export type CareerPageConfig = {
  /** Empty string = not configured yet → public board falls back to legacy. */
  template: CareerTemplate | "";
  hero: {
    headline: string;
    subhead: string;
    imageUrl: string | null;
    /** "gradient" = customizable left→right colour wash; "none" = bare image. */
    overlay: "gradient" | "none";
    /** Gradient start colour (left). null = derive from theme accent. */
    overlayFrom: string | null;
    /** Gradient end colour (right). null = fade to transparent. */
    overlayTo: string | null;
    /** Logo placement in header. */
    logoPosition: "left" | "center" | "right";
    /** Show workspace name next to logo. */
    showName: boolean;
    /** Hide the headline text (useful when using full logo as the hero statement). */
    showHeadline: boolean;
    /** Minimal: show a full banner instead of the clean topbar. */
    bannerEnabled: boolean;
    /** Minimal banner: dark overlay opacity 0–100. */
    overlayOpacity: number;
    /** Which logo asset to show , square mark or full wordmark. */
    logoType: "logo" | "fullLogo";
    /** Banner-only: full logo variants uploaded for the hero banner. The banner
     *  background has an adjustable dark overlay, so the dark variant (white
     *  letters) is the sensible default. Null → fall back to the workspace logo. */
    bannerLogoLight: string | null;
    bannerLogoDark: string | null;
    /** Which banner logo variant to display. Defaults to "dark" (white letters). */
    bannerLogoVariant: "light" | "dark";
    /** Text label for the "View jobs" CTA button. */
    ctaButtonText: string;
  };
  intro: { body: string; chips: CareerChip[] };
  /** Folio-only editorial chrome. Ignored by other templates. */
  editorial: CareerEditorial;
  overview: { enabled: boolean; title: string; stats: CareerStat[] };
  gallery: { enabled: boolean; images: string[]; autoplay: boolean; speed: "slow" | "normal" };
  values: { enabled: boolean; title: string; items: CareerValue[] };
  testimonials: { enabled: boolean; title: string; items: CareerTestimonial[] };
  faq: { enabled: boolean; title: string; items: CareerFaqItem[] };
  positions: { title: string; filters: Array<"department" | "location" | "type"> };
  /** `color` overrides the accent for the CTA banner. */
  cta: { enabled: boolean; title: string; body: string; color: string | null; buttonText: string };
  footer: {
    socials: CareerSocialLink[];
    /** Legal page slugs to show as links in the footer (e.g. ["privacy-policy", "terms-of-service"]). */
    legalLinks: string[];
  };
  seo: CareerSeo;
  theme: {
    mode: ColorMode;
    background: string;
    font: FontFamily;
    accent: string | null;
    rounded: "soft" | "sharp";
  };
};

const EMPTY: CareerPageConfig = {
  template: "",
  hero: {
    headline: "",
    subhead: "",
    imageUrl: null,
    overlay: "gradient",
    overlayFrom: null,
    overlayTo: null,
    logoPosition: "center",
    showName: true,
    showHeadline: true,
    bannerEnabled: false,
    overlayOpacity: 40,
    logoType: "logo",
    bannerLogoLight: null,
    bannerLogoDark: null,
    bannerLogoVariant: "dark",
    ctaButtonText: "View jobs",
  },
  intro: { body: "", chips: [] },
  editorial: {
    mastKicker: "CAREERS",
    issueLabel: "",
    byline: "",
    dropCap: true,
    numberedSections: true,
    pullQuoteEnabled: true,
  },
  overview: { enabled: false, title: "Overview", stats: [] },
  gallery: { enabled: false, images: [], autoplay: false, speed: "slow" },
  values: { enabled: false, title: "Our values", items: [] },
  testimonials: { enabled: false, title: "Testimonials", items: [] },
  faq: { enabled: false, title: "Frequently asked questions", items: [] },
  positions: { title: "Our open positions", filters: ["department", "location"] },
  cta: { enabled: false, title: "", body: "", color: null, buttonText: "Get in touch" },
  footer: { socials: [], legalLinks: [] },
  seo: { indexable: true, title: "", description: "", faviconUrl: null, socialImageUrl: null },
  theme: { mode: "light", background: "#ffffff", font: "sans", accent: null, rounded: "soft" },
};

/** Preset seeds , what the builder loads when a template is first chosen. */
export const CAREER_PRESETS: Record<CareerTemplate, () => CareerPageConfig> = {
  minimal: () => ({
    ...structuredClone(EMPTY),
    template: "minimal",
    hero: {
      ...EMPTY.hero,
      headline: "Careers",
      overlay: "none",
      logoPosition: "left",
      bannerEnabled: false,
      overlayOpacity: 40,
      logoType: "fullLogo" as const,
      ctaButtonText: "View jobs",
    },
    positions: { title: "Open positions", filters: ["department", "location"] },
    cta: { ...EMPTY.cta, buttonText: "Get in touch" },
    theme: { mode: "light", background: "#ffffff", font: "sans", accent: null, rounded: "sharp" },
  }),
  playful: () => ({
    ...structuredClone(EMPTY),
    template: "playful",
    hero: { ...EMPTY.hero, headline: "Join us" },
    intro: {
      body: "People are our main asset and our main concern. We care about your skills, but even more about who you are. This is a great place for curious, positive people who like to build together.",
      chips: [
        { label: "People", icon: "users" },
        { label: "Personality", icon: "heart" },
        { label: "Passion", icon: "flame" },
        { label: "Positive", icon: "smile" },
        { label: "Craft", icon: "sparkles" },
      ],
    },
    overview: {
      enabled: true,
      title: "Overview",
      stats: [
        { label: "Founded", value: "2024", icon: "calendar" },
        { label: "Team", value: "Not set", icon: "users" },
        { label: "Locations", value: "Not set", icon: "map-pin" },
      ],
    },
    gallery: { enabled: true, images: [], autoplay: true, speed: "slow" },
    values: {
      enabled: true,
      title: "Our values",
      items: [
        { title: "Agile", body: "We adapt our roadmap to what users actually need." },
        { title: "Open", body: "Our methods are transparent and co-constructed." },
        { title: "Inventive", body: "We invest heavily in figuring things out." },
        { title: "Present", body: "We are proactive and we listen." },
      ],
    },
    positions: { title: "Our open positions", filters: ["department", "location", "type"] },
    cta: {
      ...EMPTY.cta,
      enabled: true,
      title: "Don't see a role that fits?",
      body: "We are always opening new opportunities for great people. Reach out.",
      buttonText: "Get in touch",
    },
    theme: { mode: "light", background: "#FFF9E6", font: "sans", accent: "#f4c100", rounded: "soft" },
  }),
  ashby: () => ({
    ...structuredClone(EMPTY),
    template: "ashby",
    hero: { ...EMPTY.hero, headline: "Join us", overlay: "none", logoPosition: "left" },
    values: { enabled: true, title: "Our values", items: [] },
    positions: { title: "Open positions", filters: ["department", "location", "type"] },
    cta: { ...EMPTY.cta, buttonText: "Get in touch" },
  }),
  folio: () => ({
    ...structuredClone(EMPTY),
    template: "folio",
    hero: {
      ...EMPTY.hero,
      headline: "We're building the place people actually want to work.",
      overlay: "gradient",
      logoPosition: "left",
      ctaButtonText: "Read the roles",
    },
    intro: {
      body: "Harly is a small, opinionated team that thinks hiring software should feel like the people it serves. We write in plain language, ship in small slices, and care about the seams, the tiny transitions, the empty states, the half-second a candidate waits before a form opens. This is a brief about how we work and what we're looking for.",
      chips: [],
    },
    editorial: {
      mastKicker: "CAREERS, vol. I",
      issueLabel: "Issue 01",
      byline: "By the Harly team",
      dropCap: true,
      numberedSections: true,
      pullQuoteEnabled: true,
    },
    overview: {
      enabled: true,
      title: "At a glance",
      stats: [
        { label: "Founded", value: "2024", icon: "calendar" },
        { label: "Team", value: "Not set", icon: "users" },
        { label: "Remote", value: "100%", icon: "globe" },
      ],
    },
    values: {
      enabled: true,
      title: "What we believe",
      items: [
        { title: "Inventive", body: "We invest heavily in figuring things out." },
        { title: "Present", body: "We are proactive and we listen." },
        { title: "Open", body: "Our methods are transparent and co-constructed." },
      ],
    },
    positions: { title: "Open roles", filters: ["department", "location", "type"] },
    cta: {
      ...EMPTY.cta,
      enabled: true,
      title: "Coda",
      body: "Don't see a role that fits? We are always opening new opportunities for great people. Reach out.",
      buttonText: "Get in touch",
    },
    theme: {
      mode: "light",
      background: "#F7F4EE",
      font: "serif",
      accent: "#7A1E1E",
      rounded: "sharp",
    },
  }),
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isValidHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s);
}

function validRounded(v: unknown, fallback: "soft" | "sharp"): "soft" | "sharp" {
  return (["soft", "sharp"] as const).includes(v as "soft" | "sharp")
    ? (v as "soft" | "sharp")
    : fallback;
}

/** Coerce raw jsonb into a complete, safe config (deep-merged over EMPTY). */
export function normalizeCareerPageConfig(raw: unknown): CareerPageConfig {
  const r = (raw ?? {}) as Partial<CareerPageConfig>;
  const base = structuredClone(EMPTY);
  const template = careerTemplates.includes(r.template as CareerTemplate)
    ? (r.template as CareerTemplate)
    : "";

  return {
    template,
    hero: {
      headline: r.hero?.headline ?? base.hero.headline,
      subhead: r.hero?.subhead ?? base.hero.subhead,
      imageUrl: r.hero?.imageUrl ?? base.hero.imageUrl,
      // Old configs stored "tint"; treat anything but "none" as the gradient.
      overlay: r.hero?.overlay === "none" ? "none" : "gradient",
      overlayFrom: r.hero?.overlayFrom ?? base.hero.overlayFrom,
      overlayTo: r.hero?.overlayTo ?? base.hero.overlayTo,
      logoPosition: (["left", "center", "right"] as const).includes(r.hero?.logoPosition as "left" | "center" | "right")
        ? (r.hero!.logoPosition as "left" | "center" | "right")
        : base.hero.logoPosition,
      showName: typeof r.hero?.showName === "boolean" ? r.hero.showName : base.hero.showName,
      showHeadline: typeof r.hero?.showHeadline === "boolean" ? r.hero.showHeadline : base.hero.showHeadline,
      bannerEnabled: typeof r.hero?.bannerEnabled === "boolean" ? r.hero.bannerEnabled : base.hero.bannerEnabled,
      overlayOpacity: typeof r.hero?.overlayOpacity === "number" ? Math.min(100, Math.max(0, r.hero.overlayOpacity)) : base.hero.overlayOpacity,
      logoType: (["logo", "fullLogo"] as const).includes(r.hero?.logoType as "logo" | "fullLogo") ? (r.hero!.logoType as "logo" | "fullLogo") : base.hero.logoType,
      bannerLogoLight: r.hero?.bannerLogoLight ?? base.hero.bannerLogoLight,
      bannerLogoDark: r.hero?.bannerLogoDark ?? base.hero.bannerLogoDark,
      bannerLogoVariant: (["light", "dark"] as const).includes(r.hero?.bannerLogoVariant as "light" | "dark") ? (r.hero!.bannerLogoVariant as "light" | "dark") : base.hero.bannerLogoVariant,
      ctaButtonText: typeof r.hero?.ctaButtonText === "string" && r.hero.ctaButtonText.trim() ? r.hero.ctaButtonText.trim() : base.hero.ctaButtonText,
    },
    intro: {
      body: r.intro?.body ?? base.intro.body,
      chips: asArray<CareerChip>(r.intro?.chips),
    },
    editorial: {
      mastKicker: typeof r.editorial?.mastKicker === "string" && r.editorial.mastKicker.trim()
        ? r.editorial.mastKicker.trim()
        : base.editorial.mastKicker,
      issueLabel: typeof r.editorial?.issueLabel === "string" ? r.editorial.issueLabel.trim() : base.editorial.issueLabel,
      byline: typeof r.editorial?.byline === "string" ? r.editorial.byline.trim() : base.editorial.byline,
      dropCap: typeof r.editorial?.dropCap === "boolean" ? r.editorial.dropCap : base.editorial.dropCap,
      numberedSections:
        typeof r.editorial?.numberedSections === "boolean"
          ? r.editorial.numberedSections
          : base.editorial.numberedSections,
      pullQuoteEnabled:
        typeof r.editorial?.pullQuoteEnabled === "boolean"
          ? r.editorial.pullQuoteEnabled
          : base.editorial.pullQuoteEnabled,
    },
    overview: {
      enabled: Boolean(r.overview?.enabled),
      title: r.overview?.title ?? base.overview.title,
      stats: asArray<CareerStat>(r.overview?.stats),
    },
    gallery: {
      enabled: Boolean(r.gallery?.enabled),
      images: asArray<string>(r.gallery?.images),
      autoplay: Boolean(r.gallery?.autoplay),
      speed: r.gallery?.speed === "normal" ? "normal" : "slow",
    },
    values: {
      enabled: Boolean(r.values?.enabled),
      title: r.values?.title ?? base.values.title,
      items: asArray<CareerValue>(r.values?.items),
    },
    testimonials: {
      enabled: Boolean(r.testimonials?.enabled),
      title: r.testimonials?.title ?? base.testimonials.title,
      items: asArray<CareerTestimonial>(r.testimonials?.items),
    },
    faq: {
      enabled: Boolean(r.faq?.enabled),
      title: r.faq?.title ?? base.faq.title,
      items: asArray<CareerFaqItem>(r.faq?.items),
    },
    positions: {
      title: r.positions?.title ?? base.positions.title,
      filters: asArray<"department" | "location" | "type">(r.positions?.filters),
    },
    cta: {
      enabled: Boolean(r.cta?.enabled),
      title: r.cta?.title ?? base.cta.title,
      body: r.cta?.body ?? base.cta.body,
      color: r.cta?.color ?? base.cta.color,
      buttonText: typeof r.cta?.buttonText === "string" && r.cta.buttonText.trim() ? r.cta.buttonText.trim() : base.cta.buttonText,
    },
    footer: {
      socials: asArray<CareerSocialLink>(r.footer?.socials),
      legalLinks: asArray<string>(r.footer?.legalLinks),
    },
    seo: {
      indexable: typeof r.seo?.indexable === "boolean" ? r.seo.indexable : base.seo.indexable,
      title: typeof r.seo?.title === "string" ? r.seo.title.trim().slice(0, 70) : base.seo.title,
      description: typeof r.seo?.description === "string" ? r.seo.description.trim().slice(0, 180) : base.seo.description,
      faviconUrl: safeImageUrl(r.seo?.faviconUrl),
      socialImageUrl: safeImageUrl(r.seo?.socialImageUrl),
    },
    theme: {
      mode: colorModes.includes(r.theme?.mode as ColorMode) ? (r.theme!.mode as ColorMode) : base.theme.mode,
      background: typeof r.theme?.background === "string" ? r.theme.background : base.theme.background,
      font: fontFamilies.includes(r.theme?.font as FontFamily) ? (r.theme!.font as FontFamily) : base.theme.font,
      accent: typeof r.theme?.accent === "string" && isValidHexColor(r.theme.accent)
        ? r.theme.accent
        : base.theme.accent,
      rounded: validRounded(r.theme?.rounded, base.theme.rounded),
    },
  };
}

/** Normalise a user-provided image URL: blank or invalid → null. */
export function safeImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  return url.trim();
}

/** True when a template has been chosen → render the new career page. */
export function isCareerPageConfigured(config: CareerPageConfig): boolean {
  return config.template !== "";
}

/** Default canvas colour for each mode. */
export const MODE_BG: Record<ColorMode, string> = {
  light: "#ffffff",
  dark: "#0b0b0c",
};

/**
 * Perceived-luminance test for a #rgb/#rrggbb colour. Used to keep the canvas
 * background and the colour mode coherent (dark mode → dark canvas), so a mode
 * switch never leaves light text on a light background.
 */
export function isLightColor(hex: string): boolean {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return true;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Relative luminance (sRGB-weighted), 0–255.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}

// --- Validation (builder save) ----------------------------------------------
const s = (max: number) => z.string().max(max);
const chip = z.object({ label: s(40), icon: s(40).optional() });
const stat = z.object({ label: s(40), value: s(60), icon: s(40).optional() });
const value = z.object({ title: s(60), body: s(400), art: s(200).optional() });

export const careerPageConfigSchema = z.object({
  template: z.enum([...careerTemplates, ""] as ["minimal", "playful", "ashby", "folio", ""]),
  hero: z.object({
    headline: s(120),
    subhead: s(200),
    imageUrl: s(600).nullable(),
    overlay: z.enum(["gradient", "none"]),
    overlayFrom: s(20).nullable(),
    overlayTo: s(20).nullable(),
    logoPosition: z.enum(["left", "center", "right"]),
    showName: z.boolean(),
    showHeadline: z.boolean(),
    bannerEnabled: z.boolean(),
    overlayOpacity: z.number().min(0).max(100),
    logoType: z.enum(["logo", "fullLogo"]),
    bannerLogoLight: s(600).nullable(),
    bannerLogoDark: s(600).nullable(),
    bannerLogoVariant: z.enum(["light", "dark"]),
    ctaButtonText: s(60),
  }),
  intro: z.object({ body: s(20000), chips: z.array(chip).max(12) }),
  editorial: z.object({
    mastKicker: s(60),
    issueLabel: s(60),
    byline: s(80),
    dropCap: z.boolean(),
    numberedSections: z.boolean(),
    pullQuoteEnabled: z.boolean(),
  }),
  overview: z.object({
    enabled: z.boolean(),
    title: s(60),
    stats: z.array(stat).max(8),
  }),
  gallery: z.object({
    enabled: z.boolean(),
    images: z.array(s(600)).max(12),
    autoplay: z.boolean(),
    speed: z.enum(["slow", "normal"]),
  }),
  values: z.object({
    enabled: z.boolean(),
    title: s(60),
    items: z.array(value).max(8),
  }),
  testimonials: z.object({
    enabled: z.boolean(),
    title: s(60),
    items: z.array(z.object({ quote: s(600), name: s(60), role: s(60), avatar: s(600) })).max(12),
  }),
  faq: z.object({
    enabled: z.boolean(),
    title: s(60),
    items: z.array(z.object({ q: s(200), a: s(2000) })).max(20),
  }),
  positions: z.object({
    title: s(60),
    filters: z.array(z.enum(["department", "location", "type"])).max(3),
  }),
  cta: z.object({
    enabled: z.boolean(),
    title: s(120),
    body: s(400),
    color: s(20).nullable(),
    buttonText: s(60),
  }),
  footer: z.object({
    socials: z.array(z.object({ platform: z.enum(socialPlatforms), url: s(600).refine((value) => !value || /^https?:\/\//i.test(value), "Social links must use http(s).") })).max(8),
    legalLinks: z.array(s(80)).max(10),
  }),
  seo: z.object({
    indexable: z.boolean().default(true),
    title: s(70),
    description: s(180),
    faviconUrl: s(600).nullable(),
    socialImageUrl: s(600).nullable(),
  }),
  theme: z.object({
    mode: z.enum(["light", "dark"]),
    background: s(20),
    font: z.enum(["sans", "serif", "display", "mono"]),
    accent: s(20).nullable(),
    rounded: z.enum(["soft", "sharp"]),
  }),
});
