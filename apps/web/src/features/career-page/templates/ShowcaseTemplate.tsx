"use client";

import { Fragment, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import { safeImageUrl, type CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { CareerIcon, careerIcon } from "@/features/career-page/icons";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { CareerProcess, visibleProcessSteps } from "@/features/career-page/CareerProcess";
import { RichBody } from "@/features/career-page/RichBody";
import { accentPalette, readableInk, tint } from "@/features/career-page/color";
import { formatCompensation } from "@/features/career-page/job/jobMeta";

/**
 * ShowcaseTemplate — the warm, people-first marketing careers page.
 *
 * References: Tines (dotted paper, mono eyebrow, scattered rounded photos),
 * Jasper (round team photos inline in a big headline, stat tiles), GitHub
 * (centred headline, text link, 2x2 benefits grid), beehiiv / Wrangle /
 * Peerlist (filterable, department-grouped compact job rows), Dribbble
 * (numbered hiring process), Figma / Intercom (ink pill CTAs).
 *
 * Rules: surfaces come from the redesign tokens (`--warm-paper`, `--pure-snow`,
 * `--near-ink`, `--soft-ink`, `--hairline`), which ThemeWrapper's `.light` /
 * `.dark` class flips, so the page follows `theme.mode` like every other
 * template. Editorial structure: left-aligned hero, ink rules instead of
 * boxes, one large number per stat, plain text counts (no pills). The accent
 * is rationed: active filters, step numbers, portrait tints and the CTA band
 * button. Every section is optional and renders only with real content.
 * Motion is limited to a short job-row entrance, hover/press feedback, and is
 * off under `prefers-reduced-motion`. Every image box has fixed dimensions.
 */

/** Section opener: a solid ink rule with the label sitting under it. */
const sectionRule = "border-t border-near-ink pt-5";
const rowEnter =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:fill-mode-backwards";

const ANY = "";

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-near-ink";

/** Icons cycled for benefit cards whose `art` is not a known icon name. */
const FALLBACK_BENEFIT_ICONS = ["heart", "rocket", "users", "sparkles", "globe", "coffee", "growth", "shield"];

type FilterKind = "department" | "location" | "type";

const locationOf = (j: Job) => j.location ?? formatWorkplaceType(j.workplaceType);

const FACETS: Record<FilterKind, { pick: (j: Job) => string | null }> = {
  department: { pick: (j) => j.department },
  location: { pick: locationOf },
  type: { pick: (j) => formatEmploymentType(j.employmentType) },
};

function distinct(jobs: Job[], pick: (j: Job) => string | null): string[] {
  const set = new Set<string>();
  for (const j of jobs) {
    const v = pick(j);
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "group";
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** Cut a headline into words and slot up to three photos between them. */
function headlineWithPhotos(text: string, photos: string[]) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const k = Math.min(photos.length, 3, Math.max(0, words.length - 1));
  const slots = new Map<number, string>();
  for (let j = 1; j <= k; j++) {
    slots.set(Math.round((j * words.length) / (k + 1)) - 1, photos[j - 1]);
  }
  return { words, slots };
}

const OTHER_GROUP = "Other roles";

export function ShowcaseTemplate({
  workspace,
  jobs,
  config,
  boardRoot,
  portalEnabled = false,
}: {
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  config: CareerPageConfig;
  boardRoot: string;
  portalEnabled?: boolean;
}) {
  const uid = useId();
  const t = useTranslations("features.careerPage.showcaseTemplate");
  const tMeta = useTranslations("labels.careerPage.jobMeta");
  const locale = useLocale();
  const accent = config.theme.accent ?? workspace.primaryColor;
  const pal = accentPalette(accent);
  const sharp = config.theme.rounded === "sharp";
  const card = sharp ? "rounded-md" : "rounded-2xl";
  const inner = sharp ? "rounded" : "rounded-xl";

  // ── Content gates ──────────────────────────────────────────────────────────
  const name = workspace.name;
  const headline = config.hero.headline.trim() || t("defaultHeadline", { name });
  const subhead = config.hero.subhead.trim() || workspace.tagline?.trim() || "";
  const photos = config.gallery.enabled
    ? config.gallery.images.map(safeImageUrl).filter((u): u is string => u !== null)
    : [];
  const heroPhotos = photos.slice(0, 3);
  const mosaic = photos.slice(0, 5);
  const stats = config.overview.enabled
    ? config.overview.stats.filter((s) => s.value?.trim() && s.label?.trim()).slice(0, 4)
    : [];
  const benefits = config.values.enabled
    ? config.values.items.filter((v) => v.title?.trim())
    : [];
  const introHtml = config.intro.body?.trim() ? config.intro.body : "";
  const hasCulture = Boolean(introHtml) || benefits.length > 0;
  const testimonials = config.testimonials.enabled
    ? config.testimonials.items.filter((t) => t.quote?.trim() && t.name?.trim())
    : [];
  const hasProcess = visibleProcessSteps(config.process).length > 0;
  const faqItems = config.faq.enabled ? config.faq.items.filter((f) => f.q?.trim()) : [];
  const ctaHref = config.cta.url?.trim() || workspace.websiteUrl || (portalEnabled ? "/portal" : "");
  const showCta = config.cta.enabled && Boolean(config.cta.title.trim());
  const ctaFill = config.cta.color ?? accent;
  // Labels for the one-line department/group names and the "Other roles" bucket.
  const groupLabel = (dept: string) => (dept === OTHER_GROUP ? t("otherRoles") : dept);

  const eyebrowLabel = config.hero.eyebrow?.trim() || (jobs.length > 0 ? t("weAreHiring") : t("careers"));

  const logoSrc =
    config.hero.logoType === "fullLogo"
      ? workspace.fullLogoUrl ?? workspace.logoUrl
      : workspace.logoUrl;
  const showName =
    config.hero.showName && !(config.hero.logoType === "fullLogo" && workspace.fullLogoUrl);

  // ── Jobs filtering ─────────────────────────────────────────────────────────
  const enabledFilters = config.positions.filters;
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Record<FilterKind, string>>({
    department: ANY,
    location: ANY,
    type: ANY,
  });

  const facets = useMemo(
    () =>
      (["department", "location", "type"] as const)
        .filter((k) => enabledFilters.includes(k))
        .map((k) => ({ kind: k, values: distinct(jobs, FACETS[k].pick) }))
        .filter((f) => f.values.length > 1),
    [jobs, enabledFilters],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      for (const k of ["department", "location", "type"] as const) {
        if (sel[k] !== ANY && FACETS[k].pick(j) !== sel[k]) return false;
      }
      if (!q) return true;
      return [j.title, j.department ?? "", locationOf(j)].some((v) => v.toLowerCase().includes(q));
    });
  }, [jobs, query, sel]);

  const groups = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of filtered) {
      const key = j.department?.trim() || OTHER_GROUP;
      map.set(key, [...(map.get(key) ?? []), j]);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a === OTHER_GROUP ? 1 : b === OTHER_GROUP ? -1 : a.localeCompare(b),
    );
  }, [filtered]);

  const allDepartments = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs) {
      const key = j.department?.trim() || OTHER_GROUP;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a === OTHER_GROUP ? 1 : b === OTHER_GROUP ? -1 : a.localeCompare(b),
    );
  }, [jobs]);

  const filtersActive = query.trim() !== "" || Object.values(sel).some((v) => v !== ANY);
  const clearFilters = () => {
    setQuery("");
    setSel({ department: ANY, location: ANY, type: ANY });
  };

  const { words, slots } = headlineWithPhotos(headline, heroPhotos);
  const groupId = (dept: string) => `${uid}-dept-${slugify(dept)}`.replace(/:/g, "");

  return (
    <div className="text-near-ink">
      <a
        href="#positions"
        className={cn(
          "sr-only z-50 rounded-full bg-near-ink px-4 py-2 text-sm font-medium text-pure-snow focus:not-sr-only focus:fixed focus:left-4 focus:top-4",
          focusRing,
        )}
      >
        {t("skipToRoles")}
      </a>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="relative z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoSrc}
                alt={showName ? "" : name}
                className={cn(
                  "shrink-0 object-contain",
                  logoSrc === workspace.logoUrl && config.hero.logoType !== "fullLogo"
                    ? "size-8 rounded-lg"
                    : "h-8 w-auto max-w-40",
                )}
              />
            ) : (
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
                style={{ backgroundColor: pal.tintBg, color: pal.ink }}
                aria-hidden
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            {(showName || !logoSrc) && (
              <span className="truncate text-[15px] font-semibold tracking-tight">{name}</span>
            )}
          </span>
          {jobs.length > 0 && (
            <a
              href="#positions"
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium underline decoration-hairline decoration-2 underline-offset-[6px] transition-colors hover:decoration-near-ink",
                focusRing,
              )}
            >
              {t("openRolesLabel")}
              <span className="tabular-nums text-soft-ink">{jobs.length}</span>
            </a>
          )}
        </div>
      </header>

      <main>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section aria-labelledby={`${uid}-hero`} className="relative -mt-16 pt-16 sm:-mt-20 sm:pt-20">
          <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pb-28 sm:pt-20">
            <p className="text-[15px] font-medium text-soft-ink">
              {eyebrowLabel}
              {jobs.length > 0 && (
                <>
                  <span aria-hidden> / </span>
                  <span className="sr-only">, </span>
                  <span className="tabular-nums">{t("openRoles", { count: jobs.length })}</span>
                </>
              )}
            </p>

            {/* Always visible: the hero is built around it, so Showcase ignores
                `showHeadline` (pages saved with it off would look empty). */}
            <h1
              id={`${uid}-hero`}
              className="mt-6 max-w-4xl text-[clamp(2.75rem,8vw,6rem)] font-semibold leading-[0.98] tracking-[-0.045em] [text-wrap:balance]"
            >
              {words.map((word, i) => (
                <Fragment key={i}>
                  {word}
                  {slots.has(i) && (
                    <>
                      {" "}
                      <span
                        aria-hidden
                        className="inline-block h-[0.82em] w-[1.5em] translate-y-[0.06em] overflow-hidden rounded-full bg-card-inset align-baseline ring-1 ring-hairline"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={slots.get(i)}
                          alt=""
                          width={120}
                          height={66}
                          className="size-full object-cover"
                        />
                      </span>
                    </>
                  )}
                  {i < words.length - 1 ? " " : null}
                </Fragment>
              ))}
            </h1>

            {subhead && (
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-soft-ink [text-wrap:pretty] sm:text-xl">
                {subhead}
              </p>
            )}

            <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
              <a
                href="#positions"
                className={cn(
                  "inline-flex h-12 items-center gap-2 rounded-full bg-near-ink px-6 text-[15px] font-medium text-pure-snow transition-transform duration-150 ease-out hover:-translate-y-px active:scale-[0.97] motion-reduce:transition-none",
                  focusRing,
                )}
              >
                {config.hero.ctaButtonText || t("seeOpenRoles")}
                <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
              </a>
              {hasCulture && (
                <a
                  href="#culture"
                  className={cn(
                    "inline-flex h-12 items-center gap-1 rounded-full px-2 text-[15px] font-medium underline decoration-hairline decoration-2 underline-offset-[6px] transition-colors hover:decoration-near-ink",
                    focusRing,
                  )}
                >
                  {t("lifeAt", { name })}
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── Stat tiles ─────────────────────────────────────────────────── */}
        {stats.length > 0 && (
          <section aria-labelledby={`${uid}-stats`} className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 id={`${uid}-stats`} className="sr-only">
              {config.overview.title || t("inNumbers")}
            </h2>
            <dl
              className={cn(
                "grid grid-cols-2 border-t border-near-ink",
                stats.length === 3 ? "lg:grid-cols-3" : stats.length >= 4 ? "lg:grid-cols-4" : null,
              )}
            >
              {stats.map((s, i) => (
                <div
                  key={`${s.label}-${i}`}
                  className={cn(
                    "flex flex-col-reverse justify-between gap-10 border-b border-hairline py-6 pr-4 sm:py-8",
                    i % 2 === 1 && "pl-4 sm:pl-0",
                    "lg:border-b-0 lg:pl-6 lg:first:pl-0",
                    i > 0 && "lg:border-l lg:border-hairline",
                    stats.length === 3 && i === 2 && "col-span-2 lg:col-span-1",
                  )}
                >
                  <dt className="flex items-center gap-1.5 text-sm text-soft-ink">
                    <CareerIcon name={s.icon} className="size-3.5 shrink-0" />
                    {s.label}
                  </dt>
                  <dd className="text-5xl font-semibold leading-none tracking-[-0.045em] tabular-nums sm:text-6xl [overflow-wrap:anywhere]">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* ── Culture: intro + benefits 2x2 ─────────────────────────────── */}
        {hasCulture && (
          <section
            id="culture"
            aria-labelledby={`${uid}-culture`}
            className="mx-auto max-w-6xl scroll-mt-6 px-4 pt-24 sm:px-6 sm:pt-32"
          >
            <div className={cn("grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16", sectionRule)}>
              <div>
                <p className="text-sm font-medium text-soft-ink">{t("lifeAt", { name })}</p>
                <h2
                  id={`${uid}-culture`}
                  className="mt-4 text-3xl font-semibold leading-[1.05] tracking-[-0.035em] [text-wrap:balance] sm:text-5xl"
                >
                  {benefits.length > 0 ? config.values.title || t("whyYoullLikeIt") : t("aboutCompany", { name })}
                </h2>
                {introHtml && (
                  <div className="mt-5 max-w-prose text-[17px] leading-relaxed text-soft-ink">
                    <RichBody html={introHtml} />
                  </div>
                )}
              </div>

              {benefits.length > 0 && (
                <ul className="grid gap-x-8 sm:grid-cols-2">
                  {benefits.map((b, i) => {
                    const icon = careerIcon(b.art) ? b.art : FALLBACK_BENEFIT_ICONS[i % FALLBACK_BENEFIT_ICONS.length];
                    return (
                      <li
                        key={`${b.title}-${i}`}
                        className="border-t border-hairline py-6"
                      >
                        <CareerIcon name={icon} className="size-5 text-soft-ink" />
                        <h3 className="mt-4 text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">{b.title}</h3>
                        {b.body?.trim() && (
                          <p className="mt-1.5 text-[15px] leading-relaxed text-soft-ink [overflow-wrap:anywhere]">
                            {b.body}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ── Photo mosaic ───────────────────────────────────────────────── */}
        {mosaic.length > 0 && (
          <section aria-label={t("photosOfTeam", { name })} className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-32">
            <ul
              className={cn(
                "grid grid-cols-2 items-start gap-3 sm:gap-4",
                mosaic.length >= 3 && "sm:grid-cols-3",
                mosaic.length === 4 && "lg:grid-cols-4",
                mosaic.length >= 5 && "lg:grid-cols-5",
              )}
            >
              {mosaic.map((src, i) => {
                const round = i % 3 === 1;
                return (
                  <li
                    key={`${i}-${src.slice(-16)}`}
                    className={cn(
                      "overflow-hidden bg-card-inset",
                      round ? "aspect-square rounded-full" : cn(i % 2 ? "aspect-[4/5]" : "aspect-[3/4]", card),
                      i % 2 === 1 && "mt-8 sm:mt-12",
                      mosaic.length >= 3 && i === mosaic.length - 1 && mosaic.length % 2 === 1 && "max-sm:hidden",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── Jobs ───────────────────────────────────────────────────────── */}
        <section
          id="positions"
          aria-labelledby={`${uid}-jobs`}
          className="mx-auto max-w-6xl scroll-mt-6 px-4 pt-24 sm:px-6 sm:pt-32"
        >
          <div className={cn("flex flex-wrap items-end justify-between gap-3", sectionRule)}>
            <h2
              id={`${uid}-jobs`}
              className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl"
            >
              {config.positions.title || t("openRolesLabel")}
            </h2>
            {jobs.length > 0 && (
              <p className="text-sm tabular-nums text-soft-ink" aria-live="polite">
                {filtersActive
                  ? t("filteredCount", { shown: filtered.length, total: jobs.length })
                  : t("rolesCount", { count: jobs.length })}
              </p>
            )}
          </div>

          {jobs.length === 0 ? (
            <div className={cn("mt-8 border border-dashed border-hairline bg-pure-snow/60 px-6 py-16 text-center", card)}>
              <p className="text-lg font-medium tracking-tight">{t("noOpenRoles")}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-soft-ink">{t("noOpenRolesBody")}</p>
              {portalEnabled && (
                <a
                  href="/portal"
                  className={cn(
                    "mt-6 inline-flex h-10 items-center gap-1.5 rounded-full bg-near-ink px-5 text-sm font-medium text-pure-snow",
                    focusRing,
                  )}
                >
                  {t("joinTalentPool")}
                  <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                </a>
              )}
            </div>
          ) : (
            <>
              {/* Department overview: jump links with counts (3+ departments). */}
              {allDepartments.length >= 3 && !filtersActive && (
                <nav aria-label={t("departments")} className="mt-6">
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {allDepartments.map(([dept, count]) => (
                      <li key={dept}>
                        <a
                          href={`#${groupId(dept)}`}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-md px-1 text-sm underline decoration-hairline decoration-2 underline-offset-[6px] transition-colors hover:decoration-near-ink",
                            focusRing,
                          )}
                        >
                          {groupLabel(dept)}
                          <span className="text-xs tabular-nums text-soft-ink">{count}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              <div className={cn("mt-6 border border-hairline bg-pure-snow", card)}>
                {/* Filters */}
                <div
                  role="search"
                  aria-label={t("filterRoles")}
                  className={cn(
                    "grid gap-2 border-b border-hairline p-3 sm:gap-3 sm:p-4",
                    facets.length === 1 && "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
                    facets.length === 2 && "sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]",
                    facets.length === 3 && "sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]",
                  )}
                >
                  <label className={cn("relative block", facets.length === 2 && "sm:col-span-2 lg:col-span-1", facets.length === 3 && "sm:col-span-2 lg:col-span-1")}>
                    <span className="sr-only">{t("searchRoles")}</span>
                    <Search
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-soft-ink"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("searchRoles")}
                      className={cn(
                        "h-11 w-full border border-hairline bg-warm-paper pl-10 pr-3 text-[15px] text-near-ink placeholder:text-soft-ink focus-visible:border-near-ink/40",
                        inner,
                        focusRing,
                      )}
                    />
                  </label>
                  {facets.map(({ kind, values }) => {
                    const active = sel[kind] !== ANY;
                    return (
                      <label key={kind} className="relative block">
                        <span className="sr-only">{t(`facets.${kind}`)}</span>
                        {active && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute left-3.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                        )}
                        <select
                          value={sel[kind]}
                          onChange={(e) => setSel((prev) => ({ ...prev, [kind]: e.target.value }))}
                          className={cn(
                            "h-11 w-full cursor-pointer appearance-none border bg-warm-paper pr-9 text-[15px] text-near-ink",
                            active ? "pl-7 font-medium" : "border-hairline pl-3.5",
                            inner,
                            focusRing,
                          )}
                          style={active ? { borderColor: accent } : undefined}
                        >
                          <option value={ANY}>{t(`allFacets.${kind}`)}</option>
                          {values.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-soft-ink"
                          strokeWidth={1.8}
                          aria-hidden
                        />
                      </label>
                    );
                  })}
                </div>

                {/* Grouped rows */}
                {groups.length === 0 ? (
                  <div className="px-6 py-14 text-center">
                    <p className="font-medium tracking-tight">{t("noRolesMatch")}</p>
                    <p className="mt-1 text-[15px] text-soft-ink">{t("tryAnotherSearch")}</p>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={cn(
                        "mt-5 inline-flex h-10 items-center rounded-full border border-hairline px-5 text-sm font-medium transition-[border-color,transform] duration-150 hover:border-near-ink/30 active:scale-[0.97] motion-reduce:transition-none",
                        focusRing,
                      )}
                    >
                      {t("clearFilters")}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {groups.map(([dept, list]) => (
                      <section
                        key={dept}
                        id={groupId(dept)}
                        aria-labelledby={`${groupId(dept)}-h`}
                        className="scroll-mt-6 px-3 py-4 sm:px-4 sm:py-5"
                      >
                        <h3
                          id={`${groupId(dept)}-h`}
                          className="flex items-center gap-2 px-2 pb-2 text-sm font-semibold tracking-tight sm:px-3"
                        >
                          {groupLabel(dept)}
                          <span className="text-xs font-normal tabular-nums text-soft-ink">
                            <span aria-hidden>{list.length}</span>
                            <span className="sr-only">{t("roleCountSr", { count: list.length })}</span>
                          </span>
                        </h3>
                        <ul>
                          {list.map((job, rowIdx) => {
                            const salary = formatCompensation(job, locale, tMeta);
                            const meta = [locationOf(job), formatEmploymentType(job.employmentType), salary].filter(
                              (v): v is string => Boolean(v),
                            );
                            return (
                              <li
                                key={job.id}
                                className={rowEnter}
                                style={{ animationDelay: `${Math.min(rowIdx, 8) * 30}ms` }}
                              >
                                <Link
                                  href={`${boardRoot}/jobs/${job.slug}` as Route}
                                  className={cn(
                                    "group flex items-center gap-4 px-2 py-3 transition-[background-color,transform] duration-150 hover:bg-warm-paper active:scale-[0.995] motion-reduce:transition-none sm:px-3",
                                    inner,
                                    focusRing,
                                  )}
                                >
                                  <span className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                                    <span className="block font-medium tracking-tight [overflow-wrap:anywhere]">
                                      {job.title}
                                    </span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-soft-ink sm:mt-0 sm:justify-end">
                                      {meta.map((m, i) => (
                                        <Fragment key={m + i}>
                                          {i > 0 && <span aria-hidden className="opacity-50">·</span>}
                                          <span className={cn(m === salary && "tabular-nums")}>{m}</span>
                                        </Fragment>
                                      ))}
                                    </span>
                                  </span>
                                  <ArrowUpRight
                                    aria-hidden
                                    className="hidden size-4 shrink-0 -translate-x-1 text-near-ink opacity-0 transition-[transform,opacity] duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none sm:block"
                                    strokeWidth={1.8}
                                  />
                                  <ChevronRight
                                    aria-hidden
                                    className="size-4 shrink-0 text-soft-ink sm:hidden"
                                    strokeWidth={1.8}
                                  />
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── Voices ─────────────────────────────────────────────────────── */}
        {testimonials.length > 0 && (
          <section aria-labelledby={`${uid}-voices`} className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-32">
            <h2 id={`${uid}-voices`} className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
              {config.testimonials.title || t("fromTheTeam")}
            </h2>
            <ul className="mt-8 grid gap-3 sm:gap-4 md:grid-cols-2">
              {testimonials.map((item, i) => {
                const avatar = safeImageUrl(item.avatar);
                const wash = tint(accent, [0.78, 0.86, 0.7][i % 3]);
                return (
                  <li key={`${item.name}-${i}`}>
                    <figure className={cn("flex h-full flex-col gap-6 border border-hairline bg-pure-snow p-6 sm:p-8", card)}>
                      <blockquote className="flex-1 text-lg leading-relaxed tracking-[-0.01em] [text-wrap:pretty] [overflow-wrap:anywhere] sm:text-xl">
                        <p>&ldquo;{item.quote}&rdquo;</p>
                      </blockquote>
                      <figcaption className="flex items-center gap-3.5">
                        <span
                          className="flex size-14 shrink-0 items-end justify-center overflow-hidden rounded-full"
                          style={{ backgroundColor: wash }}
                        >
                          {avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatar}
                              alt={t("portraitOf", { name: item.name })}
                              width={56}
                              height={56}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <span
                              className="flex size-full items-center justify-center text-base font-semibold"
                              style={{ color: pal.ink }}
                              aria-hidden
                            >
                              {initials(item.name) || "?"}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold tracking-tight">{item.name}</span>
                          {item.role?.trim() && <span className="block truncate text-sm text-soft-ink">{item.role}</span>}
                        </span>
                      </figcaption>
                    </figure>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── How we hire ────────────────────────────────────────────────── */}
        {hasProcess && (
          <section aria-labelledby={`${uid}-process`} className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-32">
            <CareerProcess
              process={config.process}
              accent={accent}
              rounded={config.theme.rounded}
              title={config.process?.title || t("howWeHire")}
              headingId={`${uid}-process`}
            />
          </section>
        )}

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        {faqItems.length > 0 && (
          <section aria-labelledby={`${uid}-faq`} className="mx-auto max-w-3xl px-4 pt-24 sm:px-6 sm:pt-32">
            <h2 id={`${uid}-faq`} className="mb-8 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
              {config.faq.title || t("questions")}
            </h2>
            <CareerFaq items={faqItems} accent={pal.ink} />
          </section>
        )}

        {/* ── CTA band ───────────────────────────────────────────────────── */}
        {showCta && (
          <section aria-labelledby={`${uid}-cta`} className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-32">
            <div
              className={cn(
                "relative overflow-hidden bg-[#171717] px-6 py-14 text-center text-white sm:px-12 sm:py-20 dark:ring-1 dark:ring-white/10",
                sharp ? "rounded-md" : "rounded-3xl",
              )}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1.4px)",
                  backgroundSize: "22px 22px",
                }}
              />
              <h2
                id={`${uid}-cta`}
                className="relative mx-auto max-w-2xl text-3xl font-semibold tracking-[-0.025em] [text-wrap:balance] sm:text-4xl"
              >
                {config.cta.title}
              </h2>
              {config.cta.body?.trim() && (
                <p className="relative mx-auto mt-3 max-w-lg text-[17px] leading-relaxed text-white/70">
                  {config.cta.body}
                </p>
              )}
              {ctaHref && (
                <a
                  href={ctaHref}
                  {...(/^https?:/i.test(ctaHref) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium outline-none transition-transform duration-150 ease-out hover:-translate-y-px active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
                  style={{ backgroundColor: ctaFill, color: readableInk(ctaFill) }}
                >
                  {config.cta.buttonText || t("getInTouch")}
                  <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
                </a>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-24 border-t border-hairline py-8 sm:mt-32">
        <CareerFooter
          config={config}
          workspaceName={name}
          maxWidth="max-w-6xl"
          iconRounded="rounded-full"
          portalEnabled={portalEnabled}
          legalBasePath={boardRoot === "/" || boardRoot === "" ? "/legal" : `${boardRoot}/legal`}
        />
      </footer>
    </div>
  );
}
