"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { CareerEmpty } from "./CareerEmpty";
import {
  FILTER_META,
  applyFacets,
  boardBase,
  emptySelection,
  facet,
  jobLocation,
  jobType,
  type FacetSelection,
  type FilterKind,
} from "./job-filters";
import type { Job } from "./types";

const pill =
  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none";
const pillOn = "bg-near-ink text-pure-snow";
const pillOff = "text-soft-ink hover:bg-row-wash hover:text-near-ink";

/**
 * Filterable job list (pill facets, then a divided list). Every enabled facet
 * with at least one value gets a labelled row of toggle pills. AND between
 * facets, OR within one. Distinguishes "no roles" from "filters hid them all".
 */
export function CareerPositions({
  jobs,
  boardRoot,
  accent,
  filters = ["department"],
  portalEnabled = false,
}: {
  jobs: Job[];
  boardRoot: string;
  accent: string;
  filters?: FilterKind[];
  portalEnabled?: boolean;
}) {
  const t = useTranslations("features.careerPage.careerPositions");
  const base = boardBase(boardRoot);
  const facetLabel: Record<FilterKind, string> = {
    department: t("facet.department"),
    location: t("facet.location"),
    type: t("facet.type"),
  };
  const facetGroupLabel: Record<FilterKind, string> = {
    department: t("filterGroup.department"),
    location: t("filterGroup.location"),
    type: t("filterGroup.type"),
  };

  const facetValues = useMemo(() => {
    const result: Record<FilterKind, string[]> = { department: [], location: [], type: [] };
    for (const f of filters) result[f] = facet(jobs, FILTER_META[f].pick);
    return result;
  }, [jobs, filters]);

  const [sel, setSel] = useState<FacetSelection>(emptySelection);

  function toggle(facetKey: FilterKind, value: string) {
    setSel((prev) => {
      const next = new Set(prev[facetKey]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [facetKey]: next };
    });
  }

  const shown = useMemo(() => applyFacets(jobs, sel), [jobs, sel]);
  const activeFilters = filters.filter((f) => facetValues[f].length > 0);

  function clearFacet(facetKey: FilterKind) {
    setSel((prev) => ({ ...prev, [facetKey]: new Set() }));
  }

  if (jobs.length === 0) {
    return <CareerEmpty kind="none" portalEnabled={portalEnabled} />;
  }

  return (
    <div>
      {activeFilters.map((f) => (
        <div
          key={f}
          role="group"
          aria-label={facetGroupLabel[f]}
          className="mb-4 flex flex-wrap items-center gap-2"
        >
          {activeFilters.length > 1 && (
            <span className="mr-1 w-20 text-xs font-medium uppercase tracking-wide text-soft-ink">
              {facetLabel[f]}
            </span>
          )}
          <button
            type="button"
            onClick={() => clearFacet(f)}
            aria-pressed={sel[f].size === 0}
            className={cn(pill, sel[f].size === 0 ? pillOn : pillOff)}
          >
            {t("all")}
          </button>
          {facetValues[f].map((value) => {
            const on = sel[f].has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(f, value)}
                aria-pressed={on}
                className={cn(pill, on ? pillOn : pillOff)}
              >
                {value}
              </button>
            );
          })}
        </div>
      ))}

      {shown.length === 0 ? (
        <CareerEmpty kind="filtered" onReset={() => setSel(emptySelection())} className="mt-6" />
      ) : (
        <div className="mt-6 divide-y divide-hairline border-t border-hairline">
          {shown.map((job) => (
            <Link
              key={job.id}
              href={`${base}/jobs/${job.slug}` as Route}
              className="group grid grid-cols-1 items-center gap-1 py-5 transition-colors duration-150 hover:bg-row-wash sm:grid-cols-[1fr_auto_auto_auto] sm:gap-6 sm:px-2"
            >
              <span className="flex items-center gap-2 text-lg font-medium tracking-tight text-near-ink">
                {job.title}
                <ArrowUpRight
                  className="size-4 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                  style={{ color: `var(--career-accent, ${accent})` }}
                  aria-hidden
                />
              </span>
              <span className="text-sm text-soft-ink">{job.department ?? t("other")}</span>
              <span className="text-sm text-soft-ink">{jobType(job)}</span>
              <span className="text-sm text-soft-ink">{jobLocation(job)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
