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
  user,
  workspaceSettings,
} from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { formatShort } from "@/lib/date";
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

  const [settings] = await db
    .select({
      tagline: workspaceSettings.tagline,
      description: workspaceSettings.description,
      websiteUrl: workspaceSettings.websiteUrl,
      heroImageUrl: workspaceSettings.heroImageUrl,
      primaryColor: workspaceSettings.primaryColor,
      showStatus: workspaceSettings.portalShowApplicationStatus,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, session.workspaceId))
    .limit(1);

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

  const teamMembers = await db
    .select({
      name: user.name,
      image: user.image,
      jobTitle: user.jobTitle,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, session.workspaceId))
    .limit(8);

  // Primary app = first active one, fallback to most recent
  const primaryApp = appRows.find((a) => a.status === "active") ?? appRows[0] ?? null;
  const otherApps = primaryApp ? appRows.filter((a) => a.id !== primaryApp.id) : [];

  return (
    <PortalShell>
      {/* ── Hero Banner ── */}
      <div className="relative mb-6 overflow-hidden rounded-2xl">
        {settings?.heroImageUrl ? (
          <img
            src={settings.heroImageUrl}
            alt="Company banner"
            className="h-44 w-full object-cover sm:h-52"
          />
        ) : (
          <div
            className="h-44 w-full sm:h-52"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88, ${accentColor}44)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
          <h1 className="text-lg font-semibold text-white sm:text-xl">
            Hello, {session.firstName}!
          </h1>
          {settings?.tagline && (
            <p className="mt-0.5 text-sm text-white/80">{settings.tagline}</p>
          )}
        </div>
      </div>

      {appRows.length === 0 ? (
        /* ── Empty state ── */
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <BriefcaseIcon className="mx-auto mb-3 size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">No applications yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
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
        <>
          {/* ── Candidate header ── */}
          {primaryApp && (
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground">
                {session.firstName} {session.lastName}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                For{" "}
                <Link
                  href={`/portal/applications/${primaryApp.id}` as Route}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {primaryApp.jobTitle}
                </Link>
              </p>
            </div>
          )}

          {/* ── 2-column layout ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
            {/* ── LEFT COLUMN ── */}
            <div className="space-y-6">
              {/* Interview plan */}
              {primaryApp && showPipeline && (stagesByJob.get(primaryApp.jobId) ?? []).length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Interview plan</h3>
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <InterviewPlanSidebar
                      app={primaryApp}
                      stages={stagesByJob.get(primaryApp.jobId) ?? []}
                    />
                  </div>
                </section>
              )}

              {/* Meet your hiring team */}
              {teamMembers.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Meet your hiring team</h3>
                  <div className="space-y-2">
                    {teamMembers.map((m, i) => (
                      <div
                        key={`${m.name}-${i}`}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                      >
                        {m.image ? (
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

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-6">
              {/* Other applications */}
              {otherApps.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Other applications</h3>
                  <div className="space-y-2">
                    {otherApps.map((row) => {
                      const stages = stagesByJob.get(row.jobId) ?? [];
                      const currentIdx = stages.findIndex((s) => s.id === row.currentStageId);
                      const isTerminal = row.status === "rejected" || row.status === "withdrawn";
                      return (
                        <Link
                          key={row.id}
                          href={`/portal/applications/${row.id}` as Route}
                          className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
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

              {/* Company info */}
              {(settings?.description || settings?.websiteUrl) && (
                <section>
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="p-5">
                      <h3 className="mb-2 text-sm font-semibold text-foreground">
                        About the company
                      </h3>
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
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
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
