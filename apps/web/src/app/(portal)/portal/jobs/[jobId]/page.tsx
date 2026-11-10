import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, inArray, isNull } from "drizzle-orm";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";

import {
  applications,
  candidates,
  db,
  jobs,
} from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { JobApplyForm } from "@/features/portal/JobApplyForm";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { RichBody } from "@/features/career-page/RichBody";
import {
  MapPinIcon,
  CurrencyDollarIcon,
} from "@/components/ui/icons/phosphor";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ jobId: string }>;
};

type PortalT = Awaited<ReturnType<typeof getTranslations>>;

function formatSalary(
  t: PortalT,
  min: number | null,
  max: number | null,
  currency: string | null,
  period: string | null,
): string | null {
  if (!min && !max) return null;
  const cur = currency ?? "USD";
  const fmt = (v: number) =>
    v >= 1000
      ? t("salary.thousandAmount", { currency: cur, value: Math.round(v / 1000) })
      : t("salary.amount", { currency: cur, value: v });
  const suffix = t(period === "monthly" ? "salary.perMonth" : "salary.perYear");
  if (min && max) return t("salary.range", { min: fmt(min), max: fmt(max), period: suffix });
  if (min) return t("salary.from", { amount: fmt(min), period: suffix });
  return t("salary.upTo", { amount: fmt(max!), period: suffix });
}

const WORKPLACE_KEYS: Record<string, "remote" | "hybrid" | "onsite"> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
};

const EMPLOYMENT_KEYS: Record<string, "fullTime" | "partTime" | "contract" | "internship"> = {
  full_time: "fullTime",
  part_time: "partTime",
  contract: "contract",
  internship: "internship",
};

function workplaceLabel(t: PortalT, value: string): string {
  const key = WORKPLACE_KEYS[value];
  return key ? t(`workplaceOptions.${key}`) : value;
}

function employmentLabel(t: PortalT, value: string): string {
  const key = EMPLOYMENT_KEYS[value];
  return key ? t(`employmentOptions.${key}`) : value;
}

export default async function JobDetailPage({ params }: PageProps) {
  const t = await getTranslations("pages.portalJobDetail.page");
  const { jobId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [job] = await db
    .select({
      id: jobs.id,
      applicationConfig: jobs.applicationConfig,
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
        inArray(applications.status, ["active", "hired"]),
      ),
    )
    .limit(1);

  const questions = normalizeJobApplicationConfig(job.applicationConfig).questions.map(
    (question) => ({
      id: question.id,
      key: question.id,
      label: question.label,
      type: question.type,
      required: question.required,
      minLength: question.minLength ?? null,
      placeholder: question.placeholder ?? null,
      options: question.options ?? [],
      description: question.description ?? null,
      optionDescriptions: question.optionDescriptions ?? [],
      agreeLabel: question.agreeLabel ?? null,
      disagreeLabel: question.disagreeLabel ?? null,
    }),
  );

  const salary = formatSalary(t, job.salaryMin, job.salaryMax, job.currency, job.salaryPeriod);

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
          {t("backToJobs")}
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
              <span>{workplaceLabel(t, job.workplaceType)}</span>
            )}
            {job.employmentType && (
              <span>{employmentLabel(t, job.employmentType)}</span>
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
            <h2 className="mb-2 text-sm font-semibold text-foreground">{t("aboutRole")}</h2>
            <RichBody html={job.description} className="prose prose-sm max-w-none text-muted-foreground" />
          </div>
        )}

        {existingApp ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {t("alreadyApplied")}
            </p>
            <Link
              href={`/portal/applications/${existingApp.id}` as Route}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              {t("viewApplication")}
            </Link>
          </div>
        ) : (
          <JobApplyForm jobId={job.id} questions={questions} />
        )}
      </div>
    </PortalShell>
  );
}
