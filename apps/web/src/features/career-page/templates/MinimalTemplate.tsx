"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { CareerEmpty } from "@/features/career-page/CareerEmpty";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { RichBody } from "@/features/career-page/RichBody";
import { readableInk } from "@/features/career-page/color";
import { boardBase, groupByDepartment, jobLocation, jobType } from "@/features/career-page/job-filters";
import { careerTheme } from "@/features/career-page/theme";

const section = "border-t border-hairline";
const container = "mx-auto max-w-3xl px-6";
const h2 = "text-2xl font-semibold tracking-tight";

/**
 * MinimalTemplate: a quiet, single-column page. Clean topbar (or full banner)
 * with a centred headline, then a plain list of roles grouped by department.
 * Honours: headline, subhead, show headline, logo position, logo type, show
 * name, button text, banner (image, overlay opacity, banner logos), intro,
 * positions title, CTA, testimonials, FAQ, footer, rounded.
 */
export function MinimalTemplate({
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
  const theme = careerTheme(config, workspace.primaryColor);
  const { accent, onAccent, accentText } = theme;
  const base = boardBase(boardRoot);
  const headline = config.hero.headline || `Careers at ${workspace.name}`;
  const subhead = config.hero.subhead;
  const tFallbacks = useTranslations("labels.careerPage.fallbacks");
  const tFacets = useTranslations("labels.careerPage.facets");
  const ctaText = config.hero.ctaButtonText || tFallbacks("viewJobs");
  const btn = "rounded-[var(--career-r-btn,10px)]";

  // Which logo to show: square mark vs full wordmark.
  const displayLogo =
    config.hero.logoType === "fullLogo"
      ? (workspace.fullLogoUrl ?? workspace.logoUrl)
      : workspace.logoUrl;

  // Banner mode can carry its own light/dark full logo (white vs dark letters).
  const bannerVariantLogo =
    config.hero.bannerLogoVariant === "light"
      ? config.hero.bannerLogoLight
      : config.hero.bannerLogoDark;
  const bannerLogo = bannerVariantLogo ?? displayLogo;

  // A full wordmark already spells the name, so only pair the name with a mark.
  const isWordmark = config.hero.logoType === "fullLogo" && Boolean(workspace.fullLogoUrl);
  const showTopbarName = !displayLogo || (config.hero.showName && !isWordmark);

  const logoAlign =
    config.hero.logoPosition === "center"
      ? "justify-center"
      : config.hero.logoPosition === "right"
        ? "justify-end"
        : "justify-start";

  const groups = groupByDepartment(jobs, tFacets("other"));
  const hasIntro = Boolean(config.intro.body);
  const bannerImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  // A floor on the scrim keeps white text readable over bright photos.
  const scrim = Math.max(config.hero.overlayOpacity ?? 40, 35) / 100;

  const ctaHref = config.cta.url || workspace.websiteUrl;
  const ctaColor = config.cta.color ?? accent;

  const headlineEl = config.hero.showHeadline ? (
    <h1
      className={cn(
        "max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl",
        config.hero.bannerEnabled && "text-balance",
      )}
      style={config.hero.bannerEnabled ? { color: bannerImage ? "#ffffff" : onAccent } : undefined}
    >
      {headline}
    </h1>
  ) : (
    <h1 className="sr-only">{headline}</h1>
  );

  return (
    <div className="text-near-ink" style={theme.vars}>
      {config.hero.bannerEnabled ? (
        /* ── Full banner hero ─────────────────────────────────────── */
        <header
          className="relative flex min-h-[22rem] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center"
          style={
            bannerImage
              ? {
                  backgroundImage: `url(${JSON.stringify(bannerImage)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : { backgroundColor: accent }
          }
        >
          {bannerImage && (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `rgba(0,0,0,${scrim})` }}
            />
          )}

          <div className="relative z-10 flex flex-col items-center gap-5">
            {bannerLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerLogo}
                alt={workspace.name}
                className="h-10 w-auto max-w-[240px] object-contain"
              />
            ) : config.hero.showName ? (
              <p
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: bannerImage ? "rgba(255,255,255,0.85)" : onAccent }}
              >
                {workspace.name}
              </p>
            ) : null}
            {headlineEl}
            {subhead && (
              <p
                className="max-w-xl text-lg"
                style={{ color: bannerImage ? "rgba(255,255,255,0.9)" : onAccent }}
              >
                {subhead}
              </p>
            )}
            <a
              href="#positions"
              className={cn(
                "mt-2 inline-flex h-10 items-center px-6 text-sm font-semibold shadow-sm transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none",
                btn,
              )}
              // On a photo or a solid accent the button inverts, so it always
              // contrasts with what is behind it.
              style={
                bannerImage
                  ? { backgroundColor: "#ffffff", color: "#171717" }
                  : { backgroundColor: onAccent, color: accent }
              }
            >
              {ctaText}
            </a>
          </div>
        </header>
      ) : (
        /* ── Clean topbar + hero text ────────────────────────────── */
        <>
          <header className="border-b border-hairline">
            <div className={cn(container, "flex items-center gap-3 py-5", logoAlign)}>
              {displayLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayLogo}
                  alt={showTopbarName ? "" : workspace.name}
                  className="h-8 w-auto max-w-[200px] object-contain"
                />
              ) : null}
              {showTopbarName ? (
                <span className="text-base font-semibold tracking-tight">{workspace.name}</span>
              ) : null}
            </div>
          </header>

          <section className={cn(container, "flex flex-col items-center py-16 text-center")}>
            {headlineEl}
            {subhead && (
              <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-soft-ink">
                {subhead}
              </p>
            )}
            <a
              href="#positions"
              className={cn(
                "mt-7 inline-flex h-10 items-center px-6 text-sm font-semibold transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none",
                btn,
              )}
              style={{ backgroundColor: accent, color: onAccent }}
            >
              {ctaText}
            </a>
          </section>
        </>
      )}

      {/* ── Rich intro body ─────────────────────────────────────────── */}
      {hasIntro && (
        <section className={section}>
          <div className={cn(container, "py-12")}>
            <RichBody html={config.intro.body} />
          </div>
        </section>
      )}

      {/* ── Job openings ────────────────────────────────────────────── */}
      <section id="positions" className={cn(section, "scroll-mt-8")}>
        <div className={cn(container, "py-12")}>
          <h2 className={h2}>{config.positions.title}</h2>

          {jobs.length === 0 ? (
            <CareerEmpty kind="none" portalEnabled={portalEnabled} className="mt-6" />
          ) : (
            <div className="mt-6 space-y-10">
              {groups.map(([dept, deptJobs]) => (
                <div key={dept}>
                  {groups.length > 1 && (
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-soft-ink">
                      {dept}
                    </h3>
                  )}
                  <ul className="divide-y divide-hairline">
                    {deptJobs.map((job, rowIdx) => (
                      <li
                        key={job.id}
                        className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-safe:fill-mode-backwards"
                        style={{ animationDelay: `${Math.min(rowIdx, 8) * 30}ms` }}
                      >
                        <Link
                          href={`${base}/jobs/${job.slug}` as Route}
                          className="group flex flex-col gap-1 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                        >
                          <span
                            className="flex min-w-0 items-center gap-1.5 font-medium transition-opacity group-hover:opacity-70"
                            style={{ color: accentText }}
                          >
                            <span className="min-w-0 break-words">{job.title}</span>
                            <ArrowUpRight
                              className="size-3.5 shrink-0 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                              strokeWidth={2}
                              aria-hidden
                            />
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 text-sm text-soft-ink sm:shrink-0 sm:justify-end">
                            <span>{jobLocation(job)}</span>
                            <span className="text-quiet-mist" aria-hidden>
                              ·
                            </span>
                            <span>{jobType(job)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      {config.cta.enabled && config.cta.title && (
        <section className={section}>
          <div className={cn(container, "py-12 text-center")}>
            <h2 className={h2}>{config.cta.title}</h2>
            {config.cta.body && (
              <p className="mx-auto mt-2 max-w-xl text-soft-ink">{config.cta.body}</p>
            )}
            {ctaHref && (
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "mt-5 inline-flex h-10 items-center px-6 text-sm font-semibold transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none",
                  btn,
                )}
                style={{ backgroundColor: ctaColor, color: readableInk(ctaColor) }}
              >
                {config.cta.buttonText || tFallbacks("getInTouch")}
              </a>
            )}
          </div>
        </section>
      )}

      {/* ── Testimonials ────────────────────────────────────────────── */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <section className={section}>
          <div className={cn(container, "py-12")}>
            <h2 className={cn(h2, "mb-8")}>{config.testimonials.title}</h2>
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </div>
        </section>
      )}

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className={section}>
          <div className={cn(container, "py-12")}>
            <h2 className={cn(h2, "mb-8")}>{config.faq.title}</h2>
            <CareerFaq items={config.faq.items} accent={accent} />
          </div>
        </section>
      )}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className={section}>
        <div className="py-8">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-3xl"
            iconRounded={theme.sharp ? "rounded-none" : "rounded-md"}
            portalEnabled={portalEnabled}
            legalBasePath={`${base}/legal`}
          />
        </div>
      </footer>
    </div>
  );
}
