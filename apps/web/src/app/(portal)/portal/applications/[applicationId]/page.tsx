import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, and, asc } from "drizzle-orm";
import type { Route } from "next";

import {
  applications,
  db,
  jobs,
  jobStages,
  interviews,
  user,
} from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { formatShort, formatTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  LockSimpleIcon,
  MapPinIcon,
} from "@/components/ui/icons/phosphor";

export const dynamic = "force-dynamic";

const STATUS_STYLES = {
  active: "bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/50 dark:text-blue-400 dark:ring-blue-800/40",
  hired: "bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400 dark:ring-emerald-800/40",
  rejected: "bg-red-50 text-red-600 ring-red-200/60 dark:bg-red-950/50 dark:text-red-400 dark:ring-red-800/40",
  withdrawn: "bg-muted text-muted-foreground ring-border",
} as const;

const STATUS_LABELS = {
  active: "In progress",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
} as const;

const INTERVIEW_STATUS_STYLES = {
  scheduled: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  canceled: "bg-muted text-muted-foreground",
} as const;

type PageProps = {
  params: Promise<{ applicationId: string }>;
};

export default async function ApplicationDetailPage({ params }: PageProps) {
  const { applicationId } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [appRow] = await db
    .select({
      id: applications.id,
      status: applications.status,
      appliedAt: applications.appliedAt,
      jobId: applications.jobId,
      currentStageId: applications.currentStageId,
      jobTitle: jobs.title,
      jobDepartment: jobs.department,
      jobLocation: jobs.location,
      jobWorkplaceType: jobs.workplaceType,
      jobEmploymentType: jobs.employmentType,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.candidateId, session.candidateId),
        eq(applications.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  if (!appRow) notFound();

  const stages = await db
    .select({ id: jobStages.id, name: jobStages.name, order: jobStages.order })
    .from(jobStages)
    .where(eq(jobStages.jobId, appRow.jobId))
    .orderBy(asc(jobStages.order));

  const currentIdx = stages.findIndex((s) => s.id === appRow.currentStageId);
  const isTerminal = appRow.status === "rejected" || appRow.status === "withdrawn";

  const interviewsList = await db
    .select({
      id: interviews.id,
      title: interviews.title,
      type: interviews.type,
      mode: interviews.mode,
      status: interviews.status,
      scheduledAt: interviews.scheduledAt,
      durationMins: interviews.durationMins,
      location: interviews.location,
      notes: interviews.notes,
      interviewerName: user.name,
      interviewerImage: user.image,
    })
    .from(interviews)
    .leftJoin(user, eq(user.id, interviews.interviewerId))
    .where(eq(interviews.applicationId, appRow.id))
    .orderBy(asc(interviews.scheduledAt));

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

  return (
    <PortalShell>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/portal/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to dashboard
        </Link>

        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {appRow.jobTitle}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {appRow.jobDepartment && <span>{appRow.jobDepartment}</span>}
                {appRow.jobLocation && <span>{appRow.jobLocation}</span>}
                {appRow.jobWorkplaceType && (
                  <span>{WORKPLACE_LABELS[appRow.jobWorkplaceType] ?? appRow.jobWorkplaceType}</span>
                )}
                {appRow.jobEmploymentType && (
                  <span>{EMPLOYMENT_LABELS[appRow.jobEmploymentType] ?? appRow.jobEmploymentType}</span>
                )}
              </div>
            </div>
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", STATUS_STYLES[appRow.status])}>
              {STATUS_LABELS[appRow.status]}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Applied {formatShort(appRow.appliedAt)}
          </p>
        </div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          {/* LEFT: Pipeline */}
          <div className="space-y-6">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Interview plan</h3>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="p-4">
                  {stages.map((stage, i) => {
                    const completed = !isTerminal && currentIdx >= 0 && i < currentIdx;
                    const isCurrent = !isTerminal && i === currentIdx;
                    const isLast = i === stages.length - 1;

                    return (
                      <div key={stage.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full",
                            completed && "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                            isCurrent && "bg-blue-100 text-blue-600 ring-2 ring-blue-200 ring-offset-1 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800 dark:ring-offset-card",
                            !completed && !isCurrent && "bg-muted text-muted-foreground",
                            isTerminal && isCurrent && "bg-red-50 text-red-400 ring-2 ring-red-200 ring-offset-1 dark:bg-red-950 dark:text-red-400 dark:ring-red-800",
                          )}>
                            {completed ? (
                              <CheckCircleIcon className="size-3.5" />
                            ) : isCurrent ? (
                              <div className="size-2 rounded-full bg-current" />
                            ) : (
                              <LockSimpleIcon className="size-3" />
                            )}
                          </div>
                          {!isLast && (
                            <div
                              className={cn("my-0.5 w-px flex-1", completed ? "bg-emerald-200 dark:bg-emerald-800" : "bg-border")}
                              style={{ minHeight: 16 }}
                            />
                          )}
                        </div>
                        <div className={cn("pb-3", isLast && "pb-0")}>
                          <p className={cn(
                            "text-sm leading-5",
                            isCurrent
                              ? "font-semibold text-foreground"
                              : completed
                                ? "font-medium text-foreground"
                                : "text-muted-foreground",
                          )}>
                            {stage.name}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT: Interviews */}
          <div className="space-y-6">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Interviews</h3>
              {interviewsList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <svg className="mx-auto mb-2 size-6 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm text-muted-foreground">No interviews scheduled yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {interviewsList.map((iv) => (
                    <div
                      key={iv.id}
                      className="rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {iv.title ?? iv.type}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                              {formatTime(iv.scheduledAt)} · {iv.durationMins} min
                            </span>
                            <span className="flex items-center gap-1">
                              {iv.mode === "video" ? (
                                <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                </svg>
                              ) : (
                                <MapPinIcon className="size-3" />
                              )}
                              {iv.mode === "video" ? "Video call" : iv.location ?? "In person"}
                            </span>
                          </div>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", INTERVIEW_STATUS_STYLES[iv.status])}>
                          {iv.status}
                        </span>
                      </div>

                      {iv.interviewerName && (
                        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                          {iv.interviewerImage ? (
                            // eslint-disable-next-line @next/next/no-img-element -- external URL
                            <img
                              src={iv.interviewerImage}
                              alt={iv.interviewerName}
                              className="size-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                              {iv.interviewerName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground">
                            with <span className="font-medium text-foreground">{iv.interviewerName}</span>
                          </span>
                        </div>
                      )}

                      {iv.notes && (
                        <div className="mt-3 flex items-start gap-2 border-t border-border pt-3">
                          <svg className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                          </svg>
                          <p className="text-xs leading-relaxed text-muted-foreground">{iv.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
