import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, and, inArray, isNull } from "drizzle-orm";
import type { Route } from "next";

import { applications, db, jobs } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import {
  MapPinIcon,
  CurrencyDollarIcon,
  CaretRightIcon,
  BriefcaseIcon,
} from "@/components/ui/icons/phosphor";
import { StatusPill } from "@/components/ui/status-pill";
import { PortalEmptyState } from "@/features/portal/PortalEmptyState";

export const dynamic = "force-dynamic";

const WORKPLACE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
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
        isNull(jobs.deletedAt),
      ),
    )
    .orderBy(desc(jobs.publishedAt));

  // Roles this candidate already has an open application for.
  const appliedRows =
    openJobs.length > 0
      ? await db
          .select({ jobId: applications.jobId, id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.workspaceId, session.workspaceId),
              eq(applications.candidateId, session.candidateId),
              inArray(applications.status, ["active", "hired"]),
              inArray(
                applications.jobId,
                openJobs.map((job) => job.id),
              ),
            ),
          )
      : [];
  const appliedByJob = new Map(appliedRows.map((row) => [row.jobId, row.id]));

  const byDept = openJobs.reduce<Record<string, typeof openJobs>>((acc, job) => {
    const key = job.department ?? "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {});
  const depts = Object.keys(byDept).sort();

  return (
    <PortalShell>
      <div className="stagger-in mx-auto max-w-3xl space-y-8">
        <header className="pt-2">
          <h1 className="text-[28px] font-semibold tracking-tight text-near-ink">Open roles</h1>
          <p className="mt-1 text-[15px] text-soft-ink">
            {openJobs.length > 0
              ? `${openJobs.length} open role${openJobs.length === 1 ? "" : "s"} across ${depts.length} team${depts.length === 1 ? "" : "s"}. Apply with your saved profile.`
              : "New roles show up here as soon as they open."}
          </p>
        </header>

        {openJobs.length === 0 ? (
          <PortalEmptyState
            icon={BriefcaseIcon}
            title="No open roles right now"
            description="Check back soon. Your profile stays on file, so applying later takes a minute."
          />
        ) : (
          <div className="space-y-8">
            {depts.map((dept) => (
              <section key={dept} aria-labelledby={`dept-${dept}`}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 id={`dept-${dept}`} className="text-[13px] font-semibold uppercase tracking-wider text-soft-ink">
                    {dept}
                  </h2>
                  <div className="h-px flex-1 bg-hairline" />
                  <span className="text-[12px] tabular-nums text-soft-ink">{byDept[dept].length}</span>
                </div>
                <ul className="space-y-2.5">
                  {byDept[dept].map((job) => {
                    const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency, job.salaryPeriod);
                    const applicationId = appliedByJob.get(job.id);
                    return (
                      <li key={job.id}>
                        <Link
                          href={(applicationId ? `/portal/applications/${applicationId}` : `/portal/jobs/${job.id}`) as Route}
                          className="group flex items-center gap-4 rounded-2xl border border-hairline bg-card p-4 transition-[border-color,box-shadow,transform] duration-200 hover:border-foreground/15 hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.995] sm:p-5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <h3 className="min-w-0 truncate text-[15px] font-semibold text-near-ink">{job.title}</h3>
                              {applicationId ? (
                                <StatusPill size="sm" tone="success">
                                  Applied
                                </StatusPill>
                              ) : null}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-soft-ink">
                              {job.location ? (
                                <span className="inline-flex items-center gap-1">
                                  <MapPinIcon className="size-3.5" />
                                  {job.location}
                                </span>
                              ) : null}
                              {job.workplaceType ? <span>{WORKPLACE_LABELS[job.workplaceType] ?? job.workplaceType}</span> : null}
                              {job.employmentType ? (
                                <span>{EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}</span>
                              ) : null}
                              {salary ? (
                                <span className="inline-flex items-center gap-1">
                                  <CurrencyDollarIcon className="size-3.5" />
                                  {salary}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <CaretRightIcon className="size-4 shrink-0 text-soft-ink transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-near-ink" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
