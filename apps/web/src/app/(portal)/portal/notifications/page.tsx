import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import type { Route } from "next";

import {
  applications,
  db,
  interviews,
  jobs,
  user,
} from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { formatRelative } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  CalendarIcon,
  XCircleIcon,
} from "@/components/ui/icons/phosphor";

export const dynamic = "force-dynamic";

type NotificationItem = {
  id: string;
  type: "interview_scheduled" | "interview_completed" | "application_rejected" | "application_hired";
  title: string;
  description: string;
  href: string;
  createdAt: Date;
};

export default async function PortalNotificationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  // Get all applications for this candidate
  const appRows = await db
    .select({
      id: applications.id,
      status: applications.status,
      jobId: applications.jobId,
      jobTitle: jobs.title,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        eq(applications.candidateId, session.candidateId),
        eq(applications.workspaceId, session.workspaceId),
      ),
    );

  const appIds = appRows.map((a) => a.id);
  const appMap = new Map(appRows.map((a) => [a.id, a]));

  // Get all interviews for these applications
  const interviewRows = appIds.length > 0
    ? await db
        .select({
          id: interviews.id,
          applicationId: interviews.applicationId,
          status: interviews.status,
          scheduledAt: interviews.scheduledAt,
          interviewerName: user.name,
        })
        .from(interviews)
        .leftJoin(user, eq(user.id, interviews.interviewerId))
        .where(
          appIds.length === 1
            ? eq(interviews.applicationId, appIds[0])
            : undefined,
        )
        .orderBy(desc(interviews.scheduledAt))
    : [];

  // Build notification items
  const notifications: NotificationItem[] = [];

  // Interview notifications
  for (const iv of interviewRows) {
    const app = appMap.get(iv.applicationId);
    if (!app) continue;

    if (iv.status === "scheduled") {
      notifications.push({
        id: `iv-${iv.id}`,
        type: "interview_scheduled",
        title: `Interview scheduled for ${app.jobTitle}`,
        description: iv.interviewerName
          ? `With ${iv.interviewerName} on ${iv.scheduledAt.toLocaleDateString()}`
          : `Scheduled for ${iv.scheduledAt.toLocaleDateString()}`,
        href: `/portal/applications/${app.id}`,
        createdAt: iv.scheduledAt,
      });
    } else if (iv.status === "completed") {
      notifications.push({
        id: `iv-${iv.id}`,
        type: "interview_completed",
        title: `Interview completed for ${app.jobTitle}`,
        description: iv.interviewerName
          ? `Interview with ${iv.interviewerName} is complete`
          : "Interview has been completed",
        href: `/portal/applications/${app.id}`,
        createdAt: iv.scheduledAt,
      });
    }
  }

  // Application status notifications
  for (const app of appRows) {
    if (app.status === "rejected") {
      notifications.push({
        id: `app-rejected-${app.id}`,
        type: "application_rejected",
        title: `Application for ${app.jobTitle} not selected`,
        description: "We appreciate your interest and encourage you to apply for other roles.",
        href: `/portal/applications/${app.id}`,
        createdAt: new Date(),
      });
    } else if (app.status === "hired") {
      notifications.push({
        id: `app-hired-${app.id}`,
        type: "application_hired",
        title: `Congratulations! You've been hired for ${app.jobTitle}`,
        description: "We're excited to have you on the team!",
        href: `/portal/applications/${app.id}`,
        createdAt: new Date(),
      });
    }
  }

  // Sort by date
  notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const ICON_MAP = {
    interview_scheduled: CalendarIcon,
    interview_completed: CheckCircleIcon,
    application_rejected: XCircleIcon,
    application_hired: CheckCircleIcon,
  };

  const ICON_COLOR_MAP = {
    interview_scheduled: "text-blue-500",
    interview_completed: "text-emerald-500",
    application_rejected: "text-muted-foreground",
    application_hired: "text-emerald-500",
  };

  return (
    <PortalShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates on your applications and interviews
          </p>
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <BellIcon className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              You&apos;ll see updates here when there&apos;s activity on your applications.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const Icon = ICON_MAP[n.type];
              const iconColor = ICON_COLOR_MAP[n.type];
              return (
                <Link
                  key={n.id}
                  href={n.href as Route}
                  className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 shrink-0", iconColor)}>
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {formatRelative(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );
}
