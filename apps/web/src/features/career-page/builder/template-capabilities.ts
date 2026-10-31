/**
 * What each career template actually renders, so the builder only shows the
 * controls that change something (audit P1-2). Derived by reading each
 * template component; whoever changes a template updates its entry here.
 *
 * Keep it a flat, readable map: one boolean per builder control, plus the jobs
 * filters the template offers and the ink it paints on the accent colour.
 */
import type { CareerTemplate } from "@/features/career-page/config";

export type JobFilter = "department" | "location" | "type";

export type TemplateCapabilities = {
  label: string;
  blurb: string;
  /** Thumbnail palette for the template picker. */
  swatch: { bg: string; accent: string; ink: string };

  // Hero
  headline: boolean;
  subhead: boolean;
  /** "Show headline" toggle. */
  showHeadline: boolean;
  logoPosition: boolean;
  /** "Show company name next to logo". */
  showName: boolean;
  /** Square mark vs full wordmark. */
  logoType: boolean;
  /** Hero "View jobs" button label (`hero.ctaButtonText`). */
  heroButton: boolean;
  /** Small badge above the headline (`hero.eyebrow`). */
  eyebrow: boolean;
  /** Minimal's full-width banner mode (banner image, overlay, banner logos). */
  banner: boolean;
  /** Hero image band (`hero.imageUrl`) outside banner mode. */
  heroImage: boolean;
  /** Gradient wash over the hero image (`hero.overlay*`). */
  heroGradient: boolean;

  // Intro
  intro: boolean;
  introChips: boolean;

  // Sections
  overview: boolean;
  values: boolean;
  /** Icon per value item (`values.items[].art`). */
  valueIcons: boolean;
  gallery: boolean;
  /** Autoplay / speed are honoured. */
  galleryAutoplay: boolean;
  testimonials: boolean;
  process: boolean;
  faq: boolean;
  cta: boolean;
  /** CTA button label is rendered (Playful hardcodes it). */
  ctaButton: boolean;
  /** CTA button links to `cta.url` (others always use the website). */
  ctaUrl: boolean;

  // Jobs
  positionsTitle: boolean;
  filters: JobFilter[];

  /** Text the template prints on solid accent fills: hardcoded white, or the
   *  WCAG-readable ink (`readableInk`). Drives the contrast warning. */
  onAccentText: "white" | "readable";
};

export const TEMPLATE_CAPABILITIES: Record<CareerTemplate, TemplateCapabilities> = {
  minimal: {
    label: "Minimal",
    blurb: "Clean type, just the essentials",
    swatch: { bg: "#ffffff", accent: "#1a1a1a", ink: "#e6e6e6" },
    headline: true,
    subhead: true,
    showHeadline: true,
    logoPosition: true,
    showName: true,
    logoType: true,
    heroButton: true,
    eyebrow: false,
    banner: true,
    heroImage: false,
    heroGradient: false,
    intro: true,
    introChips: false,
    overview: false,
    values: false,
    valueIcons: false,
    gallery: false,
    galleryAutoplay: false,
    testimonials: true,
    process: false,
    faq: true,
    cta: true,
    ctaButton: true,
    ctaUrl: true,
    positionsTitle: true,
    filters: [],
    onAccentText: "readable",
  },
  playful: {
    label: "Playful",
    blurb: "Colorful, friendly, high-energy",
    swatch: { bg: "#FFF9E6", accent: "#f4c100", ink: "#f0e4b8" },
    headline: true,
    subhead: true,
    showHeadline: false,
    logoPosition: true,
    showName: false,
    logoType: false,
    heroButton: true,
    eyebrow: true,
    banner: false,
    heroImage: true,
    heroGradient: true,
    intro: true,
    introChips: true,
    overview: true,
    values: true,
    valueIcons: true,
    gallery: true,
    galleryAutoplay: true,
    testimonials: true,
    process: false,
    faq: true,
    cta: true,
    ctaButton: true,
    ctaUrl: true,
    positionsTitle: true,
    filters: ["department", "location", "type"],
    onAccentText: "readable",
  },
  ashby: {
    label: "Ashby",
    blurb: "Structured, sidebar filters",
    swatch: { bg: "#f7f7f5", accent: "#18181b", ink: "#e2e2dd" },
    headline: true,
    subhead: true,
    showHeadline: true,
    logoPosition: true,
    showName: true,
    logoType: false,
    heroButton: false,
    eyebrow: false,
    banner: false,
    heroImage: false,
    heroGradient: false,
    intro: true,
    introChips: false,
    overview: false,
    values: false,
    valueIcons: false,
    gallery: false,
    galleryAutoplay: false,
    testimonials: true,
    process: false,
    faq: true,
    cta: false,
    ctaButton: false,
    ctaUrl: false,
    positionsTitle: false,
    filters: ["department", "location", "type"],
    onAccentText: "readable",
  },
  join: {
    label: "Join",
    blurb: "Company profile tabs, job-board style",
    swatch: { bg: "#ffffff", accent: "#18181b", ink: "#e4e4e7" },
    headline: true,
    subhead: true,
    showHeadline: true,
    logoPosition: false,
    showName: false,
    logoType: true,
    heroButton: false,
    eyebrow: false,
    banner: false,
    heroImage: false,
    heroGradient: false,
    intro: true,
    introChips: false,
    overview: true,
    values: true,
    valueIcons: false,
    gallery: true,
    galleryAutoplay: true,
    testimonials: true,
    process: false,
    faq: true,
    cta: true,
    ctaButton: true,
    ctaUrl: true,
    positionsTitle: true,
    filters: ["department", "location"],
    onAccentText: "readable",
  },
  // Read from ShowcaseTemplate.tsx; the Showcase author owns this entry.
  showcase: {
    label: "Showcase",
    blurb: "Editorial hero, stats, benefits, filterable jobs",
    swatch: { bg: "#f5f5f4", accent: "#B8F04A", ink: "#e7e5e4" },
    headline: true,
    subhead: true,
    showHeadline: false,
    logoPosition: false,
    showName: true,
    logoType: true,
    heroButton: true,
    eyebrow: true,
    banner: false,
    heroImage: false,
    heroGradient: false,
    intro: true,
    introChips: false,
    overview: true,
    values: true,
    valueIcons: true,
    gallery: true,
    galleryAutoplay: false,
    testimonials: true,
    process: true,
    faq: true,
    cta: true,
    ctaButton: true,
    ctaUrl: true,
    positionsTitle: true,
    filters: ["department", "location", "type"],
    onAccentText: "readable",
  },
};

/** Capabilities for a config's template ("" renders Minimal). */
export function capabilitiesFor(template: CareerTemplate | ""): TemplateCapabilities {
  return TEMPLATE_CAPABILITIES[template || "minimal"] ?? TEMPLATE_CAPABILITIES.minimal;
}
