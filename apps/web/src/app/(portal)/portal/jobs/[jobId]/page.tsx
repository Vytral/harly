import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, asc, isNull } from "drizzle-orm";
import type { Route } from "next";

import {
  applicationQuestions,
  applications,
  candidates,
  db,
  jobs,
} from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { JobApplyForm } from "@/features/portal/JobApplyForm";
import {
  MapPinIcon,
  CurrencyDollarIcon,
} from "@/components/ui/icons/phosphor";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ jobId: string }>;
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

export default async function JobDetailPage({ params }: PageProps) {
  const { jobId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [job] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      description: jobs.description,
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
        eq(jobs.id, jobId),
        eq(jobs.workspaceId, session.workspaceId),
        eq(jobs.status, "open"),
        isNull(jobs.deletedAt),
      ),
    )
    .limit(1);

  if (!job) redirect("/portal/jobs" as Route);

  const [existingApp] = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, applications.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.candidateId, session.candidateId),
        eq(applications.jobId, jobId),
        eq(applications.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  const questions = await db
    .select({
      id: applicationQuestions.id,
      key: applicationQuestions.key,
      label: applicationQuestions.label,
      type: applicationQuestions.type,
      required: applicationQuestions.required,
      minLength: applicationQuestions.minLength,
      placeholder: applicationQuestions.placeholder,
      options: applicationQuestions.options,
    })
    .from(applicationQuestions)
    .where(eq(applicationQuestions.jobId, jobId))
    .orderBy(asc(applicationQuestions.order));

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.currency, job.salaryPeriod);

  return (
    <PortalShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/portal/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to jobs
        </Link>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {job.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {job.department && <span>{job.department}</span>}
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPinIcon className="size-3.5" />
                {job.location}
              </span>
            )}
            {job.workplaceType && (
              <span>{WORKPLACE_LABELS[job.workplaceType] ?? job.workplaceType}</span>
            )}
            {job.employmentType && (
              <span>{EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}</span>
            )}
            {salary && (
              <span className="flex items-center gap-1">
                <CurrencyDollarIcon className="size-3.5" />
                {salary}
              </span>
            )}
          </div>
        </div>

        {job.description && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-2 text-sm font-semibold text-foreground">About the role</h2>
            <div className="prose prose-sm max-w-none text-muted-foreground">
              {job.description}
            </div>
          </div>
        )}

        {existingApp ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              You&apos;ve already applied to this position
            </p>
            <Link
              href={`/portal/applications/${existingApp.id}` as Route}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              View your application
            </Link>
          </div>
        ) : (
          <JobApplyForm jobId={job.id} questions={questions} />
        )}
      </div>
    </PortalShell>
  );
}
