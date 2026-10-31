"use client";

import { ArrowRight, Briefcase } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import { CareerPositions } from "@/features/career-page/CareerPositions";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerGallery } from "@/features/career-page/CareerGallery";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { RichBody } from "@/features/career-page/RichBody";
import { careerIcon } from "@/features/career-page/icons";
import { readableInk, withAlpha } from "@/features/career-page/color";
import type { CareerPageConfig } from "@/features/career-page/config";
import { boardBase } from "@/features/career-page/job-filters";
import { careerTheme, visibleStats } from "@/features/career-page/theme";
import type { Job } from "@/features/career-page/types";

const reveal =
  "duration-700 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

const container = "mx-auto max-w-5xl px-6";
const h2 = "text-2xl font-semibold tracking-tight sm:text-3xl";
const card = "rounded-[var(--career-r-card,16px)]";

/**
 * Value-tile colour blocks, derived from the page's accent so they follow the
 * brand and stay on-palette in dark mode (no fixed pastels). Three rotating
 * treatments: tint wash, neutral inset, ink.
 */
const VALUE_TILES = [
  { bg: "var(--career-tint)", big: "var(--career-accent-solid)", small: "var(--career-tint-ink)", fg: "var(--career-tint-ink)" },
  { bg: "var(--card-inset)", big: "var(--career-tint)", small: "var(--career-accent-solid)", fg: "var(--career-tint-ink)" },
  { bg: "var(--near-ink)", big: "var(--career-accent-solid)", small: "var(--career-tint)", fg: "var(--pure-snow)" },
] as const;

/**
 * PlayfulTemplate: story-first. Image band with an overlapping logo plate, big
 * headline, chips, overview card, photo strip, value tiles, filterable roles.
 * Honours: headline, subhead, show headline, eyebrow, logo position, hero image
 * and gradient, button text, intro and chips, overview, gallery, values (with
 * icon from `art`), positions (all three filters), CTA, testimonials, FAQ.
 */
