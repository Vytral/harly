"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";

import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import { isLightColor, type CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { RichBody } from "@/features/career-page/RichBody";

const tile =
  "rounded-3xl border border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900";
const reveal =
  "duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

/**
 * BentoTemplate , modular tile grid (dashboard-style, 2025 bento look). The hero
 * and job list are the only guaranteed tiles; photo / stats / values tiles appear
 * only when their section is enabled. Grid uses dense auto-flow so tiles pack with
 * no holes: when no optional tiles are on, the hero and job list each span the full
 * row and the page reads as intentionally minimal. Collapses to one column on
 * mobile, ordered hero → jobs → everything else (jobs is the candidate's action,
 * never buried under decorative tiles). Light/dark native.
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
  const heroInk = isLightColor(accent) ? "#18181b" : "#ffffff";
  const heroMuted = isLightColor(accent) ? "rgba(24,24,27,0.65)" : "rgba(255,255,255,0.75)";
  const headline = config.hero.headline || `Careers at ${workspace.name}`;
  const subhead = config.hero.subhead;
  const ctaText = config.hero.ctaButtonText || "See open roles";

  const displayLogo =
    config.hero.logoType === "fullLogo"
      ? (workspace.fullLogoUrl ?? workspace.logoUrl)
      : workspace.logoUrl;

  // Which optional tiles are live , drives hero span + grid density.
  const photo = config.gallery.enabled ? config.gallery.images.find(Boolean) ?? null : null;
  const stats = config.overview.enabled ? config.overview.stats.filter((st) => st.value.trim()) : [];
  const showValues = config.values.enabled && config.values.items.length > 0;
  const hasOptionalTiles = Boolean(photo) || stats.length > 0 || showValues;

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
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div
          className={`mx-auto flex max-w-6xl items-center gap-3 px-6 py-5 ${
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
              className="flex size-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
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

      {/* Bento grid */}
      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
        <div className="grid auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:[grid-auto-flow:dense]">
          {/* Hero tile , spans full row when no optional tiles keep it company. */}
          <section
            className={`${reveal} order-1 flex flex-col justify-between gap-10 rounded-3xl p-8 sm:col-span-2 sm:p-10 ${
              hasOptionalTiles ? "lg:col-span-2" : "lg:col-span-3"
            }`}
            style={{ backgroundColor: accent, color: heroInk }}
          >
            {config.hero.showHeadline && (
              <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
                {headline}
              </h1>
            )}
            <div className="flex flex-col gap-5">
              {subhead && (
                <p className="max-w-xl text-lg leading-relaxed" style={{ color: heroMuted }}>
                  {subhead}
                </p>
              )}
              <a
                href="#positions"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("positions")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex h-11 w-fit items-center gap-2 rounded-full px-6 text-sm font-semibold shadow-sm transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                style={{ backgroundColor: heroInk, color: accent }}
              >
                {ctaText}
                <ArrowUpRight className="size-4" strokeWidth={2} />
              </a>
            </div>
          </section>

          {/* Photo tile */}
          {photo && (
            <div className={`${tile} ${reveal} order-3 overflow-hidden sm:col-span-1 lg:order-2`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="" className="h-full min-h-[220px] w-full object-cover" />
            </div>
          )}

          {/* Stat tiles , one per stat, big typographic numbers. */}
          {stats.map((st, i) => (
            <div
              key={`${st.label}-${i}`}
              className={`${tile} ${reveal} order-3 flex flex-col justify-center gap-1 p-8 sm:col-span-1 lg:order-2`}
            >
              <span className="text-4xl font-bold tracking-tight" style={{ color: accent }}>
                {st.value}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{st.label}</span>
            </div>
          ))}

          {/* Values tile */}
          {showValues && (
            <div
              className={`${tile} ${reveal} order-3 flex flex-col gap-5 p-8 sm:col-span-2 lg:order-2 lg:col-span-1`}
            >
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {config.values.title}
              </h2>
              <ul className="flex flex-col gap-4">
                {config.values.items.map((v, i) => (
                  <li key={`${v.title}-${i}`}>
                    <p className="font-semibold tracking-tight">{v.title}</p>
                    {v.body && (
                      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{v.body}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Intro tile , spans full width when present. */}
          {config.intro.body && (
            <div
              className={`${tile} ${reveal} order-3 p-8 sm:col-span-2 lg:order-2 lg:col-span-3`}
            >
              <RichBody html={config.intro.body} />
            </div>
          )}

          {/* Jobs tile , always present, always full width, grows to fill. */}
          <section
            id="positions"
            className={`${tile} ${reveal} order-2 scroll-mt-8 p-8 sm:col-span-2 sm:p-10 lg:order-3 lg:col-span-3`}
          >
            <h2 className="text-xl font-semibold tracking-tight">{config.positions.title}</h2>

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
                            <span
                              className="flex items-center gap-1.5 font-medium tracking-tight transition-opacity group-hover:opacity-70"
                            >
                              {job.title}
                              <ArrowUpRight
                                className="size-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                                strokeWidth={2}
                                style={{ color: accent }}
                              />
                            </span>
                            <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                              <span className="hidden sm:inline">
                                {job.location ?? formatWorkplaceType(job.workplaceType)}
                              </span>
                              <span className="hidden text-zinc-300 dark:text-zinc-600 sm:inline">·</span>
                              <span>{formatEmploymentType(job.employmentType)}</span>
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
      </div>

      {/* CTA */}
      {config.cta.enabled && config.cta.title && (
        <section className="mx-auto max-w-6xl px-6 pb-4">
          <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-2xl font-semibold tracking-tight">{config.cta.title}</h2>
            {config.cta.body && (
              <p className="mx-auto mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
                {config.cta.body}
              </p>
            )}
            {workspace.websiteUrl && (
              <a
                href={workspace.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                style={{ backgroundColor: config.cta.color ?? accent }}
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
          <CareerTestimonials items={config.testimonials.items} accent={accent} />
        </section>
      )}

      {/* FAQ */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight">{config.faq.title}</h2>
          <CareerFaq items={config.faq.items} accent={accent} />
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="py-8">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-6xl"
            iconRounded="rounded-2xl"
            portalEnabled={portalEnabled}
          />
        </div>
      </footer>
    </div>
  );
}
