"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Check, ChevronRight, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { careerIcon } from "@/features/career-page/icons";
import { CareerEmpty } from "@/features/career-page/CareerEmpty";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { RichBody } from "@/features/career-page/RichBody";
import { CareerGallery } from "@/features/career-page/CareerGallery";
import { readableInk } from "@/features/career-page/color";
import {
  boardBase,
  facet,
  jobLocation,
  jobType,
} from "@/features/career-page/job-filters";
import { careerTheme, htmlToExcerpt, visibleStats } from "@/features/career-page/theme";

const reveal =
  "duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

const ALL = "__all__";

const h2 = "text-2xl font-semibold tracking-tight";
const sectionRule = "scroll-mt-8 border-t border-hairline pt-10 mt-10";
const selectClass =
  "rounded-[var(--career-r-inner,12px)] border border-hairline bg-pure-snow px-3 py-2 text-sm text-near-ink transition-colors hover:border-mist-border";

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

/**
 * JoinTemplate: company-profile tab bar over a filterable job list, modelled
 * on join.com. A circular logo mark (or wordmark) + name + compact meta line, a
 * short intro excerpt with a "Read more" jump to the full About section, a
 * horizontal tab bar with a live active state (only sections with real content
 * appear), Category/Location dropdown filters and a plain job list with a
 * result count. Accent reserved for the active tab, tints and the CTA.
 * Honours: headline, subhead (falls back to tagline), show headline, logo type,
 * overview stats (meta line), intro, positions title and department/location
 * filters, values, gallery (autoplay and speed), CTA, testimonials, FAQ.
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
  const theme = careerTheme(config, workspace.primaryColor);
  const { accent, tintBg, tintInk } = theme;
  const base = boardBase(boardRoot);
  const enabled = config.positions.filters;
  const headline = config.hero.headline || `Careers at ${workspace.name}`;
  const deptId = useId();
  const locId = useId();

  const wordmark =
    config.hero.logoType === "fullLogo" ? (workspace.fullLogoUrl ?? null) : null;
  const logo = workspace.logoUrl;

  const [department, setDepartment] = useState(ALL);
  const [location, setLocation] = useState(ALL);

  const departments = useMemo(() => facet(jobs, (j) => j.department), [jobs]);
  const locations = useMemo(() => facet(jobs, jobLocation), [jobs]);

  const shown = useMemo(
    () =>
      jobs.filter((j) => {
        if (department !== ALL && j.department !== department) return false;
        if (location !== ALL && jobLocation(j) !== location) return false;
        return true;
      }),
    [jobs, department, location],
  );

  const stats = config.overview.enabled ? visibleStats(config.overview.stats) : [];
  const showValues = config.values.enabled && config.values.items.length > 0;
  const photos = config.gallery.enabled ? config.gallery.images.filter(Boolean) : [];
  const officeLocations = useMemo(() => {
    const map = new Map<string, number>();
    jobs.forEach((j) => {
      const loc = jobLocation(j);
      map.set(loc, (map.get(loc) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  const subhead = config.hero.subhead || workspace.tagline;
  const excerpt = config.intro.body ? htmlToExcerpt(config.intro.body, Infinity) : "";

  const ctaHref = config.cta.url || workspace.websiteUrl;
  const ctaBg = config.cta.color ?? tintInk;

  const tabs = [
    { id: "positions", label: config.positions.title || "Open positions", show: true },
    { id: "about", label: "About us", show: Boolean(config.intro.body) },
    { id: "values", label: config.values.title || "Values", show: showValues },
    { id: "images", label: "Images", show: photos.length > 0 },
    { id: "locations", label: "Locations", show: officeLocations.length > 0 },
  ].filter((t) => t.show);
  const tabKey = tabs.map((t) => t.id).join(",");

  // Active tab follows the scroll position (and the URL hash on arrival).
  const [activeTab, setActiveTab] = useState("positions");
  useEffect(() => {
    const ids = tabKey.split(",");
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveTab(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tabKey]);

  return (
    <div className="text-near-ink" style={theme.vars}>
      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        {/* Header */}
        <div className={reveal}>
          {wordmark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wordmark}
              alt={workspace.name}
              className="h-12 w-auto max-w-[240px] object-contain object-left"
            />
          ) : logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={workspace.name}
              className="size-16 rounded-full border border-hairline bg-white object-contain p-2"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-16 items-center justify-center rounded-full text-xl font-semibold"
              style={{ backgroundColor: tintBg, color: tintInk }}
            >
              {workspace.name.charAt(0).toUpperCase()}
            </span>
          )}

          {config.hero.showHeadline ? (
            <h1 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {headline}
            </h1>
          ) : (
            <h1 className="sr-only">{headline}</h1>
          )}

          {(stats.length > 0 || subhead) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-soft-ink">
              {subhead && <span>{subhead}</span>}
              {stats.map((st, i) => {
                const Icon = careerIcon(st.icon || fallbackStatIcon(st.label));
                return (
                  <span key={`${st.label}-${i}`} className="flex items-center gap-1.5">
                    {(subhead || i > 0) && (
                      <span className="text-quiet-mist" aria-hidden>
                        ·
                      </span>
                    )}
                    {Icon && <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />}
                    {st.value} {st.label}
                  </span>
                );
              })}
            </div>
          )}

          {excerpt && (
            <p className="mt-4 max-w-2xl text-soft-ink">
              {excerpt}
            </p>
          )}
        </div>

        {/* Tab bar */}
        {tabs.length > 1 && (
          <nav
            aria-label="Page sections"
            className="scrollbar-none mt-9 flex gap-6 overflow-x-auto border-b border-hairline"
          >
            {tabs.map((t) => {
              const on = activeTab === t.id;
              return (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  aria-current={on ? "true" : undefined}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "-mb-px shrink-0 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors motion-reduce:transition-none",
                    on
                      ? "border-[var(--career-accent)] text-near-ink"
                      : "border-transparent text-soft-ink hover:border-[var(--career-accent)] hover:text-near-ink",
                  )}
                >
                  {t.label}
                  {t.id === "positions" && jobs.length > 0 && (
                    <span className="ml-1.5 text-soft-ink">{jobs.length}</span>
                  )}
                </a>
              );
            })}
          </nav>
        )}

        {/* Positions */}
        <section id="positions" className={`${reveal} scroll-mt-8 pt-10`}>
          {!(tabs.length > 1) && <h2 className={cn(h2, "mb-5")}>{config.positions.title}</h2>}
          {jobs.length > 0 &&
            (enabled.includes("department") || enabled.includes("location")) && (
              <div className="flex flex-wrap gap-3">
                {enabled.includes("department") && departments.length > 0 && (
                  <div>
                    <label htmlFor={deptId} className="sr-only">
                      Filter by category
                    </label>
                    <select
                      id={deptId}
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className={selectClass}
                    >
                      <option value={ALL}>All categories</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {enabled.includes("location") && locations.length > 0 && (
                  <div>
                    <label htmlFor={locId} className="sr-only">
                      Filter by location
                    </label>
                    <select
                      id={locId}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={selectClass}
                    >
                      <option value={ALL}>All locations</option>
                      {locations.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

          {jobs.length === 0 ? (
            <CareerEmpty kind="none" portalEnabled={portalEnabled} className="mt-6" />
          ) : shown.length === 0 ? (
            <CareerEmpty
              kind="filtered"
              className="mt-5"
              onReset={() => {
                setDepartment(ALL);
                setLocation(ALL);
              }}
            />
          ) : (
            <>
              <div className="mt-5 divide-y divide-hairline overflow-hidden rounded-[var(--career-r-card,16px)] border border-hairline bg-pure-snow">
                {shown.map((job, rowIdx) => (
                  <Link
                    key={job.id}
                    href={`${base}/jobs/${job.slug}` as Route}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-row-wash motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-safe:fill-mode-backwards"
                    style={{ animationDelay: `${Math.min(rowIdx, 8) * 30}ms` }}
                  >
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-[var(--career-r-inner,12px)] text-xs font-semibold"
                      style={{ backgroundColor: tintBg, color: tintInk }}
                    >
                      {(job.department ?? job.title).charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium tracking-tight">
                        {job.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-soft-ink">
                        <MapPin className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
                        {jobLocation(job)}
                        <span className="text-quiet-mist" aria-hidden>
                          ·
                        </span>
                        {jobType(job)}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-soft-ink transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-right text-xs text-soft-ink" aria-live="polite">
                {shown.length} of {jobs.length} {jobs.length === 1 ? "result" : "results"}
              </p>
            </>
          )}
        </section>

        {/* About us: the full intro (the header only carries an excerpt) */}
        {config.intro.body && (
          <section id="about" className={`${reveal} ${sectionRule}`}>
            <h2 className={h2}>About us</h2>
            <div className="mt-4 max-w-2xl text-soft-ink">
              <RichBody html={config.intro.body} />
            </div>
          </section>
        )}

        {/* Values / benefits checklist */}
        {showValues && (
          <section id="values" className={`${reveal} ${sectionRule}`}>
            <h2 className={h2}>{config.values.title}</h2>
            <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {config.values.items.map((v, i) => (
                <li key={`${v.title}-${i}`} className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 size-4 shrink-0"
                    strokeWidth={2}
                    style={{ color: "var(--career-accent)" }}
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium tracking-tight">{v.title}</span>
                    {v.body && <span className="block text-sm text-soft-ink">{v.body}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Images */}
        {photos.length > 0 && (
          <section id="images" className={`${reveal} ${sectionRule}`}>
            <h2 className={h2}>Images</h2>
            <div className="mt-5">
              <CareerGallery
                gallery={{ ...config.gallery, enabled: true }}
                rounded="rounded-[var(--career-r-card,16px)]"
                aspectClass="h-56 w-72"
                label={`Photos from ${workspace.name}`}
              />
            </div>
          </section>
        )}

        {/* Locations */}
        {officeLocations.length > 0 && (
          <section id="locations" className={`${reveal} ${sectionRule}`}>
            <h2 className={h2}>Locations</h2>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {officeLocations.map(([loc, count]) => (
                <div
                  key={loc}
                  className="flex items-center justify-between gap-3 rounded-[var(--career-r-card,16px)] border border-hairline bg-pure-snow px-5 py-4"
                >
                  <span className="flex items-center gap-2 font-medium tracking-tight">
                    <MapPin
                      className="size-4 shrink-0"
                      strokeWidth={1.8}
                      style={{ color: "var(--career-accent)" }}
                      aria-hidden
                    />
                    {loc}
                  </span>
                  <span className="shrink-0 text-sm text-soft-ink">
                    {count} open {count === 1 ? "role" : "roles"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        {config.cta.enabled && config.cta.title && (
          <section
            className={`${reveal} mt-14 rounded-[var(--career-r-card,16px)] p-8 text-center sm:p-10`}
            style={{ backgroundColor: tintBg }}
          >
            <h2 className={h2} style={{ color: tintInk }}>
              {config.cta.title}
            </h2>
            {config.cta.body && (
              <p className="mx-auto mt-2 max-w-xl" style={{ color: tintInk }}>
                {config.cta.body}
              </p>
            )}
            {ctaHref && (
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none"
                style={{ backgroundColor: ctaBg, color: readableInk(ctaBg) }}
              >
                {config.cta.buttonText || "Get in touch"}
                <ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />
              </a>
            )}
          </section>
        )}

        {/* Testimonials */}
        {config.testimonials.enabled && config.testimonials.items.length > 0 && (
          <section className="mt-14">
            <h2 className={cn(h2, "mb-8")}>{config.testimonials.title}</h2>
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </section>
        )}

        {/* FAQ */}
        {config.faq.enabled && config.faq.items.length > 0 && (
          <section className="mt-14">
            <h2 className={cn(h2, "mb-8")}>{config.faq.title}</h2>
            <CareerFaq items={config.faq.items} accent={accent} />
          </section>
        )}
      </div>

      <footer className="mt-4 border-t border-hairline">
        <div className="py-8">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-4xl"
            iconRounded="rounded-full"
            portalEnabled={portalEnabled}
            legalBasePath={`${base}/legal`}
          />
        </div>
      </footer>
    </div>
  );
}