export function PlayfulTemplate({
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
  const { accent, onAccent } = theme;
  const base = boardBase(boardRoot);
  const headline = config.hero.headline || `Careers at ${workspace.name}`;
  const heroImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  // The wash is an image treatment only, never a stray fade over a plain accent.
  const showGradient = config.hero.overlay === "gradient" && Boolean(heroImage);
  const overlayFrom = config.hero.overlayFrom ?? withAlpha(accent, 0.9);
  const overlayTo = config.hero.overlayTo ?? withAlpha(accent, 0);
  const logo = workspace.logoUrl;
  const stats = config.overview.enabled ? visibleStats(config.overview.stats) : [];
  const ctaText = config.hero.ctaButtonText || "View jobs";
  const ctaColor = config.cta.color ?? accent;
  const ctaHref = config.cta.url || workspace.websiteUrl;
  const eyebrow = config.hero.eyebrow?.trim() || "Careers";

  const logoAlign =
    config.hero.logoPosition === "center"
      ? "justify-center"
      : config.hero.logoPosition === "right"
        ? "justify-end"
        : "justify-start";

  return (
    <div className="text-near-ink" style={theme.vars}>
      {/* Hero band */}
      <header className="relative">
        <div
          className="relative h-56 w-full overflow-hidden sm:h-72"
          style={
            heroImage
              ? {
                  backgroundImage: `url(${JSON.stringify(heroImage)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : { backgroundColor: accent }
          }
        >
          {showGradient && (
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, ${overlayFrom} 0%, ${overlayTo} 100%)`,
              }}
            />
          )}
        </div>

        {/* Overlapping logo plate. Always white: logos are drawn for a light ground. */}
        <div className={cn(container, "flex", logoAlign)}>
          <div className={cn("relative -mt-12 flex size-24 items-center justify-center overflow-hidden border border-hairline bg-white shadow-lg sm:size-28", card)}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={workspace.name}
                className="size-full object-contain p-3"
              />
            ) : (
              <span
                className="text-3xl font-semibold"
                style={{ color: "var(--career-accent)" }}
                aria-hidden
              >
                {workspace.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Intro + Overview */}
      <section className={cn(container, "pt-8")}>
        <div className={cn("grid gap-10", stats.length > 0 && "lg:grid-cols-[1.5fr_1fr]")}>
          <div className={reveal}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-kraft px-3 py-1 text-xs font-medium text-soft-ink">
              {eyebrow}
              {jobs.length > 0 && (
                <span className="rounded-full bg-pure-snow px-2 py-0.5 text-near-ink">
                  {jobs.length} open {jobs.length === 1 ? "role" : "roles"}
                </span>
              )}
            </span>
            {/* Playful always shows its headline: it has never honoured
                `showHeadline`, and live pages saved with it off rely on that. */}
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              {headline}
            </h1>
            {config.hero.subhead && (
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-soft-ink">
                {config.hero.subhead}
              </p>
            )}
            {config.intro.body && (
              <div className="mt-5 max-w-xl text-lg leading-relaxed text-soft-ink">
                <RichBody html={config.intro.body} />
              </div>
            )}
            {config.intro.chips.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2.5">
                {config.intro.chips.map((chip, i) => {
                  const Icon = careerIcon(chip.icon);
                  return (
                    <li
                      key={`${i}-${chip.label}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-1.5 text-sm text-near-ink transition-colors hover:border-mist-border"
                    >
                      {Icon && (
                        <Icon
                          className="size-3.5"
                          style={{ color: "var(--career-accent)" }}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                      )}
                      {chip.label}
                    </li>
                  );
                })}
              </ul>
            )}
            <a
              href="#positions"
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none"
              style={{ backgroundColor: accent, color: onAccent }}
            >
              {ctaText}
              <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
            </a>
          </div>

          {stats.length > 0 && (
            <aside
              className={cn("self-start border border-hairline bg-pure-snow p-6", card, reveal)}
              style={{ animationDelay: "120ms" }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex size-9 items-center justify-center rounded-[var(--career-r-inner,12px)]"
                  style={{ backgroundColor: accent, color: onAccent }}
                >
                  <Briefcase className="size-4" strokeWidth={1.8} aria-hidden />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">{config.overview.title}</h2>
              </div>
              <dl className="mt-5 space-y-3.5">
                {stats.map((stat, i) => {
                  const Icon = careerIcon(stat.icon);
                  return (
                    <div
                      key={`${i}-${stat.label}`}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <dt className="text-soft-ink">{stat.label}</dt>
                      <dd className="flex items-center gap-1.5 text-right font-medium text-near-ink">
                        {Icon && (
                          <Icon className="size-3.5 text-soft-ink" strokeWidth={1.8} aria-hidden />
                        )}
                        {stat.value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </aside>
          )}
        </div>
      </section>

      {/* Gallery */}
      {config.gallery.enabled && config.gallery.images.length > 0 && (
        <section className="mx-auto mt-14 max-w-6xl px-6">
          <CareerGallery gallery={config.gallery} label={`Photos from ${workspace.name}`} />
        </section>
      )}

      {/* Values */}
      {config.values.enabled && config.values.items.length > 0 && (
        <section className={cn(container, "mt-16")}>
          <h2 className={h2}>{config.values.title}</h2>
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {config.values.items.map((value, i) => {
              const tile = VALUE_TILES[i % VALUE_TILES.length];
              const Icon = careerIcon(value.art);
              return (
                <div
                  key={`${i}-${value.title}`}
                  className={`group ${reveal}`}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div
                    className={cn(
                      "relative aspect-square overflow-hidden transition-transform duration-300 ease-out group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
                      card,
                    )}
                    style={{ backgroundColor: tile.bg }}
                    aria-hidden
                  >
                    <span
                      className="absolute -right-6 -top-6 size-24 rounded-full"
                      style={{ backgroundColor: tile.big }}
                    />
                    <span
                      className="absolute bottom-3 left-3 size-14 rounded-[var(--career-r-inner,12px)]"
                      style={{ backgroundColor: tile.small, opacity: 0.55 }}
                    />
                    {Icon && (
                      <Icon
                        className="absolute left-4 top-4 size-7"
                        style={{ color: tile.fg }}
                        strokeWidth={1.6}
                      />
                    )}
                  </div>
                  <h3 className="mt-3 font-semibold tracking-tight">{value.title}</h3>
                  {value.body && (
                    <p className="mt-1 text-sm leading-relaxed text-soft-ink">{value.body}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Open positions */}
      <section id="positions" className={cn(container, "mt-16 scroll-mt-8")}>
        <h2 className={h2}>{config.positions.title}</h2>
        <div className="mt-7">
          <CareerPositions
            jobs={jobs}
            boardRoot={boardRoot}
            accent={accent}
            filters={config.positions.filters}
            portalEnabled={portalEnabled}
          />
        </div>
      </section>

      {/* Testimonials */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <section className={cn(container, "mt-16")}>
          <h2 className={h2}>{config.testimonials.title}</h2>
          <div className="mt-8">
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </div>
        </section>
      )}

      {/* FAQ */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className={cn(container, "mt-16")}>
          <h2 className={h2}>{config.faq.title}</h2>
          <div className="mt-8">
            <CareerFaq items={config.faq.items} accent={accent} />
          </div>
        </section>
      )}

      {/* CTA banner */}
      {config.cta.enabled && config.cta.title && (
        <section className={cn(container, "mt-16")}>
          <div
            className={cn("relative overflow-hidden px-8 py-10", card)}
            style={{ backgroundColor: withAlpha(ctaColor, theme.isDark ? 0.18 : 0.1) }}
          >
            <span
              className="absolute -right-10 -top-10 size-44 rounded-full opacity-30"
              style={{ backgroundColor: ctaColor }}
              aria-hidden
            />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{config.cta.title}</h2>
                {config.cta.body && (
                  <p className="mt-1 max-w-xl text-soft-ink">{config.cta.body}</p>
                )}
              </div>
              {ctaHref && (
                <a
                  href={ctaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-[var(--career-r-btn,10px)] px-5 py-2.5 text-sm font-semibold transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none"
                  style={{ backgroundColor: ctaColor, color: readableInk(ctaColor) }}
                >
                  {config.cta.buttonText || "Get in touch"}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className={cn(container, "mt-20 pb-12")}>
        <div className="border-t border-hairline pt-6">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-5xl"
            portalEnabled={portalEnabled}
            legalBasePath={`${base}/legal`}
          />
        </div>
      </footer>
    </div>
  );
}
