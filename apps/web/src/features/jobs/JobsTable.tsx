"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Search } from "lucide-react";

import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { JobActionsMenu } from "@/features/jobs/JobActionsMenu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterPill, FILTER_ALL } from "@/components/ui/FilterPill";
import { JobIdentity } from "@/features/jobs/JobIdentity";
import {
  formatEmploymentType,
  formatWorkplaceType,
} from "@/lib/format";

export type JobRow = {
  id: string;
  title: string;
  slug: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
  status: "draft" | "open" | "closed";
  applicants: number;
  activeApplicants: number;
  newApplicants: number;
  createdAt: Date;
};

type SortKey = "recent" | "oldest" | "applicants" | "title";

function uniqueSorted(values: (string | null)[]) {
  return Array.from(
    new Set(values.filter((v): v is string => Boolean(v && v.trim()))),
  ).sort((a, b) => a.localeCompare(b));
}

const STATUS_OPTIONS = ["draft", "open", "closed"];
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

const EMPLOYMENT_OPTIONS = ["full_time", "part_time", "contract", "internship"];
const WORKPLACE_OPTIONS = ["remote", "hybrid", "onsite"];

const SORT_OPTIONS = ["recent", "oldest", "applicants", "title"];
const SORT_LABELS: Record<string, string> = {
  recent: "Most recent",
  oldest: "Oldest",
  applicants: "Most applicants",
  title: "Title A–Z",
};

export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(FILTER_ALL);
  const [dept, setDept] = useState(FILTER_ALL);
  const [employment, setEmployment] = useState(FILTER_ALL);
  const [workplace, setWorkplace] = useState(FILTER_ALL);
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  const departments = useMemo(
    () => uniqueSorted(jobs.map((j) => j.department)),
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = jobs.filter((j) => {
      if (q) {
        const haystack = [j.title, j.department, j.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (status !== FILTER_ALL && j.status !== status) return false;
      if (dept !== FILTER_ALL && j.department !== dept) return false;
      if (employment !== FILTER_ALL && j.employmentType !== employment)
        return false;
      if (workplace !== FILTER_ALL && j.workplaceType !== workplace) return false;
      return true;
    });

    return [...base].sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "applicants") return b.applicants - a.applicants;
      if (sortKey === "oldest")
        return a.createdAt.getTime() - b.createdAt.getTime();
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [jobs, query, status, dept, employment, workplace, sortKey]);

  const maxApplicants = Math.max(1, ...filtered.map((j) => j.applicants));

  const filtersActive =
    status !== FILTER_ALL ||
    dept !== FILTER_ALL ||
    employment !== FILTER_ALL ||
    workplace !== FILTER_ALL ||
    query.trim() !== "";

  function clearFilters() {
    setQuery("");
    setStatus(FILTER_ALL);
    setDept(FILTER_ALL);
    setEmployment(FILTER_ALL);
    setWorkplace(FILTER_ALL);
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search jobs by title, department or location…"
          className="h-11 rounded-full pl-11"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          labelMap={STATUS_LABELS}
        />
        <FilterPill
          label="Department"
          value={dept}
          onChange={setDept}
          options={departments}
        />
        <FilterPill
          label="Type"
          value={employment}
          onChange={setEmployment}
          options={EMPLOYMENT_OPTIONS}
          labelMap={Object.fromEntries(
            EMPLOYMENT_OPTIONS.map((o) => [o, formatEmploymentType(o)]),
          )}
        />
        <FilterPill
          label="Workplace"
          value={workplace}
          onChange={setWorkplace}
          options={WORKPLACE_OPTIONS}
          labelMap={Object.fromEntries(
            WORKPLACE_OPTIONS.map((o) => [o, formatWorkplaceType(o)]),
          )}
        />
        <FilterPill
          label="Sort"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={SORT_OPTIONS}
          labelMap={SORT_LABELS}
          allValue="recent"
        />
        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="rounded-full text-muted-foreground"
          >
            Clear
          </Button>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {filtered.length}
          </span>{" "}
          {filtered.length === 1 ? "role" : "roles"}
        </p>
      </div>

      {/* List */}
      <Card className="gap-0 divide-y divide-border/60 overflow-hidden py-0">
        {filtered.map((job) => (
          <div
            key={job.id}
            className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_10rem_9rem_auto] sm:px-5"
          >
            <Link
              href={`/dashboard/jobs/${job.id}` as Route}
              className="min-w-0"
            >
              <JobIdentity
                title={job.title}
                department={job.department}
                location={job.location}
              />
            </Link>

            <div className="hidden text-xs text-muted-foreground sm:block">
              {formatEmploymentType(job.employmentType)}
              <span className="mx-1 text-border">·</span>
              {formatWorkplaceType(job.workplaceType)}
            </div>

            {/* Applicants — count + mini bar (the "graph") */}
            <div className="hidden min-w-0 sm:block">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {job.applicants}
                </span>
                {job.newApplicants > 0 ? (
                  <span className="text-[0.65rem] font-medium text-primary">
                    +{job.newApplicants} new
                  </span>
                ) : null}
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(job.applicants / maxApplicants) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                {job.applicants === 1 ? "Candidate" : "Candidates"}
                {job.activeApplicants > 0
                  ? ` · ${job.activeApplicants} active`
                  : ""}
              </p>
            </div>

            <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 sm:col-auto sm:row-auto">
              <JobStatusBadge status={job.status} />
              <JobActionsMenu jobId={job.id} slug={job.slug} />
            </div>
          </div>
        ))}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Search className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No jobs match your filters.
            </p>
            {filtersActive ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
