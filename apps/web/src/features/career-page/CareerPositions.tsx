"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

type Job = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

const WORKPLACE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export function CareerPositions({
  jobs,
  boardRoot,
  accent,
}: {
  jobs: Job[];
  boardRoot: string;
  accent: string;
}) {
  const departments = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => j.department && set.add(j.department));
    return Array.from(set).sort();
  }, [jobs]);

  const [active, setActive] = useState<string>("All");
  const shown = jobs.filter((j) => active === "All" || j.department === active);

  return (
    <div>
      {departments.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {["All", ...departments].map((dept) => {
            const on = active === dept;
            return (
              <button
                key={dept}
                type="button"
                onClick={() => setActive(dept)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150",
                  on
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                )}
              >
                {dept}
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No open positions in this category right now.
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
                {job.department ?? "—"}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {job.location ?? WORKPLACE_LABEL[job.workplaceType] ?? "—"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
