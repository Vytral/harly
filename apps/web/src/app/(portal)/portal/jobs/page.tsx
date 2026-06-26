import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, and } from "drizzle-orm";
import type { Route } from "next";

import { db, jobs } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import {
  MapPinIcon,
  CurrencyDollarIcon,
  ArrowUpRightIcon,
  BriefcaseIcon,
} from "@/components/ui/icons/phosphor";

export const dynamic = "force-dynamic";

const WORKPLACE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

const WORKPLACE_COLORS: Record<string, string> = {
  remote: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  hybrid: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400",
  onsite: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

function formatSalary(min: number | null, max: number | null, currency: string | null, period: string | null): string | null {
  if (!min && !max) return null;
  const cur = currency ?? "USD";
  const fmt = (v: number) => v >= 1000 ? `${cur} ${Math.round(v / 1000)}k` : `${cur} ${v}`;
  const suffix = period === "monthly" ? "/mo" : "/yr";
  if (min && max) return `${fmt(min)} – ${fmt(max)}${suffix}`;
  if (min) return `From ${fmt(min)}${suffix}`;
  return `Up to ${fmt(max!)}${suffix}`;
}

export default async function PortalJobsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const openJobs = await db
    .select({
      id: jobs.id,
      slug: jobs.slug,
      title: jobs.title,
      department: jobs.department,
      location: jobs.location,
      workplaceType: jobs.workplaceType,
      employmentType: jobs.employmentType,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      currency: jobs.currency,
      salaryPeriod: jobs.salaryPeriod,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, session.workspaceId),
        eq(jobs.status, "open"),
      ),
    )
    .orderBy(desc(jobs.publishedAt));

  const byDept = openJobs.reduce<Record<string, typeof openJobs>>((acc, job) => {
    const key = job.department ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {});
  const depts = Object.keys(byDept).sort();

  return (
    <PortalShell>
      <div className="space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Open positions
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Join our team
          </h1>
          {openJobs.length > 0 && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {openJobs.length} open role{openJobs.length === 1 ? "" : "s"} across{" "}
              {depts.length} department{depts.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {openJobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <BriefcaseIcon className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="font-medium text-foreground">No open roles right now</p>
            <p className="mt-1 text-sm text-muted-foreground">Check back soon for new opportunities.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {depts.map((dept) => (
              <section key={dept}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                    {dept}
                  </h2>
                  <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                  <span className="text-xs text-muted-foreground">{byDept[dept].length}</span>
                </div>
                <div className="space-y-2.5">
                  {byDept[dept].map((job) => {
                    const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency, job.salaryPeriod);
                    return (
                      <a
                        key={job.id}
                        href={`/jobs/${job.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 sm:p-5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-muted-foreground transition-colors">
                              {job.title}
                            </h3>
                            <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPinIcon className="size-3" />
                                {job.location}
                              </span>
                            )}
                            {job.employmentType && (
                              <span>
                                {EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}
                              </span>
                            )}
                            {salary && (
                              <span className="flex items-center gap-1">
                                <CurrencyDollarIcon className="size-3" />
                                {salary}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {job.workplaceType && (
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${WORKPLACE_COLORS[job.workplaceType] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                              {WORKPLACE_LABELS[job.workplaceType] ?? job.workplaceType}
                            </span>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
