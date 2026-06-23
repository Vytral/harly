import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import type { Route } from "next";

import {
  applications,
  candidates,
  db,
  jobs,
  jobStages,
  aiEvaluations,
} from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShell";
import { formatShort } from "@/lib/date";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_STYLES = {
  active: "bg-primary/10 text-primary",
  hired: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  rejected: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
} as const;

const STATUS_LABELS = {
  active: "In progress",
  hired: "Hired 🎉",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
} as const;

export default async function PortalDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      appliedAt: applications.appliedAt,
      jobTitle: jobs.title,
      jobSlug: jobs.slug,
      stageName: jobStages.name,
      score: aiEvaluations.score,
    })
    .from(applications)
    .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, session.workspaceId)))
    .innerJoin(jobStages, eq(jobStages.id, applications.currentStageId))
    .leftJoin(aiEvaluations, eq(aiEvaluations.applicationId, applications.id))
    .where(
      and(
        eq(applications.candidateId, session.candidateId),
        eq(applications.workspaceId, session.workspaceId),
      ),
    )
    .orderBy(desc(applications.appliedAt));

  return (
    <PortalShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi, {session.firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length === 0
              ? "You haven't applied to any roles yet."
              : `You have ${rows.length} application${rows.length === 1 ? "" : "s"}.`}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Browse open roles and apply to get started.
            </p>
            <Link
              href={"/portal/jobs" as Route}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Browse open roles
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.jobTitle}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Applied {formatShort(row.appliedAt)} · {row.stageName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {row.score != null ? (
                    <span className="hidden text-xs font-semibold tabular-nums text-muted-foreground sm:block">
                      Score {row.score}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      STATUS_STYLES[row.status],
                    )}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
