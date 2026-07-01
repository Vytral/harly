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

export function MinimalTemplate({
  workspace,
  jobs,
  config,
  boardRoot,
}: {
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  config: CareerPageConfig;
  boardRoot: string;
}) {
  const accent = config.theme.accent ?? workspace.primaryColor;
  const headline = config.hero.headline || `Careers at ${workspace.name}`;
  const subhead = config.hero.subhead;
  const ctaText = config.hero.ctaButtonText || "View jobs";

  // Which logo to show: square mark vs full wordmark
  const displayLogo =
    config.hero.logoType === "fullLogo"
      ? (workspace.fullLogoUrl ?? workspace.logoUrl)
      : workspace.logoUrl;

  // Banner mode can carry its own light/dark full-logo (white vs dark letters),
  // since the banner background has an adjustable overlay. Falls back to the
  // regular display logo when the chosen variant isn't uploaded.
  const bannerVariantLogo =
    config.hero.bannerLogoVariant === "light"
      ? config.hero.bannerLogoLight
      : config.hero.bannerLogoDark;
  const bannerLogo = bannerVariantLogo ?? displayLogo;

  const logoAlign =
    config.hero.logoPosition === "center"
      ? "justify-center"
      : config.hero.logoPosition === "right"
        ? "justify-end"
        : "justify-start";

  // Group jobs by department
  const groups = (() => {
    const map = new Map<string, Job[]>();
    jobs.forEach((j) => {
      const key = j.department ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  const hasIntro = Boolean(config.intro.body);
  const opacity = (config.hero.overlayOpacity ?? 40) / 100;

  return (
    <div className="text-zinc-900 dark:text-zinc-100">

      {config.hero.bannerEnabled ? (
        /* ── Full banner hero ─────────────────────────────────────── */
        <header
          className="relative flex min-h-[40vh] flex-col items-center justify-center overflow-hidden px-6 text-center"
          style={
            (config.hero.imageUrl ?? workspace.heroImageUrl)
              ? {
                  backgroundImage: `url(${config.hero.imageUrl ?? workspace.heroImageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : { backgroundColor: accent }
          }
        >
          {/* Overlay */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: `rgba(0,0,0,${opacity})` }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-5">
            {bannerLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerLogo}
                alt={workspace.name}
                className="h-10 w-auto max-w-[240px] object-contain drop-shadow"
              />
            ) : config.hero.showName ? (
              <p className="text-sm font-semibold uppercase tracking-widest text-white/80">
                {workspace.name}
              </p>
            ) : null}
            {config.hero.showHeadline && (
              <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white drop-shadow sm:text-5xl">
                {headline}
              </h1>
            )}
            {subhead && (
              <p className="max-w-xl text-lg text-white/80 drop-shadow-sm">
                {subhead}
              </p>
            )}
            <a
              href="#positions"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("positions")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="mt-2 inline-flex h-10 items-center rounded-md px-6 text-sm font-semibold text-white shadow transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: accent }}
            >
              {ctaText}
            </a>
          </div>
        </header>
      ) : (
        /* ── Clean topbar + hero text ────────────────────────────── */
        <>
          <header className="border-b border-zinc-200 dark:border-zinc-800">
            <div className={`mx-auto flex max-w-3xl items-center px-6 py-5 ${logoAlign}`}>
              {displayLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayLogo}
                  alt={workspace.name}
                  className="h-8 w-auto max-w-[200px] object-contain"
                />
              ) : (
                <span className="text-base font-semibold tracking-tight">
                  {workspace.name}
                </span>
              )}
            </div>
          </header>

          <section className="mx-auto max-w-3xl px-6 py-16 text-center">
            {config.hero.showHeadline && (
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                {headline}
              </h1>
            )}
            {subhead && (
              <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-zinc-500 dark:text-zinc-400">
                {subhead}
              </p>
            )}
            <a
              href="#positions"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("positions")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="mt-7 inline-flex h-10 items-center rounded-md px-6 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style={{ backgroundColor: accent }}
            >
              {ctaText}
            </a>
          </section>
        </>
      )}

      {/* ── Rich intro body ─────────────────────────────────────────── */}
      {hasIntro && (
        <section className="border-t border-zinc-100 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <RichBody html={config.intro.body} />
          </div>
        </section>
      )}

      {/* ── Job openings ────────────────────────────────────────────── */}
      <section
        id="positions"
        className="scroll-mt-8 border-t border-zinc-100 dark:border-zinc-800"
      >
        <div className="mx-auto max-w-3xl px-6 py-12">
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
                          <span className="flex items-center gap-1.5 font-medium transition-opacity group-hover:opacity-70" style={{ color: accent }}>
                            {job.title}
                            <ArrowUpRight
                              className="size-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                              strokeWidth={2}
                            />
                          </span>
                          <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                            <span>{job.location ?? formatWorkplaceType(job.workplaceType)}</span>
                            <span className="text-zinc-300 dark:text-zinc-600">·</span>
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
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      {config.cta.enabled && config.cta.title && (
        <section className="border-t border-zinc-100 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-12 text-center">
            <h2 className="text-xl font-semibold tracking-tight">{config.cta.title}</h2>
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
                className="mt-5 inline-flex h-10 items-center rounded-md px-6 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                style={{ backgroundColor: config.cta.color ?? accent }}
              >
                {config.cta.buttonText || "Get in touch"}
              </a>
            )}
          </div>
        </section>
      )}

      {/* ── Testimonials ────────────────────────────────────────────── */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <section className="border-t border-zinc-100 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <h2 className="mb-8 text-xl font-semibold tracking-tight">{config.testimonials.title}</h2>
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </div>
        </section>
      )}

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className="border-t border-zinc-100 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <h2 className="mb-8 text-xl font-semibold tracking-tight">{config.faq.title}</h2>
            <CareerFaq items={config.faq.items} accent={accent} />
          </div>
        </section>
      )}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-100 dark:border-zinc-800">
        <div className="py-8">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-3xl"
            iconRounded="rounded-md"
          />
        </div>
      </footer>
    </div>
  );
}
