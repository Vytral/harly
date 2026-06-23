import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import { CareerPositions } from "@/features/career-page/CareerPositions";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerGallery } from "@/features/career-page/CareerGallery";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { careerIcon } from "@/features/career-page/icons";
import type { CareerPageConfig } from "@/features/career-page/config";

type Job = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
};

/**
 * MinimalTemplate — typography-first, editorial. Restrained: thin rules, airy
 * spacing, no decorative blobs. Renders every configurable section (hero +
 * overlay, intro chips, overview, gallery, values, positions, CTA) so the
 * builder's toggles are honoured, just styled minimally. Theme-aware.
 */
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
  const headline = config.hero.headline || "Careers";
  const subhead = config.hero.subhead;
  const logo = workspace.logoUrl;
  const heroImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  const showGradient = config.hero.overlay === "gradient" && Boolean(heroImage);
  const overlayFrom = config.hero.overlayFrom ?? `${accent}E6`;
  const overlayTo = config.hero.overlayTo ?? `${accent}00`;

  return (
    <div className="text-zinc-900 dark:text-zinc-100">
      {/* Hero — image banner when set, else a centered type-first header */}
      {heroImage ? (
        <header className="relative border-b border-zinc-200 dark:border-zinc-800">
          <div
            className="relative flex h-72 items-end overflow-hidden sm:h-80"
            style={{ backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center" }}
          >
            <div
              className="absolute inset-0"
              style={
                showGradient
                  ? { background: `linear-gradient(90deg, ${overlayFrom} 0%, ${overlayTo} 100%)` }
                  : { background: "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))" }
              }
            />
            <div className={`relative mx-auto w-full max-w-4xl px-6 pb-8 flex flex-col ${
              config.hero.logoPosition === "center" ? "items-center text-center" :
              config.hero.logoPosition === "right" ? "items-end text-right" : "items-start text-left"
            }`}>
              {logo ? (
                <div className="mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo}
                    alt={workspace.name}
                    className="h-10 w-auto object-contain"
                  />
                </div>
              ) : null}
              {config.hero.showName && !logo ? (
                <p className="mb-2 text-sm font-medium text-white/70">{workspace.name}</p>
              ) : null}
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {headline}
              </h1>
              {subhead ? (
                <p className="mt-3 max-w-2xl text-lg text-white/85">{subhead}</p>
              ) : null}
            </div>
          </div>
        </header>
      ) : (
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className={`mx-auto max-w-4xl px-6 py-16 sm:py-24 flex flex-col ${
            config.hero.logoPosition === "center" ? "items-center text-center" :
            config.hero.logoPosition === "right" ? "items-end text-right" : "items-start text-left"
          }`}>
            {logo ? (
              <div className={config.hero.logoPosition === "center" ? "mb-8" : "mb-6"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo}
                  alt={workspace.name}
                  className="h-12 w-auto object-contain dark:brightness-90"
                />
              </div>
            ) : null}
            {config.hero.showName && !logo ? (
              <p className="mb-3 text-sm font-medium text-zinc-400">{workspace.name}</p>
            ) : null}
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {headline}
            </h1>
            {subhead ? (
              <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
                {subhead}
              </p>
            ) : null}
          </div>
        </header>
      )}

      {/* Intro + chips */}
      {config.intro.body || config.intro.chips.length > 0 ? (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
            {config.intro.body ? (
              <p className="text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
                {config.intro.body}
              </p>
            ) : null}
            {config.intro.chips.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2.5">
                {config.intro.chips.map((chip) => {
                  const Icon = careerIcon(chip.icon);
                  return (
                    <span
                      key={chip.label}
                      className="inline-flex items-center gap-1.5 border border-zinc-200 px-3.5 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      {Icon ? (
                        <Icon className="size-3.5" style={{ color: accent }} strokeWidth={1.8} />
                      ) : null}
                      {chip.label}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Overview — stat row, rule-separated, no boxes */}
      {config.overview.enabled && config.overview.stats.length > 0 ? (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
              {config.overview.title}
            </h2>
            <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
              {config.overview.stats.map((stat) => {
                const Icon = careerIcon(stat.icon);
                return (
                  <div key={stat.label} className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <dd className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                      {Icon ? (
                        <Icon className="size-4 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} />
                      ) : null}
                      {stat.value || "—"}
                    </dd>
                    <dt className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {stat.label}
                    </dt>
                  </div>
                );
              })}
            </dl>
          </div>
        </section>
      ) : null}

      {/* Values — numbered editorial list */}
      {config.values.enabled && config.values.items.length > 0 ? (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
            <h2 className="text-2xl font-semibold tracking-tight">
              {config.values.title}
            </h2>
            <div className="mt-8 grid gap-px overflow-hidden border border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800 sm:grid-cols-2">
              {config.values.items.map((value, i) => (
                <div key={value.title} className="bg-white p-6 dark:bg-zinc-950">
                  <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 font-semibold tracking-tight">{value.title}</h3>
                  {value.body ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {value.body}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Gallery — uses CareerGallery for autoplay support */}
      {config.gallery.enabled && config.gallery.images.length > 0 ? (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
            <CareerGallery gallery={config.gallery} rounded="rounded-none" />
          </div>
        </section>
      ) : null}

      {/* Positions */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight">
            {config.positions.title}
          </h2>
          <CareerPositions jobs={jobs} boardRoot={boardRoot} accent={accent} />
        </div>
      </section>

      {/* Testimonials */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <section className="border-t border-zinc-200 py-12 dark:border-zinc-800 sm:py-16">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight">
              {config.testimonials.title}
            </h2>
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </div>
        </section>
      )}

      {/* FAQ */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className="border-t border-zinc-200 py-12 dark:border-zinc-800 sm:py-16">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight">
              {config.faq.title}
            </h2>
            <CareerFaq items={config.faq.items} accent={accent} />
          </div>
        </section>
      )}

      {/* CTA (optional) */}
      {config.cta.enabled && config.cta.title ? (
        <section className="border-t border-zinc-200 py-12 dark:border-zinc-800 sm:py-16">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {config.cta.title}
            </h2>
            {config.cta.body ? (
              <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
                {config.cta.body}
              </p>
            ) : null}
            {workspace.websiteUrl ? (
              <a
                href={workspace.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex h-10 items-center px-5 text-sm font-medium text-white transition-transform duration-150 active:scale-[0.98]"
                style={{ backgroundColor: config.cta.color ?? accent }}
              >
                Get in touch
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-8 dark:border-zinc-800">
        <CareerFooter config={config} logo={workspace.logoUrl} workspaceName={workspace.name} maxWidth="max-w-4xl" iconRounded="rounded-lg" />
      </footer>
    </div>
  );
}
