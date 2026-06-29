import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import { CareerPositions } from "@/features/career-page/CareerPositions";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerGallery } from "@/features/career-page/CareerGallery";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { careerIcon } from "@/features/career-page/icons";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";

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
  const logo = workspace.logoUrl;
  const heroImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  const showGradient = config.hero.overlay === "gradient" && Boolean(heroImage);
  const overlayFrom = config.hero.overlayFrom ?? `${accent}E6`;
  const overlayTo = config.hero.overlayTo ?? `${accent}00`;

  return (
    <div className="text-zinc-900 dark:text-zinc-100">
      {/* Full-screen hero */}
      <header
        id="hero"
        className="relative flex min-h-[85vh] flex-col items-center justify-center overflow-hidden px-6 text-center"
        style={
          heroImage
            ? { backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { backgroundColor: accent }
        }
      >
        {/* Overlay */}
        <div
          className="absolute inset-0"
          style={
            showGradient
              ? { background: `linear-gradient(90deg, ${overlayFrom} 0%, ${overlayTo} 100%)` }
              : heroImage
                ? { background: "rgba(0,0,0,0.6)" }
                : { background: "rgba(0,0,0,0.15)" }
          }
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-6">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={workspace.name} className="h-14 w-auto object-contain drop-shadow-lg" />
          ) : null}
          {config.hero.showName && !logo ? (
            <p className="text-sm font-semibold uppercase tracking-widest text-white/70">{workspace.name}</p>
          ) : null}
          <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-white drop-shadow-md sm:text-6xl">
            {headline}
          </h1>
          {subhead ? (
            <p className="max-w-2xl text-xl text-white/85 drop-shadow">{subhead}</p>
          ) : null}
          <a
            href="#positions"
            className="mt-2 inline-flex h-12 items-center rounded-full px-8 text-sm font-semibold shadow-lg transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
            style={{ backgroundColor: accent, color: "#ffffff" }}
          >
            View jobs
          </a>
        </div>
      </header>

      {/* Intro + chips */}
      {config.intro.body || config.intro.chips.length > 0 ? (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            {config.intro.body ? (
              <p className="text-xl leading-relaxed text-zinc-700 dark:text-zinc-300">{config.intro.body}</p>
            ) : null}
            {config.intro.chips.length > 0 ? (
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                {config.intro.chips.map((chip) => {
                  const Icon = careerIcon(chip.icon);
                  return (
                    <span
                      key={chip.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      {Icon ? <Icon className="size-3.5" style={{ color: accent }} strokeWidth={1.8} /> : null}
                      {chip.label}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Gallery — right after intro for the Shockbyte-style feel */}
      {config.gallery.enabled && config.gallery.images.length > 0 ? (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="py-12">
            <CareerGallery gallery={config.gallery} rounded="rounded-2xl" aspectClass="h-64 w-80" />
          </div>
        </section>
      ) : null}

      {/* Overview — centered stat grid */}
      {config.overview.enabled && config.overview.stats.length > 0 ? (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-6 py-16">
            <h2 className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
              {config.overview.title}
            </h2>
            <dl className="mt-8 grid grid-cols-2 gap-8 sm:grid-cols-4">
              {config.overview.stats.map((stat) => {
                const Icon = careerIcon(stat.icon);
                return (
                  <div key={stat.label} className="flex flex-col items-center text-center">
                    <dd className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                      {Icon ? <Icon className="size-5 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} /> : null}
                      {stat.value || "—"}
                    </dd>
                    <dt className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{stat.label}</dt>
                  </div>
                );
              })}
            </dl>
          </div>
        </section>
      ) : null}

      {/* Values */}
      {config.values.enabled && config.values.items.length > 0 ? (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-6 py-16">
            <h2 className="text-2xl font-bold tracking-tight">{config.values.title}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {config.values.items.map((value, i) => (
                <div key={value.title} className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 font-semibold tracking-tight">{value.title}</h3>
                  {value.body ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{value.body}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Open positions */}
      <section id="positions" className="scroll-mt-8 py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-8 text-2xl font-bold tracking-tight">{config.positions.title}</h2>
          <CareerPositions jobs={jobs} boardRoot={boardRoot} accent={accent} />

          {/* CTA flush below jobs */}
          {config.cta.enabled && config.cta.title ? (
            <div className="mt-16 rounded-3xl px-8 py-12 text-center" style={{ backgroundColor: `${config.cta.color ?? accent}18` }}>
              <h2 className="text-2xl font-bold tracking-tight">{config.cta.title}</h2>
              {config.cta.body ? (
                <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{config.cta.body}</p>
              ) : null}
              {workspace.websiteUrl ? (
                <a
                  href={workspace.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex h-11 items-center rounded-full px-7 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
                  style={{ backgroundColor: config.cta.color ?? accent }}
                >
                  Get in touch
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* Testimonials */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <section className="border-t border-zinc-200 py-16 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-8 text-2xl font-bold tracking-tight">{config.testimonials.title}</h2>
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </div>
        </section>
      )}

      {/* FAQ */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className="border-t border-zinc-200 py-16 dark:border-zinc-800">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="mb-8 text-2xl font-bold tracking-tight">{config.faq.title}</h2>
            <CareerFaq items={config.faq.items} accent={accent} />
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-8 dark:border-zinc-800">
        <CareerFooter config={config} logo={workspace.logoUrl} workspaceName={workspace.name} maxWidth="max-w-4xl" iconRounded="rounded-lg" />
      </footer>
    </div>
  );
}
