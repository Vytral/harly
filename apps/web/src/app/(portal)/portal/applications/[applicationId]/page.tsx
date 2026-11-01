import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, and, isNull } from "drizzle-orm";
import type { Route } from "next";

import { applications, candidates, db, jobs, workspaceSettings } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import {
  getPortalApplicationInterviews,
  getPortalApplicationOffer,
  getPortalOrganizationName,
} from "@/server/portal-applications";
import { PortalShell } from "@/features/portal/PortalShellServer";
import { PortalStageProgress } from "@/features/portal/PortalStageProgress";
import { PortalInterviewItem } from "@/features/portal/PortalInterviewItem";
import { listPortalJobStages } from "@/features/portal/applications-data";
import { portalApplicationProgress, type PortalApplicationStatus } from "@/features/portal/application-progress";
import { PROGRESS_PILL_TONE } from "@/features/portal/PortalApplicationRow";
import { StatusPill } from "@/components/ui/status-pill";
import { PortalOfferSignCard } from "@/features/portal/PortalOfferSignCard";
import { PortalDocumentRequestsCard } from "@/features/portal/PortalDocumentRequestsCard";
import { listDocumentRequestsForPortal } from "@/features/documents/requests-data";
import { PortalActivityTimeline, type ActivityItem } from "@/features/portal/PortalActivityTimeline";
import { CaretLeftIcon } from "@/components/ui/icons/phosphor";
import { formatShort } from "@/lib/date";
import { formatEnumLabel } from "@/lib/format";

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
        label: `${iv.title ?? formatEnumLabel(iv.type)} completed`,
        timestamp: new Date(iv.scheduledAt.getTime() + iv.durationMins * 60_000),
      });
    } else if (iv.status === "scheduled") {
      items.push({
        id: `${iv.id}-sched`,
        type: "interview_scheduled",
        label: `${iv.title ?? formatEnumLabel(iv.type)} scheduled`,
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
      jobStatus: jobs.status,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
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
        eq(applications.id, applicationId),
        eq(applications.candidateId, session.candidateId),
        eq(applications.workspaceId, session.workspaceId),
        isNull(jobs.deletedAt),
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

  const [stagesByJob, interviewsList, orgName] = await Promise.all([
    showStatus ? listPortalJobStages([appRow.jobId]) : Promise.resolve(new Map()),
    getPortalApplicationInterviews(appRow.id),
    getPortalOrganizationName(session.workspaceId),
  ]);
  const stages = stagesByJob.get(appRow.jobId) ?? [];
  const status = appRow.status as PortalApplicationStatus;
  const progress = portalApplicationProgress({
    stages,
    currentStageId: appRow.currentStageId,
    status,
    showStages: showStatus,
    orgName,
  });
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

  const details = [
    { label: "Team", value: appRow.jobDepartment },
    { label: "Location", value: appRow.jobLocation },
    {
      label: "Workplace",
      value: appRow.jobWorkplaceType ? (WORKPLACE_LABELS[appRow.jobWorkplaceType] ?? appRow.jobWorkplaceType) : null,
    },
    {
      label: "Type",
      value: appRow.jobEmploymentType ? (EMPLOYMENT_LABELS[appRow.jobEmploymentType] ?? appRow.jobEmploymentType) : null,
    },
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail.value));
  const meta = details.map((detail) => detail.value);
  const toItem = (iv: (typeof interviewsList)[number]) => ({ ...iv, title: iv.title ?? formatEnumLabel(iv.type) });
  const company = orgName ?? "The company";

  return (
    <PortalShell>
      <div className="stagger-in space-y-6">
        <Link
          href={"/portal/applications" as Route}
          className="inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-soft-ink transition-colors hover:text-near-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
        >
          <CaretLeftIcon className="size-3.5" />
          All applications
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold tracking-tight text-near-ink sm:text-[30px]">{appRow.jobTitle}</h1>
            <p className="mt-1 text-[14px] text-soft-ink">
              {company}
              {meta.length > 0 ? ` · ${meta.join(" · ")}` : ""}
            </p>
          </div>
          <StatusPill tone={PROGRESS_PILL_TONE[progress.tone]}>{progress.label}</StatusPill>
        </header>

        {/* Where it stands: one status card with the plain-language summary. */}
        <section aria-labelledby="status-title" className="rounded-2xl border border-hairline bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="status-title" className="text-[20px] font-semibold tracking-tight text-near-ink">
              {progress.headline}
            </h2>
            {progress.step && status === "active" ? (
              <span className="text-[13px] tabular-nums text-soft-ink">
                Step {progress.step} of {progress.total}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-6 text-soft-ink">{progress.body}</p>
          {stages.length > 0 ? (
            <PortalStageProgress
              stages={stages}
              currentStageId={appRow.currentStageId}
              status={status}
              className="mt-5"
            />
          ) : null}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
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
                isExpired={Boolean(esignOffer.expiresAt && esignOffer.expiresAt <= new Date())}
                signedPending={signedPending}
              />
            )}

            {documentRequests.length > 0 ? (
              <div id="documents" className="scroll-mt-24">
                <PortalDocumentRequestsCard requests={documentRequests} />
              </div>
            ) : null}

            <section aria-labelledby="interviews-title" className="space-y-3">
              <h2 id="interviews-title" className="text-[17px] font-semibold text-near-ink">
                Interviews
              </h2>
              {upcomingInterviews.length === 0 && pastInterviews.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-hairline px-5 py-6 text-[13.5px] leading-5 text-soft-ink">
                  {status === "active"
                    ? `Nothing scheduled yet. When ${company} books an interview it shows up here, with a link to join and a one-click calendar invite.`
                    : "No interviews for this application."}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {upcomingInterviews.map((iv) => (
                    <PortalInterviewItem key={iv.id} interview={toItem(iv)} orgName={company} />
                  ))}
                  {pastInterviews.length > 0 ? (
                    <>
                      {upcomingInterviews.length > 0 ? (
                        <p className="pt-2 text-[12px] font-semibold uppercase tracking-wider text-soft-ink">Earlier</p>
                      ) : null}
                      {pastInterviews.map((iv) => (
                        <PortalInterviewItem key={iv.id} interview={toItem(iv)} orgName={company} variant="past" />
                      ))}
                    </>
                  ) : null}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-hairline bg-card p-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-soft-ink">Details</h2>
              <dl className="mt-3 space-y-2.5 text-[13.5px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-soft-ink">Applied</dt>
                  <dd className="text-right font-medium text-near-ink">{formatShort(appRow.appliedAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-soft-ink">Last update</dt>
                  <dd className="text-right font-medium text-near-ink">{formatShort(appRow.updatedAt)}</dd>
                </div>
                {details.map((detail) => (
                  <div key={detail.label} className="flex justify-between gap-4">
                    <dt className="text-soft-ink">{detail.label}</dt>
                    <dd className="truncate text-right font-medium text-near-ink">{detail.value}</dd>
                  </div>
                ))}
              </dl>
              {appRow.jobStatus === "open" ? (
                <Link
                  href={`/portal/jobs/${appRow.jobId}` as Route}
                  className="mt-4 inline-block text-[13px] font-medium text-near-ink underline-offset-2 hover:underline"
                >
                  View job description
                </Link>
              ) : null}
            </section>

            {activities.length > 0 ? (
              <section className="rounded-2xl border border-hairline bg-card p-5">
                <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-soft-ink">Latest updates</h2>
                <PortalActivityTimeline activities={activities} />
              </section>
            ) : null}

            <p className="px-1 text-[12.5px] leading-5 text-soft-ink">
              Questions about this application? Reply to any email from {company} and it reaches the hiring team.
            </p>
          </aside>
        </div>
      </div>
    </PortalShell>
  );
}
