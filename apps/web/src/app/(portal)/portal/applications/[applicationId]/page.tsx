import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, and } from "drizzle-orm";
import type { Route } from "next";

import { applications, db, jobs, workspaceSettings } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import {
  getPortalApplicationInterviews,
  getPortalApplicationOffer,
  getPortalJobStages,
} from "@/server/portal-applications";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { PortalHorizontalPipeline } from "@/features/portal/PortalHorizontalPipeline";
import { PortalInterviewCard } from "@/features/portal/PortalInterviewCard";
import { PortalOfferSignCard } from "@/features/portal/PortalOfferSignCard";
import { PortalDocumentRequestsCard } from "@/features/portal/PortalDocumentRequestsCard";
import { listDocumentRequestsForPortal } from "@/features/documents/requests-data";
import { PortalStatusBadge } from "@/features/portal/PortalStatusBadge";
import { PortalEmptyState } from "@/features/portal/PortalEmptyState";
import { PortalActivityTimeline, type ActivityItem } from "@/features/portal/PortalActivityTimeline";
import {
  CalendarBlankIcon,
} from "@/components/ui/icons/phosphor";
import { formatShort } from "@/lib/date";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function synthesizeActivities(
  app: { id: string; status: string; appliedAt: Date; updatedAt: Date },
  interviews: Awaited<ReturnType<typeof getPortalApplicationInterviews>>,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  items.push({
    id: `${app.id}-applied`,
    type: "applied",
    label: "Application submitted",
    timestamp: app.appliedAt,
  });
  for (const iv of interviews) {
    if (iv.status === "completed") {
      items.push({
        id: `${iv.id}-done`,
        type: "interview_completed",
        label: `${iv.title ?? iv.type} completed`,
        timestamp: new Date(iv.scheduledAt.getTime() + iv.durationMins * 60_000),
      });
    } else if (iv.status === "scheduled") {
      items.push({
        id: `${iv.id}-sched`,
        type: "interview_scheduled",
        label: `${iv.title ?? iv.type} scheduled`,
        timestamp: iv.scheduledAt,
      });
    }
  }
  if (app.status === "hired") {
    items.push({
      id: `${app.id}-hired`,
      type: "offer",
      label: "Offer received!",
      timestamp: app.updatedAt,
    });
  }
  if (app.status === "rejected") {
    items.push({
      id: `${app.id}-rejected`,
      type: "rejected",
      label: "Application not selected",
      timestamp: app.updatedAt,
    });
  }
  return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
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

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { applicationId } = await params;
  const searchParamsMap = await searchParams;
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
      updatedAt: applications.updatedAt,
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

  const [settingsRow] = await db
    .select({ showStatus: workspaceSettings.portalShowApplicationStatus })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, session.workspaceId))
    .limit(1);
  const showStatus = settingsRow?.showStatus !== false;

  const stages = await getPortalJobStages(appRow.jobId);
  const interviewsList = await getPortalApplicationInterviews(appRow.id);
  const activities = synthesizeActivities(appRow, interviewsList);

  // E-signature offer, if the recruiter sent one via the e-signature channel.
  // `?signed=pending` is set as the DocuSeal completed_redirect_url after the
  // signing ceremony — the webhook flips the offer status async.
  const esignOffer = await getPortalApplicationOffer({
    applicationId: appRow.id,
    candidateId: session.candidateId,
    workspaceId: session.workspaceId,
  });
  const signedParam = searchParamsMap["signed"];
  const signedPending =
    (Array.isArray(signedParam) ? signedParam[0] : signedParam) === "pending" &&
    esignOffer?.status === "sent";

  // Documents the recruiter asked this candidate to upload for this application.
  const documentRequests = await listDocumentRequestsForPortal({
    workspaceId: session.workspaceId,
    candidateId: session.candidateId,
    applicationId: appRow.id,
  });

  const now = new Date();
  const upcomingInterviews = interviewsList.filter(
    (i) => i.status === "scheduled" && i.scheduledAt > now,
  );
  const pastInterviews = interviewsList.filter(
    (i) => i.status === "completed" || (i.status === "scheduled" && i.scheduledAt <= now),
  );

  return (
    <PortalShell>
      <div className="space-y-8">
        {/* Back link */}
        <Link
          href="/portal/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to applications
        </Link>

        {/* Header */}
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
            <p className="mt-2 text-sm text-muted-foreground">
              Applied {formatShort(appRow.appliedAt)}
            </p>
          </div>
          <PortalStatusBadge status={appRow.status} />
        </div>

        {/* E-signature offer — review & sign / pending / accepted / declined */}
        {esignOffer && (
          <PortalOfferSignCard
            applicationId={appRow.id}
            offer={{
              id: esignOffer.id,
              // The query filters status to sent/accepted/declined (inArray);
              // drizzle still infers the full enum, so narrow here.
              status: esignOffer.status as "sent" | "accepted" | "declined",
              title: esignOffer.title,
              esignSubmissionId: esignOffer.esignSubmissionId,
              expiresAt: esignOffer.expiresAt,
            }}
            signedPending={signedPending}
          />
        )}

        {/* Documents the recruiter requested — upload / status per item */}
        <PortalDocumentRequestsCard requests={documentRequests} />

        {/* Horizontal pipeline */}
        {showStatus && stages.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Interview plan</h2>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <PortalHorizontalPipeline
                stages={stages}
                currentStageId={appRow.currentStageId}
                applicationStatus={appRow.status}
              />
            </div>
          </section>
        )}

        {/* Upcoming interviews */}
        {upcomingInterviews.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Upcoming Interviews</h2>
            <div className="space-y-3">
              {upcomingInterviews.map((iv) => (
                <PortalInterviewCard
                  key={iv.id}
                  title={iv.title ?? iv.type}
                  scheduledAt={iv.scheduledAt}
                  durationMins={iv.durationMins}
                  location={iv.location}
                  interviewers={[
                    { name: iv.interviewerName, image: iv.interviewerImage },
                  ]}
                  meetingUrl={iv.meetingUrl}
                />
              ))}
            </div>
          </section>
        )}

        {/* Past interviews */}
        {pastInterviews.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Past Interviews</h2>
            <div className="space-y-3">
              {pastInterviews.map((iv) => (
                <PortalInterviewCard
                  key={iv.id}
                  title={iv.title ?? iv.type}
                  scheduledAt={iv.scheduledAt}
                  durationMins={iv.durationMins}
                  location={iv.location}
                  interviewers={[
                    { name: iv.interviewerName, image: iv.interviewerImage },
                  ]}
                  meetingUrl={iv.meetingUrl}
                  compact
                />
              ))}
            </div>
          </section>
        )}

        {/* No interviews at all */}
        {interviewsList.length === 0 && (
          <PortalEmptyState
            icon={CalendarBlankIcon}
            title="No interviews scheduled yet"
            description="Your application is being reviewed. We'll notify you when an interview is booked."
          />
        )}

        {/* Activity timeline (full mode, all activities) */}
        {activities.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Activity</h2>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <PortalActivityTimeline activities={activities} />
            </div>
          </section>
        )}
      </div>
    </PortalShell>
  );
}