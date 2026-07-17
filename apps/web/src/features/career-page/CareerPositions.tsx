"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";

import type { Job } from "./types";

type FilterKind = "department" | "location" | "type";

/** Distinct, sorted facet values for a key. */
function facet(jobs: Job[], pick: (j: Job) => string | null): string[] {
  const set = new Set<string>();
  jobs.forEach((j) => {
    const v = pick(j);
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}

const FILTER_META: Record<FilterKind, { label: string; pick: (j: Job) => string | null }> = {
  department: { label: "Department", pick: (j) => j.department },
  location: { label: "Location", pick: (j) => j.location ?? formatWorkplaceType(j.workplaceType) },
  type: { label: "Type", pick: (j) => formatEmploymentType(j.employmentType) },
};

export function CareerPositions({
  jobs,
  boardRoot,
  accent,
  filters = ["department"],
}: {
  jobs: Job[];
  boardRoot: string;
  accent: string;
  filters?: FilterKind[];
}) {
  // Compute distinct values per enabled facet.
  const facetValues = useMemo(() => {
    const result: Record<FilterKind, string[]> = { department: [], location: [], type: [] };
    for (const f of filters) {
      result[f] = facet(jobs, FILTER_META[f].pick);
    }
    return result;
  }, [jobs, filters]);

  // Multi-select state per facet (AND between facets, OR within facet).
  const [sel, setSel] = useState<Record<FilterKind, Set<string>>>({
    department: new Set(),
    location: new Set(),
    type: new Set(),
  });

  function toggle(facetKey: FilterKind, value: string) {
    setSel((prev) => {
      const next = new Set(prev[facetKey]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [facetKey]: next };
    });
  }

  const shown = useMemo(() => {
    return jobs.filter((j) => {
      if (sel.department.size && !(j.department && sel.department.has(j.department))) return false;
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
  }, [jobs, sel]);

  const activeFilters = filters.filter((f) => facetValues[f].length > 0);

  function clearFacet(facetKey: FilterKind) {
    setSel((prev) => ({ ...prev, [facetKey]: new Set() }));
  }

  return (
    <div>
      {activeFilters.map((f) => (
        <div key={f} className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => clearFacet(f)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150",
              sel[f].size === 0
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            )}
          >
            All
          </button>
          {facetValues[f].map((value) => {
            const on = sel[f].has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(f, value)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150",
                  on
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                )}
              >
                {value}
              </button>
            );
          })}
        </div>
      ))}

      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No open positions match these filters.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
          {shown.map((job) => (
            <Link
              key={job.id}
              href={`${boardRoot}/jobs/${job.slug}` as Route}
              className="group grid grid-cols-1 items-center gap-2 py-5 transition-colors duration-150 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-6 sm:px-2"
            >
              <span className="flex items-center gap-2 text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
                {job.title}
                <ArrowUpRight
                  className="size-4 -translate-x-1 text-zinc-400 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                  style={{ color: accent }}
                />
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {job.department ?? "Not specified"}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {formatEmploymentType(job.employmentType)}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {job.location ?? formatWorkplaceType(job.workplaceType) ?? "Not specified"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
