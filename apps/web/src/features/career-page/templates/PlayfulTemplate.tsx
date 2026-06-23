import { Briefcase } from "lucide-react";

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

// Playful value-tile palettes — bold, Memory-style abstract colour blocks.
const VALUE_ART = [
  { bg: "#FDE68A", blob: "#F472B6" },
  { bg: "#BFDBFE", blob: "#2563EB" },
  { bg: "#FBCFE8", blob: "#FB7185" },
  { bg: "#FED7AA", blob: "#F97316" },
  { bg: "#A7F3D0", blob: "#10B981" },
  { bg: "#DDD6FE", blob: "#7C3AED" },
];

const reveal = "duration-700 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

export function PlayfulTemplate({
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
  const ctaColor = config.cta.color ?? accent;
  const overlayFrom = config.hero.overlayFrom ?? `${accent}E6`;
  const overlayTo = config.hero.overlayTo ?? `${accent}00`;
  const headline = config.hero.headline || "Join us";
  const heroImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  const logo = workspace.logoUrl;

  return (
    <div className="text-zinc-900 dark:text-zinc-100">
      {/* Hero band */}
      <header className="relative">
        <div
          className="relative h-56 w-full overflow-hidden sm:h-72"
          style={
            heroImage
              ? { backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { backgroundColor: accent }
          }
        >
          {config.hero.overlay === "gradient" && (
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, ${overlayFrom} 0%, ${overlayTo} 100%)`,
              }}
            />
          )}
        </div>

        {/* Overlapping logo card */}
        <div className="mx-auto max-w-5xl px-6">
          <div className="relative -mt-12 flex size-24 items-center justify-center overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900 sm:size-28">
            {logo ? (
              <div
                className="size-full"
                style={{ backgroundImage: `url(${logo})`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            ) : (
              <span className="text-3xl font-semibold" style={{ color: accent }}>
                {workspace.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Intro + Overview */}
      <section className="mx-auto max-w-5xl px-6 pt-8">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className={reveal}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Careers
              <span className="rounded-full bg-white px-2 py-0.5 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100">
                Join us
              </span>
            </span>
            <h1 className="mt-5 text-5xl font-semibold tracking-tight sm:text-6xl">
              {headline}
            </h1>
            {config.intro.body && (
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
                {config.intro.body}
              </p>
            )}
            {config.intro.chips.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2.5">
                {config.intro.chips.map((chip) => {
                  const Icon = careerIcon(chip.icon);
                  return (
                    <span
                      key={chip.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600"
                    >
                      {Icon && (
                        <Icon className="size-3.5" style={{ color: accent }} strokeWidth={1.8} />
                      )}
                      {chip.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {config.overview.enabled && config.overview.stats.length > 0 && (
            <aside
              className={`rounded-3xl border border-zinc-200 p-6 shadow-sm dark:border-zinc-800 ${reveal}`}
              style={{ animationDelay: "120ms" }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex size-9 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: accent }}
                >
                  <Briefcase className="size-4" strokeWidth={1.8} />
                </span>
                <h2 className="text-lg font-semibold">{config.overview.title}</h2>
              </div>
              <dl className="mt-5 space-y-3.5">
                {config.overview.stats.map((stat) => {
                  const Icon = careerIcon(stat.icon);
                  return (
                    <div
                      key={stat.label}
                      className="flex items-center justify-between text-sm"
                    >
                      <dt className="text-zinc-500 dark:text-zinc-400">{stat.label}</dt>
                      <dd className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {Icon && <Icon className="size-3.5 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} />}
                        {stat.value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <a
                href="#positions"
                className="mt-6 block rounded-xl bg-zinc-900 px-4 py-2.5 text-center text-sm font-medium text-white transition-transform duration-150 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900"
              >
                See open positions
              </a>
            </aside>
          )}
        </div>
      </section>

      {/* Gallery */}
      {config.gallery.enabled && config.gallery.images.length > 0 && (
        <section className="mx-auto mt-14 max-w-6xl px-6">
          <CareerGallery gallery={config.gallery} />
        </section>
      )}

      {/* Values */}
      {config.values.enabled && config.values.items.length > 0 && (
        <section className="mx-auto mt-16 max-w-5xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            {config.values.title}
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {config.values.items.map((value, i) => {
              const art = VALUE_ART[i % VALUE_ART.length];
              return (
                <div
                  key={value.title}
                  className={`group ${reveal}`}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div
                    className="relative aspect-square overflow-hidden rounded-3xl transition-transform duration-300 ease-out group-hover:-translate-y-1"
                    style={{ backgroundColor: art.bg }}
                  >
                    <span
                      className="absolute -right-6 -top-6 size-24 rounded-full"
                      style={{ backgroundColor: art.blob }}
                    />
                    <span
                      className="absolute bottom-3 left-3 size-14 rounded-2xl"
                      style={{ backgroundColor: art.blob, opacity: 0.55 }}
                    />
                  </div>
                  <h3 className="mt-3 font-semibold tracking-tight">{value.title}</h3>
                  {value.body && (
                    <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {value.body}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Open positions */}
      <section id="positions" className="mx-auto mt-16 max-w-5xl scroll-mt-8 px-6">
        <h2 className="text-3xl font-semibold tracking-tight">
          {config.positions.title}
        </h2>
        <div className="mt-7">
          <CareerPositions jobs={jobs} boardRoot={boardRoot} accent={accent} />
        </div>
      </section>

      {/* Testimonials */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <section className="mx-auto mt-16 max-w-5xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            {config.testimonials.title}
          </h2>
          <div className="mt-8">
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </div>
        </section>
      )}

      {/* FAQ */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className="mx-auto mt-16 max-w-5xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            {config.faq.title}
          </h2>
          <div className="mt-8">
            <CareerFaq items={config.faq.items} accent={accent} />
          </div>
        </section>
      )}

      {/* CTA banner */}
      {config.cta.enabled && (
        <section className="mx-auto mt-14 max-w-5xl px-6">
          <div
            className="relative overflow-hidden rounded-3xl px-8 py-10"
            style={{ backgroundColor: `${ctaColor}1A` }}
          >
            <span
              className="absolute -right-10 -top-10 size-44 rounded-full opacity-30"
              style={{ backgroundColor: ctaColor }}
            />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold tracking-tight">
                  {config.cta.title}
                </h3>
                {config.cta.body && (
                  <p className="mt-1 max-w-xl text-zinc-600 dark:text-zinc-300">{config.cta.body}</p>
                )}
              </div>
              {workspace.websiteUrl && (
                <a
                  href={workspace.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98]"
                  style={{ backgroundColor: ctaColor }}
                >
                  Get in touch
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="mx-auto mt-20 max-w-5xl px-6 pb-12">
        <div className="border-t border-zinc-100 pt-6 dark:border-zinc-800">
          <CareerFooter config={config} logo={workspace.logoUrl} workspaceName={workspace.name} maxWidth="max-w-5xl" />
        </div>
      </footer>
    </div>
  );
}
