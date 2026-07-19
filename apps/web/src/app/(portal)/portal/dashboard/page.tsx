import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, and, asc } from "drizzle-orm";
import type { Route } from "next";

import {
  applications,
  db,
  jobs,
  jobStages,
  member,
  organization,
  user,
  workspaceSettings,
} from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { getPortalApplicationInterviews } from "@/server/portal-applications";
import { formatShort, formatTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  LockSimpleIcon,
  BriefcaseIcon,
  GlobeIcon,
  ArrowUpRightIcon,
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

export default async function PortalDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [[settings], [org]] = await Promise.all([
    db
      .select({
        tagline: workspaceSettings.tagline,
        description: workspaceSettings.description,
        websiteUrl: workspaceSettings.websiteUrl,
        heroImageUrl: workspaceSettings.heroImageUrl,
        primaryColor: workspaceSettings.primaryColor,
        showStatus: workspaceSettings.portalShowApplicationStatus,
        showHiringTeam: workspaceSettings.portalShowHiringTeam,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, session.workspaceId))
      .limit(1),
    db
      .select({ name: organization.name, logo: organization.logo })
      .from(organization)
      .where(eq(organization.id, session.workspaceId))
      .limit(1),
  ]);

  const showPipeline = settings?.showStatus !== false;
  const accentColor = settings?.primaryColor ?? "#18181b";

  const appRows = await db
    .select({
      id: applications.id,
      status: applications.status,
      appliedAt: applications.appliedAt,
      jobTitle: jobs.title,
      jobId: applications.jobId,
      currentStageId: applications.currentStageId,
    })
    .from(applications)
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, session.workspaceId)))
    .where(
      and(
        eq(applications.candidateId, session.candidateId),
        eq(applications.workspaceId, session.workspaceId),
      ),
    )
    .orderBy(desc(applications.appliedAt));

  type StageRow = { id: string; name: string; order: number };
  const stagesByJob = new Map<string, StageRow[]>();
  if (showPipeline && appRows.length > 0) {
    const jobIds = [...new Set(appRows.map((r) => r.jobId))];
    for (const jobId of jobIds) {
      const stages = await db
        .select({ id: jobStages.id, name: jobStages.name, order: jobStages.order })
        .from(jobStages)
        .where(eq(jobStages.jobId, jobId))
        .orderBy(asc(jobStages.order));
      stagesByJob.set(jobId, stages);
    }
  }

  const teamMembers = settings?.showHiringTeam
    ? await db
        .select({
          name: user.name,
          image: user.image,
          jobTitle: user.jobTitle,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, session.workspaceId))
        .limit(8)
    : [];

  // Primary app = first active one, fallback to most recent
  const primaryApp = appRows.find((a) => a.status === "active") ?? appRows[0] ?? null;
  const otherApps = primaryApp ? appRows.filter((a) => a.id !== primaryApp.id) : [];
  const interviews = primaryApp
    ? await getPortalApplicationInterviews(primaryApp.id)
    : [];

  return (
    <PortalShell>
      <div className="font-sans">
        <section className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-card shadow-[0_18px_45px_-38px_rgba(15,23,42,0.5)]">
          <div className="grid min-h-48 sm:grid-cols-[38%_62%] sm:min-h-64">
            <div className="relative min-h-40 overflow-hidden bg-muted sm:min-h-full">
              {settings?.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- workspace-managed public asset
                <img src={settings.heroImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <>
                  <div className="absolute -left-[18%] -top-[52%] size-[86%] rounded-full border-[2.75rem] border-white/35" style={{ backgroundColor: accentColor }} />
                  <div className="absolute -bottom-[43%] left-[21%] size-[92%] rounded-full border-[2.75rem] border-white/20" style={{ backgroundColor: accentColor }} />
                  <div className="absolute -right-[25%] top-[15%] size-[88%] rounded-full bg-white/20" />
                </>
              )}
            </div>
            <div className="relative flex min-h-48 items-end overflow-hidden px-6 py-7 sm:min-h-64 sm:px-10" style={{ backgroundColor: accentColor }}>
              <div className="absolute inset-0 bg-black/15" />
              <div className="relative flex items-center gap-3 text-white sm:gap-4">
                {org?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- workspace-managed public asset
                  <img src={org.logo} alt="" className="size-11 rounded-xl bg-white/95 object-cover p-1.5 sm:size-14" />
                ) : (
                  <span className="flex size-11 items-center justify-center rounded-xl bg-white/15 text-xl font-bold sm:size-14 sm:text-2xl">
                    {(org?.name ?? "C").charAt(0).toUpperCase()}
                  </span>
                )}
                <p className="text-2xl font-semibold tracking-[-0.045em] sm:text-4xl">{org?.name ?? "Careers"}</p>
              </div>
            </div>
          </div>
        </section>

        {appRows.length === 0 ? (
        /* ── Empty state ── */
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <BriefcaseIcon className="mx-auto mb-3 size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">No applications yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Browse open positions and apply to get started.
          </p>
          <Link
            href={"/portal/jobs" as Route}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-all hover:bg-foreground/90 active:scale-[0.98]"
          >
            Browse jobs
            <ArrowUpRightIcon className="size-3.5" />
          </Link>
        </div>
        ) : (
          <div className="mt-10">
            {primaryApp && (
              <section className="border-b border-border/70 pb-7">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <h1 className="text-3xl font-semibold tracking-[-0.055em] text-foreground sm:text-[2.6rem]">
                {session.firstName} {session.lastName}
                    </h1>
                    <p className="mt-1.5 text-base text-muted-foreground">
                      For <Link href={`/portal/applications/${primaryApp.id}` as Route} className="font-semibold text-foreground underline-offset-4 hover:underline">{primaryApp.jobTitle}</Link> at {org?.name ?? "this company"}
                    </p>
                  </div>
                  {teamMembers.length > 0 ? <HiringTeamAvatars members={teamMembers} accentColor={accentColor} /> : null}
                </div>
                <p className="mt-6 max-w-4xl text-base leading-7 text-muted-foreground">
                  Welcome, {session.firstName}. We&apos;ll use this space to share interview details, updates, and everything you need for the next step.
                </p>
              </section>
            )}

            <div className="mt-9 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(16rem,0.78fr)_minmax(0,1.6fr)]">
              <div className="space-y-9">
              {primaryApp && showPipeline && (stagesByJob.get(primaryApp.jobId) ?? []).length > 0 && (
                <section>
                    <h2 className="mb-4 text-lg font-semibold tracking-[-0.025em] text-foreground">Interview plan</h2>
                    <div className="overflow-hidden rounded-2xl bg-muted/55 p-2">
                    <InterviewPlanSidebar
                      app={primaryApp}
                      stages={stagesByJob.get(primaryApp.jobId) ?? []}
                    />
                  </div>
                </section>
              )}

              {teamMembers.length > 0 && (
                <section>
                    <h2 className="mb-4 text-lg font-semibold tracking-[-0.025em] text-foreground">Meet your hiring team</h2>
                    <div className="divide-y divide-border/70 border-y border-border/70">
                    {teamMembers.map((m, i) => (
                      <div
                        key={`${m.name}-${i}`}
                        className="flex items-center gap-3 py-3.5"
                      >
                        {m.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- external URL
                          <img
                            src={m.image}
                            alt={m.name ?? ""}
                            className="size-9 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                            style={{ backgroundColor: accentColor }}
                          >
                            {(m.name ?? "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {m.name ?? "Team member"}
                          </p>
                          {m.jobTitle && (
                            <p className="truncate text-xs text-muted-foreground">{m.jobTitle}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

              <div className="space-y-10">
                <section>
                  <h2 className="mb-4 text-lg font-semibold tracking-[-0.025em] text-foreground">Interviews</h2>
                  <InterviewList interviews={interviews} applicationId={primaryApp?.id ?? null} accentColor={accentColor} />
                </section>
              {otherApps.length > 0 && (
                <section>
                    <h2 className="mb-4 text-lg font-semibold tracking-[-0.025em] text-foreground">Other applications</h2>
                    <div className="divide-y divide-border/70 border-y border-border/70">
                    {otherApps.map((row) => {
                      const stages = stagesByJob.get(row.jobId) ?? [];
                      const currentIdx = stages.findIndex((s) => s.id === row.currentStageId);
                      const isTerminal = row.status === "rejected" || row.status === "withdrawn";
                      return (
                        <Link
                          key={row.id}
                          href={`/portal/applications/${row.id}` as Route}
                          className="block py-4 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{row.jobTitle}</p>
                              <p className="text-xs text-muted-foreground">Applied {formatShort(row.appliedAt)}</p>
                            </div>
                            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", STATUS_STYLES[row.status])}>
                              {STATUS_LABELS[row.status]}
                            </span>
                          </div>
                          {showPipeline && stages.length > 0 && (
                            <div className="mt-3 flex items-center gap-1.5 overflow-hidden">
                              {stages.map((stage, i) => {
                                const completed = !isTerminal && currentIdx >= 0 && i < currentIdx;
                                const isCurrent = !isTerminal && i === currentIdx;
                                return (
                                  <div key={stage.id} className="flex items-center gap-1.5">
                                    <div className={cn(
                                      "flex size-4 shrink-0 items-center justify-center rounded-full",
                                      completed && "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                                      isCurrent && "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
                                      !completed && !isCurrent && "bg-muted",
                                    )}>
                                      {completed ? (
                                        <CheckCircleIcon className="size-3" />
                                      ) : isCurrent ? (
                                        <div className="size-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                                      ) : (
                                        <div className="size-1.5 rounded-full bg-muted-foreground/30" />
                                      )}
                                    </div>
                                    {i < stages.length - 1 && (
                                      <div className={cn("h-px w-4 shrink-0", completed ? "bg-emerald-200 dark:bg-emerald-800" : "bg-border")} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}

              {(settings?.description || settings?.websiteUrl) && (
                <section>
                    <div className="border-t border-border/70 pt-7">
                      <h2 className="mb-3 text-lg font-semibold tracking-[-0.025em] text-foreground">Welcome to {org?.name ?? "the team"}</h2>
                      {settings.description && (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {settings.description}
                        </p>
                      )}
                      {settings.websiteUrl && (
                        <a
                          href={settings.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
                        >
                          <GlobeIcon className="size-3.5" />
                          Visit website
                          <ArrowUpRightIcon className="size-3" />
                        </a>
                      )}
                    </div>
                </section>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function InterviewPlanSidebar({
  app,
  stages,
}: {
  app: { status: string; currentStageId: string | null };
  stages: { id: string; name: string; order: number }[];
}) {
  const isTerminal = app.status === "rejected" || app.status === "withdrawn";
  const currentIdx = stages.findIndex((s) => s.id === app.currentStageId);

  return (
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
                isCurrent && "bg-blue-100 text-blue-600 ring-2 ring-blue-200 ring-offset-1 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800 dark:ring-offset-zinc-900",
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
  );
}

function HiringTeamAvatars({
  members,
  accentColor,
}: {
  members: Array<{
    name: string | null;
    image: string | null;
    jobTitle: string | null;
  }>;
  accentColor: string;
}) {
  const visible = members.slice(0, 4);
  const overflow = members.length - visible.length;

  return (
    <div className="flex -space-x-2" aria-label="Hiring team">
      {visible.map((member, index) =>
        member.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- workspace member image
          <img
            key={`${member.name}-${index}`}
            src={member.image}
            alt={member.name ?? "Hiring team member"}
            className="size-10 rounded-full border-2 border-background object-cover"
          />
        ) : (
          <span
            key={`${member.name}-${index}`}
            className="flex size-10 items-center justify-center rounded-full border-2 border-background text-xs font-semibold text-white"
            style={{ backgroundColor: accentColor }}
            title={member.name ?? "Hiring team member"}
          >
            {(member.name ?? "?").charAt(0).toUpperCase()}
          </span>
        ),
      )}
      {overflow > 0 ? (
        <span className="flex size-10 items-center justify-center rounded-full border-2 border-background bg-foreground text-xs font-semibold text-background">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function InterviewList({
  interviews,
  applicationId,
  accentColor,
}: {
  interviews: Awaited<ReturnType<typeof getPortalApplicationInterviews>>;
  applicationId: string | null;
  accentColor: string;
}) {
  const scheduled = interviews.filter((interview) => interview.status === "scheduled");

  if (scheduled.length === 0) {
    return (
      <div className="border-y border-border/70 py-7">
        <p className="text-sm text-muted-foreground">No interviews are scheduled yet. We&apos;ll let you know when there&apos;s a next step.</p>
        {applicationId ? <Link href={`/portal/applications/${applicationId}` as Route} className="mt-3 inline-flex text-sm font-semibold text-foreground underline-offset-4 hover:underline">View application</Link> : null}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/70 rounded-2xl border border-border/70 bg-card px-5 sm:px-6">
      {scheduled.map((interview) => {
        const date = new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(interview.scheduledAt);

        return (
          <Link
            key={interview.id}
            href={`/portal/applications/${applicationId}` as Route}
            className="group flex items-center gap-4 py-4 first:pt-5 last:pb-5"
          >
            <time dateTime={interview.scheduledAt.toISOString()} className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-muted text-center leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: accentColor }}>{date.split(" ")[0]}</span>
              <span className="mt-1 text-xl font-semibold tracking-tight text-foreground">{date.split(" ").at(-1)}</span>
            </time>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold tracking-[-0.02em] text-foreground group-hover:underline group-hover:underline-offset-4">{interview.title ?? interview.type}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{formatTime(interview.scheduledAt)} · {interview.durationMins} min</span>
            </span>
            {interview.interviewerImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- workspace member image
              <img src={interview.interviewerImage} alt={interview.interviewerName ?? "Interviewer"} className="size-10 rounded-full object-cover" />
            ) : interview.interviewerName ? (
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground" title={interview.interviewerName}>{interview.interviewerName.charAt(0).toUpperCase()}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
