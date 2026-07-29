import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, and, asc, isNull } from "drizzle-orm";
import type { Route } from "next";

import {
  applications,
  candidates,
  db,
  jobs,
  jobStages,
  organization,
  workspaceSettings,
} from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { getPortalApplicationInterviews } from "@/server/portal-applications";
import {
  BriefcaseIcon,
  GlobeIcon,
  ArrowUpRightIcon,
} from "@/components/ui/icons/phosphor";
import { PortalHeroBanner } from "@/features/portal/PortalHeroBanner";
import { PortalInterviewPlan } from "@/features/portal/PortalInterviewPlan";
import { PortalInterviewList } from "@/features/portal/PortalInterviewList";
import { PortalEmptyState } from "@/features/portal/PortalEmptyState";
import { PortalProfileCompletionCard } from "@/features/portal/PortalProfileCompletionCard";
import { getPortalProfileCompletion } from "@/features/portal/profile-completion";

export const dynamic = "force-dynamic";

export default async function PortalDashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const [[settings], [org], [candidate]] = await Promise.all([
    db
      .select({
        tagline: workspaceSettings.tagline,
        description: workspaceSettings.description,
        websiteUrl: workspaceSettings.websiteUrl,
        primaryColor: workspaceSettings.primaryColor,
        heroImageUrl: workspaceSettings.heroImageUrl,
        showStatus: workspaceSettings.portalShowApplicationStatus,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, session.workspaceId))
      .limit(1),
    db
      .select({ name: organization.name, logo: organization.logo })
      .from(organization)
      .where(eq(organization.id, session.workspaceId))
      .limit(1),
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

  const showPipeline = settings?.showStatus !== false;
  const orgName = org?.name ?? "this company";

  const appRows = await db
    .select({
      id: applications.id,
      status: applications.status,
      appliedAt: applications.appliedAt,
      updatedAt: applications.updatedAt,
      jobTitle: jobs.title,
      jobId: applications.jobId,
      currentStageId: applications.currentStageId,
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
    .where(
      and(
        eq(applications.candidateId, session.candidateId),
        eq(applications.workspaceId, session.workspaceId),
      ),
    )
    .orderBy(desc(applications.appliedAt));

  const primaryApp = appRows.find((a) => a.status === "active") ?? appRows[0] ?? null;

  if (!primaryApp) {
    return (
      <PortalShell>
        <div className="space-y-6">
          {candidate && (
            <PortalProfileCompletionCard
              completion={getPortalProfileCompletion(candidate)}
            />
          )}
          <PortalEmptyState
            icon={BriefcaseIcon}
            title="No applications yet"
            description="Browse open positions and apply to get started."
            cta={{ label: "Browse positions", href: "/portal/jobs" as Route }}
          />
        </div>
      </PortalShell>
    );
  }

  type StageRow = { id: string; name: string; order: number };
  let stages: StageRow[] = [];
  if (showPipeline) {
    stages = await db
      .select({ id: jobStages.id, name: jobStages.name, order: jobStages.order })
      .from(jobStages)
      .where(eq(jobStages.jobId, primaryApp.jobId))
      .orderBy(asc(jobStages.order));
  }

  const interviews = await getPortalApplicationInterviews(primaryApp.id);

  const now = new Date();
  const upcoming = interviews
    .filter((i) => i.status === "scheduled" && i.scheduledAt > now)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const past = interviews
    .filter((i) => i.status === "completed" || i.scheduledAt <= now)
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

  // Build hiring team from distinct interviewers
  const teamMap = new Map<string, { name: string; image: string | null }>();
  for (const iv of interviews) {
    if (iv.interviewerName && !teamMap.has(iv.interviewerName)) {
      teamMap.set(iv.interviewerName, {
        name: iv.interviewerName,
        image: iv.interviewerImage,
      });
    }
  }
  const hiringTeam = Array.from(teamMap.values());

  return (
    <PortalShell>
      <div className="space-y-8">
        {candidate && (
          <PortalProfileCompletionCard
            completion={getPortalProfileCompletion(candidate)}
          />
        )}

        {/* Hero banner */}
        <PortalHeroBanner
          orgName={orgName}
          orgColor={settings?.primaryColor ?? null}
          heroImageUrl={settings?.heroImageUrl ?? null}
        />

        {/* Candidate heading */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {session.firstName} {session.lastName}
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            For <span className="font-medium text-foreground">{primaryApp.jobTitle}</span> at{" "}
            <span className="font-medium text-foreground">{orgName}</span>
          </p>
          <p className="mt-3 text-base text-muted-foreground">
            Hello 👋 from {orgName}! We&apos;ll use this guide to share information
            about our company, the job, and track your interview process.
          </p>
        </div>

        {/* Two-column: Interview plan | Interviews */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {showPipeline && stages.length > 0 && (
            <PortalInterviewPlan
              stages={stages}
              currentStageId={primaryApp.currentStageId}
              applicationStatus={primaryApp.status}
            />
          )}
          <PortalInterviewList interviews={upcoming} />
        </div>

        {/* Past interviews */}
        {past.length > 0 && <PortalInterviewList interviews={past} variant="past" />}

        {/* Welcome / about company */}
        {(settings?.description || settings?.websiteUrl) && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h2 className="mb-3 text-xl font-bold text-foreground">
              Welcome to {orgName}!
            </h2>
            {settings.description && (
              <p className="text-base leading-relaxed text-muted-foreground">
                {settings.description}
              </p>
            )}
            {settings.websiteUrl && (
              <a
                href={settings.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
              >
                <GlobeIcon className="size-4" />
                Visit website
                <ArrowUpRightIcon className="size-3" />
              </a>
            )}
          </section>
        )}

        {/* Meet your hiring team */}
        {hiringTeam.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Meet your hiring team
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {hiringTeam.map((member) => (
                <div
                  key={member.name}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  {member.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external URL
                    <img
                      src={member.image}
                      alt={member.name}
                      className="size-11 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {member.name}
                    </p>
                    <p className="text-sm text-muted-foreground">Interviewer</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PortalShell>
  );
}
