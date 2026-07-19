"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";

import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { RichBody } from "@/features/career-page/RichBody";
import { bentoPalette } from "@/features/career-page/color";

// Neutral warm near-black for editorial tiles (values, photo). Constant, NOT
// derived from the accent hue , the color-blocking look pairs the accent with a
// neutral dark rather than a second saturated colour (see Diff / Kinorth refs).
const NEUTRAL_DARK = "#1f1f1d";
const NEUTRAL_DARK_INK = "#f4f4f0";
const NEUTRAL_DARK_MUTED = "#a1a19a";

const tileBase = "rounded-3xl p-8";
const reveal =
  "duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

/**
 * BentoTemplate , color-blocked modular grid. Every tile carries its own solid
 * fill derived from the workspace accent (solid accent / soft tint / neutral
 * dark / clean light) so the page reads as a collage with identity, not a grid
 * of identical white cards. Hero and job list are the only guaranteed tiles;
 * photo / stat / values tiles appear only when enabled. Dense auto-flow packs
 * tiles with no holes; when no optional tiles are on, hero and jobs each span the
 * full row and the page reads as intentionally minimal. Collapses to one column
 * on mobile, ordered hero → jobs → extras (jobs is the candidate's action, never
 * buried). Light/dark native.
 */
export function BentoTemplate({
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
  const accent = config.theme.accent ?? workspace.primaryColor;
  const pal = bentoPalette(accent);
  const headline = config.hero.headline || `Careers at ${workspace.name}`;
  const subhead = config.hero.subhead;
  const ctaText = config.hero.ctaButtonText || "View jobs";

  const displayLogo =
    config.hero.logoType === "fullLogo"
      ? (workspace.fullLogoUrl ?? workspace.logoUrl)
      : workspace.logoUrl;

  // Which optional tiles are live , drives hero span + grid density.
  const photo = config.gallery.enabled
    ? (config.gallery.images.find(Boolean) ?? null)
    : null;
  const stats = config.overview.enabled
    ? config.overview.stats.filter((st) => st.value.trim())
    : [];
  const showValues = config.values.enabled && config.values.items.length > 0;

  // Group jobs by department.
  const groups = (() => {
    const map = new Map<string, Job[]>();
    jobs.forEach((j) => {
      const key = j.department ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  return (
    <div className="text-zinc-900 dark:text-zinc-100">
      {/* Topbar */}
      <header>
        <div
          className={`mx-auto flex max-w-6xl items-center gap-3 px-6 py-6 ${
            config.hero.logoPosition === "center"
              ? "justify-center"
              : config.hero.logoPosition === "right"
                ? "justify-end"
                : "justify-start"
          }`}
        >
          {displayLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayLogo}
              alt={workspace.name}
              className="h-8 w-auto max-w-[200px] object-contain"
            />
          ) : (
            <span
              className="flex size-9 items-center justify-center rounded-xl text-sm font-semibold"
              style={{ backgroundColor: accent, color: pal.onAccent }}
            >
              {workspace.name.charAt(0).toUpperCase()}
            </span>
          )}
          {config.hero.showName && displayLogo ? (
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {workspace.name}
            </span>
          ) : null}
        </div>
      </header>

      {/* Bento , stacked full-width bands so tiles never leave holes. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 pb-4">
        {/* Band 1 , hero (solid accent) + optional photo (neutral dark). */}
        <div
          className={`grid grid-cols-1 gap-3 ${photo ? "lg:grid-cols-[1.6fr_1fr]" : ""}`}
        >
          <section
            className={`${tileBase} ${reveal} flex min-h-[280px] flex-col justify-between gap-10 sm:p-10`}
            style={{ backgroundColor: accent, color: pal.onAccent }}
          >
            {(config.hero.showName || config.hero.showHeadline) && (
              <span className="text-xs font-semibold uppercase tracking-widest opacity-70">
                Careers at {workspace.name}
              </span>
            )}
            <div className="flex flex-col gap-6">
              {config.hero.showHeadline && (
                <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
                  {headline}
                </h1>
              )}
              {subhead && (
                <p className="max-w-xl text-lg leading-relaxed opacity-80">
                  {subhead}
                </p>
              )}
              <a
                href="#positions"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById("positions")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex h-11 w-fit items-center gap-2 rounded-full px-6 text-sm font-semibold shadow-sm transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                style={{ backgroundColor: pal.ink, color: "#ffffff" }}
              >
                {ctaText}
                <ArrowUpRight className="size-4" strokeWidth={2} />
              </a>
            </div>
          </section>

          {photo && (
            <div
              className={`${reveal} relative min-h-[280px] overflow-hidden rounded-3xl`}
              style={{ backgroundColor: NEUTRAL_DARK }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="" className="h-full w-full object-cover" />
            </div>
          )}
        </div>

        {/* Band 2 , stat tiles in a row (columns match count, fills width). */}
        {stats.length > 0 && (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            style={{
              gridTemplateColumns:
                stats.length >= 2
                  ? `repeat(${Math.min(stats.length, 4)}, minmax(0, 1fr))`
                  : undefined,
            }}
          >
            {stats.map((st, i) => {
              const highlighted = i === 0;
              return (
                <div
                  key={`${st.label}-${i}`}
                  className={`${tileBase} ${reveal} flex flex-col justify-center gap-1 ${
                    highlighted
                      ? ""
                      : "border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                  style={
                    highlighted ? { backgroundColor: pal.tintBg } : undefined
                  }
                >
                  <span
                    className="text-4xl font-bold tracking-tight"
                    style={{ color: pal.ink }}
                  >
                    {st.value}
                  </span>
                  <span
                    className={
                      highlighted
                        ? "text-sm font-medium"
                        : "text-sm text-zinc-500 dark:text-zinc-400"
                    }
                    style={highlighted ? { color: pal.ink } : undefined}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Band 3 , values, full-width neutral dark editorial block. */}
        {showValues && (
          <div
            className={`${tileBase} ${reveal} flex flex-col gap-6 sm:p-10`}
            style={{ backgroundColor: NEUTRAL_DARK, color: NEUTRAL_DARK_INK }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: NEUTRAL_DARK_MUTED }}
            >
              {config.values.title}
            </h2>
            <ul className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
              {config.values.items.map((v, i) => (
                <li key={`${v.title}-${i}`}>
                  <p className="font-semibold tracking-tight">{v.title}</p>
                  {v.body && (
                    <p
                      className="mt-0.5 text-sm"
                      style={{ color: NEUTRAL_DARK_MUTED }}
                    >
                      {v.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Band 4 , intro, full-width clean block. */}
        {config.intro.body && (
          <div
            className={`${tileBase} ${reveal} border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 sm:p-10`}
          >
            <RichBody html={config.intro.body} />
          </div>
        )}

        {/* Band 5 , jobs, full-width clean block, legibility first. */}
        <section
          id="positions"
          className={`${reveal} scroll-mt-8 rounded-3xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900 sm:p-10`}
        >
          <h2 className="text-xl font-semibold tracking-tight">
            {config.positions.title}
          </h2>

          {jobs.length === 0 ? (
            <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
              No open positions right now.
            </p>
          ) : (
            <div className="mt-6 space-y-10">
              {groups.map(([dept, deptJobs]) => (
                <div key={dept}>
                  {groups.length > 1 && (
                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                      {dept}
                    </p>
                  )}
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {deptJobs.map((job) => (
                      <li key={job.id}>
                        <Link
                          href={`${boardRoot}/jobs/${job.slug}` as Route}
                          className="group flex items-center justify-between gap-6 py-4 transition-colors"
                        >
                          <span className="flex items-center gap-1.5 font-medium tracking-tight transition-opacity group-hover:opacity-70">
                            {job.title}
                            <ArrowUpRight
                              className="size-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                              strokeWidth={2}
                              style={{ color: accent }}
                            />
                          </span>
                          <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                            <span className="hidden sm:inline">
                              {job.location ??
                                formatWorkplaceType(job.workplaceType)}
                            </span>
                            <span className="hidden text-zinc-300 dark:text-zinc-600 sm:inline">
                              ·
                            </span>
                            <span>
                              {formatEmploymentType(job.employmentType)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* CTA , accent tint band. */}
      {config.cta.enabled && config.cta.title && (
        <section className="mx-auto max-w-6xl px-6 pb-4">
          <div
            className={`${tileBase} rounded-3xl text-center sm:p-12`}
            style={{ backgroundColor: pal.tintBg }}
          >
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{ color: pal.ink }}
            >
              {config.cta.title}
            </h2>
            {config.cta.body && (
              <p
                className="mx-auto mt-2 max-w-xl"
                style={{ color: pal.ink, opacity: 0.8 }}
              >
                {config.cta.body}
              </p>
            )}
            {workspace.websiteUrl && (
              <a
                href={workspace.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  backgroundColor: config.cta.color ?? pal.ink,
                  color: "#ffffff",
                }}
              >
                {config.cta.buttonText || "Get in touch"}
              </a>
            )}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight">
            {config.testimonials.title}
          </h2>
          <CareerTestimonials
            items={config.testimonials.items}
            accent={accent}
          />
        </section>
      )}

      {/* FAQ */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight">
            {config.faq.title}
          </h2>
          <CareerFaq items={config.faq.items} accent={accent} />
        </section>
      )}

      {/* Footer */}
      <footer className="mt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="py-8">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            portalWorkspaceSlug={workspace.slug}
            maxWidth="max-w-6xl"
            iconRounded="rounded-2xl"
            portalEnabled={portalEnabled}
            legalBasePath={boardRoot === "/" ? "/legal" : `${boardRoot}/legal`}
          />
        </div>
      </footer>
    </div>
  );
}
