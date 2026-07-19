import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  MapPin,
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { CareerTestimonials } from "@/features/career-page/CareerTestimonials";
import { CareerFaq } from "@/features/career-page/CareerFaq";
import { CareerFooter } from "@/features/career-page/CareerFooter";
import { RichBody } from "@/features/career-page/RichBody";

const reveal =
  "duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards motion-reduce:animate-none";

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
 * AshbyTemplate , structured, application-like layout. Sticky left sidebar with
 * search + facet filters (department / location / type), dense job rows grouped
 * by department on the right. Neutral, no decoration. Light/dark native.
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
  const accent = config.theme.accent ?? workspace.primaryColor;
  const headline = config.hero.headline || "Open roles";
  const logo = workspace.logoUrl;
  const enabled = config.positions.filters;

  const departments = useMemo(() => facet(jobs, (j) => j.department), [jobs]);
  const locations = useMemo(
    () =>
      facet(jobs, (j) => j.location ?? formatWorkplaceType(j.workplaceType)),
    [jobs],
  );
  const types = useMemo(
    () => facet(jobs, (j) => formatEmploymentType(j.employmentType)),
    [jobs],
  );

  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<
    Record<"department" | "location" | "type", Set<string>>
  >({
    department: new Set(),
    location: new Set(),
    type: new Set(),
  });

  function toggle(facetKey: "department" | "location" | "type", value: string) {
    setSel((prev) => {
      const next = new Set(prev[facetKey]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [facetKey]: next };
    });
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (q && !j.title.toLowerCase().includes(q)) return false;
      if (
        sel.department.size &&
        !(j.department && sel.department.has(j.department))
      )
        return false;
      if (sel.location.size) {
        const loc = j.location ?? formatWorkplaceType(j.workplaceType);
        if (!sel.location.has(loc)) return false;
      }
      if (sel.type.size) {
        const t = formatEmploymentType(j.employmentType);
        if (!sel.type.has(t)) return false;
      }
      return true;
    });
  }, [jobs, query, sel]);

  // Group the filtered list by department for section headers.
  const groups = useMemo(() => {
    const map = new Map<string, Job[]>();
    shown.forEach((j) => {
      const key = j.department ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const facetGroups = [
    {
      key: "department" as const,
      label: "Department",
      icon: Building2,
      values: departments,
    },
    {
      key: "location" as const,
      label: "Location",
      icon: MapPin,
      values: locations,
    },
    { key: "type" as const, label: "Type", icon: Briefcase, values: types },
  ].filter((g) => enabled.includes(g.key) && g.values.length > 0);

  return (
    <div className="text-zinc-900 dark:text-zinc-100">
      {/* Header */}
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
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={workspace.name}
              className="size-8 rounded-md object-contain"
            />
          ) : (
            <span
              className="flex size-8 items-center justify-center rounded-md text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              {workspace.name.charAt(0).toUpperCase()}
            </span>
          )}
          {config.hero.showName ? (
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {workspace.name}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {headline}
        </h1>
        {config.intro.body && (
          <div className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
            <RichBody html={config.intro.body} />
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[240px_1fr]">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 transition focus-within:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-zinc-100">
              <Search className="size-4 text-zinc-400" strokeWidth={1.8} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search roles"
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
              />
            </div>

            {facetGroups.map((g) => (
              <div key={g.key} className="mt-7">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  <g.icon className="size-3.5" strokeWidth={2} />
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
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          on
                            ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                            : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                            on
                              ? "border-transparent"
                              : "border-zinc-300 dark:border-zinc-600",
                          )}
                          style={on ? { backgroundColor: accent } : undefined}
                        >
                          {on && (
                            <svg
                              viewBox="0 0 12 12"
                              className="size-3 text-white"
                              fill="none"
                            >
                              <path
                                d="M2.5 6.5l2.5 2.5 4.5-5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1 truncate">{v}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </aside>

          {/* Job list */}
          <main>
            <div className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              {shown.length} open {shown.length === 1 ? "role" : "roles"}
            </div>

            {groups.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 py-16 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                No roles match these filters.
              </p>
            ) : (
              <div className="space-y-10">
                {groups.map(([dept, deptJobs], groupIdx) => (
                  <section
                    key={dept}
                    className={reveal}
                    style={{ animationDelay: `${groupIdx * 120}ms` }}
                  >
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {dept}
                      </h2>
                      <span className="text-xs tabular-nums text-zinc-400">
                        {deptJobs.length}{" "}
                        {deptJobs.length === 1 ? "role" : "roles"}
                      </span>
                    </div>
                    <div className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                      {deptJobs.map((job) => (
                        <Link
                          key={job.id}
                          href={`${boardRoot}/jobs/${job.slug}` as Route}
                          className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        >
                          <span className="flex-1 font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
                            {job.title}
                          </span>
                          <span className="hidden text-sm text-zinc-500 dark:text-zinc-400 sm:inline">
                            {job.location ??
                              formatWorkplaceType(job.workplaceType)}
                          </span>
                          <span className="hidden text-sm text-zinc-500 dark:text-zinc-400 sm:inline">
                            {formatEmploymentType(job.employmentType)}
                          </span>
                          <ArrowUpRight
                            className="size-4 -translate-x-1 text-zinc-300 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 dark:text-zinc-600"
                            strokeWidth={1.8}
                          />
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Testimonials */}
      {config.testimonials.enabled && config.testimonials.items.length > 0 && (
        <div className="border-t border-zinc-200 px-6 py-12 dark:border-zinc-800">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight">
              {config.testimonials.title}
            </h2>
            <CareerTestimonials
              items={config.testimonials.items}
              accent={accent}
            />
          </div>
        </div>
      )}

      {/* FAQ */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <div className="border-t border-zinc-200 px-6 py-12 dark:border-zinc-800">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight">
              {config.faq.title}
            </h2>
            <CareerFaq items={config.faq.items} accent={accent} />
          </div>
        </div>
      )}

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="py-8">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            portalWorkspaceSlug={workspace.slug}
            maxWidth="max-w-6xl"
            iconRounded="rounded-md"
            portalEnabled={portalEnabled}
            legalBasePath={boardRoot === "/" ? "/legal" : `${boardRoot}/legal`}
          />
        </div>
      </footer>
    </div>
  );
}
