import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Route } from "next";

import { applications, candidates, db, jobs } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { PortalEmptyState } from "@/features/portal/PortalEmptyState";
import { PortalProfileCompletionCard } from "@/features/portal/PortalProfileCompletionCard";
import { PortalStatusBadge } from "@/features/portal/PortalStatusBadge";
import { getPortalProfileCompletion } from "@/features/portal/profile-completion";
import { BriefcaseIcon, CaretRightIcon } from "@/components/ui/icons/phosphor";
import { formatShort } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function PortalApplicationsPage() {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [applicationsRows, [candidate]] = await Promise.all([
    db
      .select({
        id: applications.id,
        status: applications.status,
        appliedAt: applications.appliedAt,
        jobTitle: jobs.title,
        jobDepartment: jobs.department,
        jobLocation: jobs.location,
      })
      .from(applications)
      .innerJoin(jobs, and(eq(jobs.id, applications.jobId), eq(jobs.workspaceId, session.workspaceId), isNull(jobs.deletedAt)))
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, applications.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .where(and(eq(applications.candidateId, session.candidateId), eq(applications.workspaceId, session.workspaceId), isNull(candidates.deletedAt)))
      .orderBy(desc(applications.appliedAt)),
    db
      .select({
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        headline: candidates.headline,
        phone: candidates.phone,
        location: candidates.location,
        avatarUrl: candidates.avatarUrl,
        linkedinUrl: candidates.linkedinUrl,
        githubUrl: candidates.githubUrl,
        websiteUrl: candidates.websiteUrl,
      })
      .from(candidates)
      .where(and(eq(candidates.id, session.candidateId), eq(candidates.workspaceId, session.workspaceId), isNull(candidates.deletedAt)))
      .limit(1),
  ]);

  return (
    <PortalShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the status and next steps for each application.
          </p>
        </div>

        {candidate && (
          <PortalProfileCompletionCard completion={getPortalProfileCompletion(candidate)} />
        )}

        {applicationsRows.length === 0 ? (
          <PortalEmptyState
            icon={BriefcaseIcon}
            title="No applications yet"
            description="Explore open positions and find your next opportunity."
            cta={{ label: "Browse positions", href: "/portal/jobs" as Route }}
          />
        ) : (
          <div className="space-y-3" role="list" aria-label="My applications">
            {applicationsRows.map((application) => (
              <Link
                key={application.id}
                href={`/portal/applications/${application.id}` as Route}
                className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/30 hover:bg-muted/20"
                role="listitem"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-foreground group-hover:underline">
                      {application.jobTitle}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[application.jobDepartment, application.jobLocation].filter(Boolean).join(" · ") || "Application submitted"}
                    </p>
                  </div>
                  <PortalStatusBadge status={application.status} />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Applied {formatShort(application.appliedAt)}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    View application
                    <CaretRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
