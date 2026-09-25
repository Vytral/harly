"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Check, ChevronRight, MapPin } from "lucide-react";

import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { careerIcon } from "@/features/career-page/icons";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { RichBody } from "@/features/career-page/RichBody";
import { CareerGallery } from "@/features/career-page/CareerGallery";
import { SocialIcon, socialLabel } from "@/features/career-page/social-icons";
import { accentPalette } from "@/features/career-page/color";

const reveal =
  "duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

const ALL = "__all__";

/** Best-guess icon for stats saved before the icon picker existed (matched by
 * label so older/blank configs still render with an icon instead of none). */
function fallbackStatIcon(label: string): string | undefined {
  const key = label.trim().toLowerCase();
  if (key.includes("found")) return "calendar";
  if (key.includes("team") || key.includes("employee") || key.includes("people"))
    return "users";
  if (key.includes("location") || key.includes("office")) return "map-pin";
  return undefined;
}

/** Distinct, sorted facet values for a key. */
function facet(jobs: Job[], pick: (j: Job) => string | null): string[] {
  const set = new Set<string>();
  jobs.forEach((j) => {
    const v = pick(j);
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}

/**
 * JoinTemplate — company-profile tab bar over a filterable job list, modelled
 * on join.com. Signature traits preserved from that reference: a circular logo
 * mark + name + compact meta line, a clamped description with a "Read more"
 * jump, a horizontal section tab bar (jobs/about/values/images/locations —
 * only sections with real content appear), Category/Location dropdown filters
 * (not sidebar checkboxes — that's Ashby's job), and a plain job list with a
 * result count. Neutral canvas, accent reserved for the active tab underline,
 * hover chevrons, and the primary CTA. Light/dark native.
 */
export function JoinTemplate({
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
  const pal = accentPalette(accent);
  const logo = workspace.logoUrl;
  const enabled = config.positions.filters;

  const [descOpen, setDescOpen] = useState(false);
  const [department, setDepartment] = useState(ALL);
  const [location, setLocation] = useState(ALL);

  const departments = useMemo(() => facet(jobs, (j) => j.department), [jobs]);
  const locations = useMemo(
    () => facet(jobs, (j) => j.location ?? formatWorkplaceType(j.workplaceType)),
    [jobs],
  );

  const shown = useMemo(() => {
    return jobs.filter((j) => {
      if (department !== ALL && j.department !== department) return false;
      if (location !== ALL) {
        const loc = j.location ?? formatWorkplaceType(j.workplaceType);
        if (loc !== location) return false;
      }
      return true;
    });
  }, [jobs, department, location]);

  const stats = config.overview.enabled
    ? config.overview.stats.filter((st) => st.value.trim())
    : [];
  const socials = config.footer.socials.filter((s) => s.url.trim());
  const showValues = config.values.enabled && config.values.items.length > 0;
  const photos = config.gallery.enabled
    ? config.gallery.images.filter(Boolean)
    : [];
  const officeLocations = useMemo(() => {
    const map = new Map<string, number>();
    jobs.forEach((j) => {
      const loc = j.location ?? formatWorkplaceType(j.workplaceType);
      map.set(loc, (map.get(loc) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  const tabs = [
    { id: "positions", label: config.positions.title || "Open positions", show: true },
    { id: "about", label: "About us", show: Boolean(config.intro.body) },
    { id: "values", label: config.values.title || "Values", show: showValues },
    { id: "images", label: "Images", show: photos.length > 0 },
    { id: "locations", label: "Locations", show: officeLocations.length > 0 },
  ].filter((t) => t.show);

  return (
    <div className="text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        {/* Header */}
        <div className={reveal}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={workspace.name}
              className="size-16 rounded-full border border-zinc-200 object-contain p-2 dark:border-zinc-800"
            />
          ) : (
            <span
              className="flex size-16 items-center justify-center rounded-full text-xl font-semibold"
              style={{ backgroundColor: pal.tintBg, color: pal.ink }}
            >
              {workspace.name.charAt(0).toUpperCase()}
            </span>
          )}

          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            {config.hero.headline || workspace.name}
          </h1>

          {(stats.length > 0 || config.hero.subhead || workspace.tagline) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
              {(config.hero.subhead || workspace.tagline) && (
                <span>{config.hero.subhead || workspace.tagline}</span>
              )}
              {stats.map((st, i) => {
                const Icon = careerIcon(st.icon || fallbackStatIcon(st.label));
                return (
                  <span key={`${st.label}-${i}`} className="flex items-center gap-1.5">
                    {(config.hero.subhead || workspace.tagline || i > 0) && (
                      <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    )}
                    {Icon && (
                      <Icon
                        className="size-3.5 text-zinc-400 dark:text-zinc-500"
                        strokeWidth={1.8}
                      />
                    )}
                    {st.value} {st.label}
                  </span>
                );
              })}
            </div>
          )}

          {config.intro.body && (
            <div
              className={
                descOpen
                  ? "mt-4 max-w-2xl text-zinc-600 dark:text-zinc-400"
                  : "mt-4 line-clamp-2 max-w-2xl text-zinc-600 dark:text-zinc-400"
              }
            >
              <RichBody html={config.intro.body} />
            </div>
          )}
          {config.intro.body && !descOpen && (
            <button
              type="button"
              onClick={() => setDescOpen(true)}
              className="mt-1 text-sm font-medium underline-offset-2 hover:underline"
              style={{ color: pal.ink }}
            >
              Read more
            </button>
          )}

          {socials.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {socials.map((s, i) => (
                <a
                  key={`${s.platform}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100"
                >
                  <SocialIcon platform={s.platform} className="size-3.5" />
                  {socialLabel(s.platform)}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Tab bar */}
        {tabs.length > 1 && (
          <nav className="scrollbar-none mt-9 flex gap-6 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
            {tabs.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="shrink-0 whitespace-nowrap border-b-2 border-transparent py-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                style={{ ["--tw-border-hover" as string]: accent }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
              >
                {t.label}
                {t.id === "positions" && jobs.length > 0 && (
                  <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">
                    {jobs.length}
                  </span>
                )}
              </a>
            ))}
          </nav>
        )}

        {/* Positions */}
        <section id="positions" className={`${reveal} scroll-mt-8 pt-10`}>
          {enabled.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {enabled.includes("department") && departments.length > 0 && (
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <option value={ALL}>All categories</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              {enabled.includes("location") && locations.length > 0 && (
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <option value={ALL}>All locations</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {shown.length === 0 ? (
            <p className="mt-8 rounded-xl border border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              No open positions right now.
            </p>
          ) : (
            <>
              <div className="mt-5 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {shown.map((job) => (
                  <Link
                    key={job.id}
                    href={`${boardRoot}/jobs/${job.slug}` as Route}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: pal.tintBg, color: pal.ink }}
                    >
                      {(job.department ?? job.title).charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium tracking-tight">
                        {job.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <MapPin className="size-3.5 shrink-0" strokeWidth={1.8} />
                        {job.location ?? formatWorkplaceType(job.workplaceType)}
                        <span className="text-zinc-300 dark:text-zinc-600">·</span>
                        {formatEmploymentType(job.employmentType)}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 dark:text-zinc-600"
                      strokeWidth={1.8}
                    />
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-right text-xs text-zinc-400 dark:text-zinc-500">
                {shown.length} of {jobs.length} results
              </p>
            </>
          )}
        </section>

        {/* About us */}
        {config.intro.body && (
          <section id="about" className={`${reveal} scroll-mt-8 border-t border-zinc-100 pt-10 mt-10 dark:border-zinc-800`}>
            <h2 className="text-xl font-semibold tracking-tight">About us</h2>
            <div className="mt-4 max-w-2xl text-zinc-600 dark:text-zinc-400">
              <RichBody html={config.intro.body} />
            </div>
          </section>
        )}

        {/* Values / benefits checklist */}
        {showValues && (
          <section id="values" className={`${reveal} scroll-mt-8 border-t border-zinc-100 pt-10 mt-10 dark:border-zinc-800`}>
            <h2 className="text-xl font-semibold tracking-tight">
              {config.values.title}
            </h2>
            <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {config.values.items.map((v, i) => (
                <li key={`${v.title}-${i}`} className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 size-4 shrink-0"
                    strokeWidth={2}
                    style={{ color: pal.ink }}
                  />
                  <span>
                    <span className="font-medium tracking-tight">{v.title}</span>
                    {v.body && (
                      <span className="block text-sm text-zinc-500 dark:text-zinc-400">
                        {v.body}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Images */}
        {photos.length > 0 && (
          <section id="images" className={`${reveal} scroll-mt-8 border-t border-zinc-100 pt-10 mt-10 dark:border-zinc-800`}>
            <h2 className="text-xl font-semibold tracking-tight">Images</h2>
            <div className="mt-5">
              <CareerGallery
                gallery={{ ...config.gallery, enabled: true, autoplay: true }}
                rounded="rounded-xl"
                aspectClass="h-56 w-72"
              />
            </div>
          </section>
        )}

        {/* Locations */}
        {officeLocations.length > 0 && (
          <section id="locations" className={`${reveal} scroll-mt-8 border-t border-zinc-100 pt-10 mt-10 dark:border-zinc-800`}>
            <h2 className="text-xl font-semibold tracking-tight">Locations</h2>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {officeLocations.map(([loc, count]) => (
                <div
                  key={loc}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-5 py-4 dark:border-zinc-800"
                >
                  <span className="flex items-center gap-2 font-medium tracking-tight">
                    <MapPin className="size-4 shrink-0" strokeWidth={1.8} style={{ color: pal.ink }} />
                    {loc}
                  </span>
                  <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
                    {count} open {count === 1 ? "role" : "roles"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        {config.cta.enabled && config.cta.title && (
          <section className={`${reveal} mt-14 rounded-2xl p-8 text-center sm:p-10`} style={{ backgroundColor: pal.tintBg }}>
            <h2 className="text-2xl font-semibold tracking-tight" style={{ color: pal.ink }}>
              {config.cta.title}
            </h2>
            {config.cta.body && (
              <p className="mx-auto mt-2 max-w-xl" style={{ color: pal.ink, opacity: 0.8 }}>
                {config.cta.body}
              </p>
            )}
            {workspace.websiteUrl && (
              <a
                href={workspace.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                style={{ backgroundColor: config.cta.color ?? pal.ink }}
              >
                {config.cta.buttonText || "Get in touch"}
                <ArrowUpRight className="size-4" strokeWidth={2} />
              </a>
            )}
          </section>
        )}

        {/* Testimonials */}
        {config.testimonials.enabled && config.testimonials.items.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight">
              {config.testimonials.title}
            </h2>
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </section>
        )}

        {/* FAQ */}
        {config.faq.enabled && config.faq.items.length > 0 && (
          <section className="mt-14">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight">
              {config.faq.title}
            </h2>
            <CareerFaq items={config.faq.items} accent={accent} />
          </section>
        )}
      </div>

      <footer className="mt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="py-8">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-4xl"
            iconRounded="rounded-full"
            portalEnabled={portalEnabled}
            legalBasePath={boardRoot === "/" ? "/legal" : `${boardRoot}/legal`}
          />
        </div>
      </footer>
    </div>
  );
}
