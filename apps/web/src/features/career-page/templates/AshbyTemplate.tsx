"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  Check,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { CareerEmpty } from "@/features/career-page/CareerEmpty";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { RichBody } from "@/features/career-page/RichBody";
import {
  FILTER_META,
  applyFacets,
  boardBase,
  emptySelection,
  facet,
  groupByDepartment,
  jobLocation,
  jobType,
  type FacetSelection,
  type FilterKind,
} from "@/features/career-page/job-filters";
import { careerTheme } from "@/features/career-page/theme";

const reveal =
  "duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

const ICONS: Record<FilterKind, typeof Building2> = {
  department: Building2,
  location: MapPin,
  type: Briefcase,
};

const h2 = "text-2xl font-semibold tracking-tight";

/**
 * AshbyTemplate: structured, application-like layout. Sticky left sidebar with
 * search + facet filters (department / location / type), dense job rows grouped
 * by department on the right. Neutral, no decoration. Light/dark native.
 * Honours: headline, subhead, show headline, logo position, show name, intro,
 * positions title and all three filters, testimonials, FAQ, footer.
 */
export function AshbyTemplate({
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
  const t = useTranslations("features.careerPage.ashbyTemplate");
  const tFacets = useTranslations("labels.careerPage.facets");
  const theme = careerTheme(config, workspace.primaryColor);
  const { accent, onAccent } = theme;
  const base = boardBase(boardRoot);
  const headline = config.hero.headline || t("defaultHeadline", { name: workspace.name });
  const logo = workspace.logoUrl;
  const enabled = config.positions.filters;
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<FacetSelection>(emptySelection);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const facetGroups = useMemo(
    () =>
      (["department", "location", "type"] as const)
        .filter((k) => enabled.includes(k))
        .map((k) => ({
          key: k,
          label: tFacets(k),
          icon: ICONS[k],
          values: facet(jobs, FILTER_META[k].pick),
        }))
        .filter((g) => g.values.length > 0),
    [jobs, enabled, tFacets],
  );

  function toggle(facetKey: FilterKind, value: string) {
    setSel((prev) => {
      const next = new Set(prev[facetKey]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [facetKey]: next };
    });
  }

  const shown = useMemo(() => applyFacets(jobs, sel, query), [jobs, sel, query]);
  const groups = useMemo(() => groupByDepartment(shown, tFacets("other")), [shown, tFacets]);
  const activeCount = sel.department.size + sel.location.size + sel.type.size;

  function reset() {
    setQuery("");
    setSel(emptySelection());
  }

  return (
    <div className="text-near-ink" style={theme.vars}>
      {/* Header */}
      <header className="border-b border-hairline">
        <div
          className={cn(
            "mx-auto flex max-w-6xl items-center gap-3 px-6 py-5",
            config.hero.logoPosition === "center"
              ? "justify-center"
              : config.hero.logoPosition === "right"
                ? "justify-end"
                : "justify-start",
          )}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={config.hero.showName ? "" : workspace.name}
              className="size-8 rounded-md object-contain"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-md text-sm font-semibold"
              style={{ backgroundColor: accent, color: onAccent }}
            >
              {workspace.name.charAt(0).toUpperCase()}
            </span>
          )}
          {config.hero.showName || !logo ? (
            <span className="text-sm font-medium text-soft-ink">{workspace.name}</span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        {config.hero.showHeadline ? (
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{headline}</h1>
        ) : (
          <h1 className="sr-only">{headline}</h1>
        )}
        {config.hero.subhead && (
          <p className={cn("max-w-2xl text-lg text-soft-ink", config.hero.showHeadline && "mt-3")}>
            {config.hero.subhead}
          </p>
        )}
        {config.intro.body && (
          <div className="mt-3 max-w-2xl text-soft-ink">
            <RichBody html={config.intro.body} />
          </div>
        )}

        <section id="positions" aria-labelledby="positions-title" className="mt-10 scroll-mt-8">
          <h2 id="positions-title" className="sr-only">
            {config.positions.title}
          </h2>
          {jobs.length === 0 ? (
            <CareerEmpty kind="none" portalEnabled={portalEnabled} />
          ) : (
            <div className="grid gap-8 lg:grid-cols-[240px_1fr] lg:gap-10">
              {/* Sidebar */}
              <aside className="lg:sticky lg:top-8 lg:self-start">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--career-r-inner,12px)] border border-hairline bg-pure-snow px-3 py-2 transition focus-within:border-near-ink">
                    <Search className="size-4 shrink-0 text-soft-ink" strokeWidth={1.8} aria-hidden />
                    <label htmlFor={searchId} className="sr-only">
                      {t("searchRoles")}
                    </label>
                    <input
                      id={searchId}
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("searchRoles")}
                      className="w-full bg-transparent text-base sm:text-sm text-near-ink outline-none placeholder:text-soft-ink"
                    />
                  </div>
                  {facetGroups.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFiltersOpen((o) => !o)}
                      aria-expanded={filtersOpen}
                      aria-controls="career-facets"
                      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--career-r-inner,12px)] border border-hairline bg-pure-snow px-3 text-sm font-medium text-near-ink lg:hidden"
                    >
                      <SlidersHorizontal className="size-4" strokeWidth={1.8} aria-hidden />
                      {activeCount > 0 ? t("filtersWithCount", { count: activeCount }) : t("filters")}
                    </button>
                  )}
                </div>

                <div id="career-facets" className={cn(filtersOpen ? "block" : "hidden", "lg:block")}>
                  {facetGroups.map((g) => (
                    <div key={g.key} role="group" aria-label={g.label} className="mt-7">
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-soft-ink">
                        <g.icon className="size-3.5" strokeWidth={2} aria-hidden />
                        {g.label}
                      </div>
                      <div className="mt-2.5 space-y-0.5">
                        {g.values.map((v) => {
                          const on = sel[g.key].has(v);
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => toggle(g.key, v)}
                              aria-pressed={on}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors motion-reduce:transition-none",
                                on
                                  ? "bg-row-wash font-medium text-near-ink"
                                  : "text-soft-ink hover:bg-row-wash hover:text-near-ink",
                              )}
                            >
                              <span
                                className={cn(
                                  "flex size-4 shrink-0 items-center justify-center rounded border transition-colors motion-reduce:transition-none",
                                  on ? "border-transparent" : "border-mist-border",
                                )}
                                style={on ? { backgroundColor: accent, color: onAccent } : undefined}
                              >
                                {on && <Check className="size-3" strokeWidth={3} aria-hidden />}
                              </span>
                              <span className="flex-1 truncate">{v}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {activeCount > 0 && (
                    <button
                      type="button"
                      onClick={reset}
                      className="mt-6 text-sm font-medium text-soft-ink underline underline-offset-4 hover:text-near-ink"
                    >
                      {t("clearFilters")}
                    </button>
                  )}
                </div>
              </aside>

              {/* Job list */}
              <div>
                <p className="mb-4 text-sm text-soft-ink" aria-live="polite">
                  {t("openRoles", { count: shown.length })}
                </p>

                {groups.length === 0 ? (
                  <CareerEmpty kind="filtered" onReset={reset} />
                ) : (
                  <div className="space-y-10">
                    {groups.map(([dept, deptJobs], groupIdx) => (
                      <section
                        key={dept}
                        className={reveal}
                        style={{ animationDelay: `${groupIdx * 120}ms` }}
                      >
                        <div className="flex items-baseline justify-between">
                          <h3 className="text-sm font-semibold text-near-ink">{dept}</h3>
                          <span className="text-xs tabular-nums text-soft-ink">
                            {t("roleCount", { count: deptJobs.length })}
                          </span>
                        </div>
                        <div className="mt-3 divide-y divide-hairline overflow-hidden rounded-[var(--career-r-card,16px)] border border-hairline bg-pure-snow">
                          {deptJobs.map((job) => (
                            <Link
                              key={job.id}
                              href={`${base}/jobs/${job.slug}` as Route}
                              className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-row-wash active:bg-row-wash/70"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium tracking-tight text-near-ink">
                                  {job.title}
                                </span>
                                {/* Mobile keeps the meta, stacked under the title. */}
                                <span className="mt-0.5 block text-sm text-soft-ink sm:hidden">
                                  {jobLocation(job)} · {jobType(job)}
                                </span>
                              </span>
                              <span className="hidden text-sm text-soft-ink sm:inline">
                                {jobLocation(job)}
                              </span>
                              <span className="hidden text-sm text-soft-ink sm:inline">
                                {jobType(job)}
                              </span>
                              <ArrowUpRight
                                className="size-4 shrink-0 -translate-x-1 text-soft-ink opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                                strokeWidth={1.8}
                                aria-hidden
                              />
                            </Link>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Testimonials */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <section className="border-t border-hairline px-6 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className={cn(h2, "mb-8")}>{config.testimonials.title}</h2>
            <CareerTestimonials items={config.testimonials.items} accent={accent} />
          </div>
        </section>
      )}

      {/* FAQ */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className="border-t border-hairline px-6 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className={cn(h2, "mb-8")}>{config.faq.title}</h2>
            <CareerFaq items={config.faq.items} accent={accent} />
          </div>
        </section>
      )}

      <footer className="border-t border-hairline">
        <div className="py-8">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-6xl"
            iconRounded={theme.sharp ? "rounded-none" : "rounded-md"}
            portalEnabled={portalEnabled}
            legalBasePath={`${base}/legal`}
          />
        </div>
      </footer>
    </div>
  );
}
