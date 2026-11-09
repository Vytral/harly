import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";

import type { Job } from "./types";

export type FilterKind = "department" | "location" | "type";

/** Display value of the location facet (city, else the workplace type). */
export function jobLocation(j: Job): string {
  return j.location ?? formatWorkplaceType(j.workplaceType);
}

/** Display value of the employment-type facet. */
export function jobType(j: Job): string {
  return formatEmploymentType(j.employmentType);
}

export const FILTER_META: Record<
  FilterKind,
  { pick: (j: Job) => string | null }
> = {
  department: { pick: (j) => j.department },
  location: { pick: jobLocation },
  type: { pick: jobType },
};

/** Distinct, sorted facet values for a key. */
export function facet(jobs: Job[], pick: (j: Job) => string | null): string[] {
  const set = new Set<string>();
  jobs.forEach((j) => {
    const v = pick(j);
    if (v) set.add(v);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Group by department (null departments land in `other`), sorted by name. */
export function groupByDepartment(
  jobs: Job[],
  other = "Other",
): Array<[string, Job[]]> {
  const map = new Map<string, Job[]>();
  jobs.forEach((j) => {
    const key = j.department ?? other;
    const list = map.get(key);
    if (list) list.push(j);
    else map.set(key, [j]);
  });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export type FacetSelection = Record<FilterKind, Set<string>>;

export const emptySelection = (): FacetSelection => ({
  department: new Set(),
  location: new Set(),
  type: new Set(),
});

/** AND between facets, OR within a facet. */
export function applyFacets(jobs: Job[], sel: FacetSelection, query = ""): Job[] {
  const q = query.trim().toLowerCase();
  return jobs.filter((j) => {
    if (q && !j.title.toLowerCase().includes(q)) return false;
    if (sel.department.size && !(j.department && sel.department.has(j.department))) return false;
    if (sel.location.size && !sel.location.has(jobLocation(j))) return false;
    if (sel.type.size && !sel.type.has(jobType(j))) return false;
    return true;
  });
}

/** Board-relative base path: the root-hosted board passes "" (or "/"). */
export function boardBase(boardRoot: string): string {
  return boardRoot === "/" ? "" : boardRoot;
}
