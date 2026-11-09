"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Route } from "next";
import { Search } from "lucide-react";

import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { JobActionsMenu } from "@/features/jobs/JobActionsMenu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterPill, FILTER_ALL } from "@/components/ui/FilterPill";
import {
  HumanTable,
  HumanTableHead,
  Td,
  Th,
  Tr,
} from "@/components/ui/human-table";
import { ShortDate } from "@/lib/date-hydration";
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
const EMPLOYMENT_OPTIONS = ["full_time", "part_time", "contract", "internship"];
const WORKPLACE_OPTIONS = ["remote", "hybrid", "onsite"];

const SORT_OPTIONS = ["recent", "oldest", "applicants", "title"];
export function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const t = useTranslations("jobs.table");
  const statusLabels = { draft: t("draft"), open: t("open"), closed: t("closed") };
  const sortLabels = { recent: t("mostRecent"), oldest: t("oldest"), applicants: t("mostApplicants"), title: t("titleAZ") };
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
    <Card className="gap-0 py-0">
      {/* Filter bar: search + pill filters */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-4 sm:px-5">
        <div className="relative w-full sm:w-64">
          <Search aria-hidden className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-soft-ink" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
    placeholder={t("search")}
            aria-label={t("search")}
            className="h-9 rounded-full border-transparent bg-card-inset pl-9 shadow-none"
          />
        </div>
        <FilterPill
          label={t("status")}
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          labelMap={statusLabels}
        />
        <FilterPill
          label={t("department")}
          value={dept}
          onChange={setDept}
          options={departments}
        />
        <FilterPill
          label={t("type")}
          value={employment}
          onChange={setEmployment}
          options={EMPLOYMENT_OPTIONS}
          labelMap={Object.fromEntries(
            EMPLOYMENT_OPTIONS.map((o) => [o, formatEmploymentType(o)]),
          )}
        />
        <FilterPill
          label={t("workplace")}
          value={workplace}
          onChange={setWorkplace}
          options={WORKPLACE_OPTIONS}
          labelMap={Object.fromEntries(
            WORKPLACE_OPTIONS.map((o) => [o, formatWorkplaceType(o)]),
          )}
        />
        <FilterPill
          label={t("sort")}
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={SORT_OPTIONS}
          labelMap={sortLabels}
          allValue="recent"
        />
        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="rounded-full text-soft-ink"
          >
            {t("clear")}
          </Button>
        ) : null}
      </div>

      <p className="border-t border-hairline px-4 py-3 text-[13px] text-soft-ink sm:px-5" aria-live="polite">
        {t("total")} {" "}
        <span className="font-semibold tabular-nums text-near-ink">{filtered.length}</span>{" "}
        {t("items", { count: filtered.length })}
      </p>

      {filtered.length > 0 ? (
        <HumanTable className="px-2 pb-3">
          <HumanTableHead>
            <Th>{t("jobTitle")}</Th>
            <Th className="hidden md:table-cell">{t("created")}</Th>
            <Th className="hidden sm:table-cell">{t("type")}</Th>
            <Th>{t("pendingCandidates")}</Th>
            <Th className="hidden lg:table-cell">{t("candidates")}</Th>
            <Th>{t("status")}</Th>
            <Th srOnly>{t("actions")}</Th>
          </HumanTableHead>
          <tbody>
            {filtered.map((job) => (
              <Tr key={job.id}>
                <Td className="min-w-56">
                  <Link
                    href={`/dashboard/jobs/${job.id}` as Route}
                    className="group block rounded-[var(--radius-btn)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                  >
                    <JobIdentity
                      title={job.title}
                      department={job.department}
                      location={job.location}
                    />
                  </Link>
                </Td>
                <Td className="hidden whitespace-nowrap text-[13.5px] text-near-ink md:table-cell">
                  <ShortDate value={job.createdAt} />
                </Td>
                <Td className="hidden whitespace-nowrap text-[13px] text-soft-ink sm:table-cell">
                  {formatEmploymentType(job.employmentType)}
                  <span className="mx-1 text-quiet-mist" aria-hidden="true">·</span>
                  {formatWorkplaceType(job.workplaceType)}
                </Td>
                <Td className="whitespace-nowrap">
                  {job.activeApplicants > 0 ? (
                    <Link
                      href={`/dashboard/pipeline?jobId=${job.id}` as Route}
                      className="text-[13.5px] font-medium text-near-ink underline decoration-hairline decoration-2 underline-offset-4 hover:decoration-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                    >
                      {t("active", { count: job.activeApplicants })}
                    </Link>
                  ) : (
                    <span className="text-[13.5px] text-quiet-mist">{t("nonePending")}</span>
                  )}
                  {job.newApplicants > 0 ? (
                    <span className="ml-2 text-[11.5px] font-medium text-success-olive">
                      {t("newCandidates", { count: job.newApplicants })}
                    </span>
                  ) : null}
                </Td>
                <Td className="hidden lg:table-cell">
                  <span
                    className="inline-flex items-center rounded-full bg-card-inset px-2.5 py-1 text-[12px] font-medium tabular-nums text-near-ink"
                    title={t("candidateCounts", { total: job.applicants, active: job.activeApplicants })}
                  >
                    {job.activeApplicants}/{job.applicants}
                    <span className="sr-only">{t("candidatesActive")}</span>
                  </span>
                </Td>
                <Td>
                  <JobStatusBadge status={job.status} />
                </Td>
                <Td className="w-12 text-right">
                  <JobActionsMenu jobId={job.id} slug={job.slug} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </HumanTable>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
          <Search className="size-5 text-quiet-mist" />
          <p className="text-sm text-soft-ink">{t("noMatches")}</p>
          {filtersActive ? (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t("clearFilters")}
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
