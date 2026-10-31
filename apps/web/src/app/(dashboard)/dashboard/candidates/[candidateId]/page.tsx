import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, UserPlus } from "lucide-react";

import { CandidateAvatarEdit } from "@/features/candidates/CandidateAvatarEdit";
import { Button } from "@/components/ui/button";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { CandidateActionBar } from "@/features/candidates/CandidateActionBar";
import { CandidateActivityRail } from "@/features/candidates/CandidateActivityRail";
import { RejectionReasonTag } from "@/features/rejection-reasons/RejectionReasonTag";
import { CandidateContactLinks } from "@/features/candidates/CandidateContactLinks";
import { CandidateSummaryCard } from "@/features/candidates/CandidateSummaryCard";
import { CandidatePager } from "@/features/candidates/CandidatePager";
import { CandidateStickyHeader } from "@/features/candidates/CandidateStickyHeader";
import { CandidateProfileTabs } from "@/features/candidates/CandidateProfileTabs";
import { filterApplicationScopedItems } from "@/features/candidates/profile-scope";
import { CandidateTags } from "@/features/candidates/CandidateTags";
import { CandidateReferrals } from "@/features/candidates/referrals/CandidateReferrals";
import { ReferCandidateDrawer } from "@/features/candidates/referrals/ReferCandidateDrawer";
import { DuplicateDetectionCard } from "@/features/candidates/DuplicateDetectionCard";
import { IdentityShield, Redact, RedactLink } from "@/features/candidates/IdentityShield";
import { getCandidateProfile, findSuspectDuplicates } from "@/features/candidates/data";
import { parseCandidateNavigation } from "@/features/candidates/origin";
import { getCandidatePageNavigation } from "@/features/candidates/queue-neighbors";
import { CandidateQueueNavigationProvider } from "@/features/candidates/queue-navigation-context";
import { resolveSearchActor } from "@/features/search/workspace-search";
import { getNextStage } from "@/features/pipeline/data";
import { listCandidateInterviews } from "@/features/interviews/data";
import { listEmailTemplates } from "@/features/email-templates/data";
import { listOffersForCandidate } from "@/features/offers/data";
import { listDocumentsForCandidate } from "@/features/documents/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  can,
  requireApplicationPermission,
  requireCandidatePermission,
} from "@/features/workspaces/permissions-server";
import { listWorkspaceMembers } from "@/features/jobs/hiring-team-data";
import { listJobOptions } from "@/features/jobs/data";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getWorkspaceCalStatus } from "@/lib/cal/config";
import { getWorkspaceEsignStatus } from "@/lib/esign/config";
import { candidateAvatarFallbackSrcs } from "@/lib/candidate-avatar";
import { getWorkspaceGravatarEnabled } from "@/lib/gravatar";

export const dynamic = "force-dynamic";

type CandidateDetailPageProps = {
  params: Promise<{ candidateId: string }>;
  /** Origin context, see `@/features/candidates/origin`. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CandidateDetailPage({
  params,
  searchParams,
}: CandidateDetailPageProps) {
  const [{ candidateId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const navigationContext = parseCandidateNavigation(rawSearchParams);

  try {
    await requireCandidatePermission("candidates:view", candidateId);
  } catch {
    notFound();
  }

  const [profile, navigation, members, jobOptions, candidateInterviews, candidateOffers, emailTemplates, relatedDocuments] =
    await Promise.all([
      getCandidateProfile(candidateId),
      // Previous / next follow the origin list with one bounded, scoped query.
      resolveSearchActor().then((actor) =>
        getCandidatePageNavigation(actor, navigationContext, candidateId),
      ),
      listWorkspaceMembers(),
      listJobOptions(),
      listCandidateInterviews(candidateId),
      listOffersForCandidate(candidateId),
      listEmailTemplates(),
      listDocumentsForCandidate(candidateId),
    ]);

  if (!profile) {
    notFound();
  }

  const {
    candidate,
    applications: candidateApplications,
    notes,
    files,
    activity: profileActivity,
    workspaceId,
    scorecards: profileScorecards,
    messages: profileMessages,
    tags,
    aiEvaluations: profileAiEvaluations,
    inPool,
    privacyRequests,
    referrals,
  } = profile;
  const visibleApplications = (
    await Promise.all(
      candidateApplications.map(async (application) => {
        try {
          await requireApplicationPermission("candidates:view", application.id);
          return application;
        } catch {
          return null;
        }
      }),
    )
  ).filter((application): application is (typeof candidateApplications)[number] => Boolean(application));
  // The application the origin row stood for (queue / pipeline) leads, so the
  // header and the decision bar act on it.
  const originApplication = navigationContext.applicationId
    ? visibleApplications.find((application) => application.id === navigationContext.applicationId) ?? null
    : null;
  const applications = originApplication
    ? [originApplication, ...visibleApplications.filter((application) => application !== originApplication)]
    : visibleApplications;

  const visibleApplicationIds = new Set(
    applications.map((application) => application.id),
  );
  const activity = filterApplicationScopedItems(
    profileActivity,
    visibleApplicationIds,
  );
  const scorecards = filterApplicationScopedItems(
    profileScorecards,
    visibleApplicationIds,
  );
  const messages = filterApplicationScopedItems(
    profileMessages,
    visibleApplicationIds,
  );
  const aiEvaluations = filterApplicationScopedItems(
    profileAiEvaluations,
    visibleApplicationIds,
  );
  const interviews = candidateInterviews.filter((interview) =>
    visibleApplicationIds.has(interview.applicationId),
  );
  const offers = candidateOffers.filter((offer) =>
    visibleApplicationIds.has(offer.applicationId),
  );

  const [calStatus, aiStatus, esignStatus, workspaceContext, canManageDsar, canDeleteCandidates, canCollaborate, canEditCandidates] = await Promise.all([
    getWorkspaceCalStatus(workspaceId),
    getWorkspaceAiStatus(workspaceId),
    getWorkspaceEsignStatus(workspaceId),
    getWorkspaceContext(),
    can("dsar:manage"),
    can("candidates:delete"),
    can("collab:write"),
    can("candidates:edit"),
  ]);
  const workspaceName = workspaceContext.organization.name;
  const currentUserName = workspaceContext.user.name;
  const fullName = `${candidate.firstName} ${candidate.lastName}`;
  const latestResume = files[0] ?? null;
  const latestApplication = applications[0] ?? null;
  const gravatarEnabled = await getWorkspaceGravatarEnabled(workspaceId);
  const avatarFallbackSrcs = candidateAvatarFallbackSrcs(candidate.email, candidate.githubUrl, {
    gravatarEnabled,
  });

  const [suspectCandidates, moveTargets] = await Promise.all([
    // Fuzzy duplicate check (heuristic only, no AI at load time)
    findSuspectDuplicates(
      candidate.id,
      candidate.firstName,
      candidate.lastName,
      workspaceId,
    ),
    Promise.all(
      applications.map(async (application) => ({
        applicationId: application.id,
        fromStageId: application.currentStageId,
        workspaceId: application.workspaceId,
        nextStage: await getNextStage(
          application.jobId,
          application.currentStageId,
        ),
      })),
    ),
  ]);

  const scheduleApplications = applications.map((application) => ({
    applicationId: application.id,
    jobTitle: application.jobTitle,
    currentStageName: application.currentStageName,
    status: application.status,
  }));
  const actionCandidate = {
    id: candidate.id,
    workspaceId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    address: candidate.address,
    location: candidate.location,
    linkedinUrl: candidate.linkedinUrl,
    githubUrl: candidate.githubUrl,
    websiteUrl: candidate.websiteUrl,
    avatarUrl: candidate.avatarUrl,
    headline: candidate.headline,
    summary: candidate.summary,
  };
  const actionCal = {
    enabled: calStatus.enabled,
    bookingUrl: calStatus.bookingUrl,
  };
  const actionTemplateValues = {
    candidate_first_name: candidate.firstName,
    candidate_last_name: candidate.lastName,
    candidate_full_name: fullName,
    job_title: latestApplication?.jobTitle ?? "",
    stage_name: latestApplication?.currentStageName ?? "",
    company_name: workspaceName,
    sender_name: currentUserName,
  };
  const moveTarget = moveTargets[0] ?? null;
  const serializedActivity = activity.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  }));

  const aiConfigured =
    aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady;

  const identity = (
    <div className="flex min-w-0 items-start gap-4">
      <CandidateAvatarEdit
        candidateId={candidate.id}
        workspaceId={workspaceId}
        name={fullName}
        avatarUrl={candidate.avatarUrl ?? null}
        fallbackSrcs={avatarFallbackSrcs}
        className="[&_[data-slot=avatar]]:size-[52px]"
      />
      <div className="min-w-0 space-y-2">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="font-display text-[26px] leading-tight tracking-[-0.01em] text-near-ink">
              <Redact>{fullName}</Redact>
            </h1>
            {latestApplication ? (
              <ApplicationStatusBadge status={latestApplication.status} />
            ) : null}
            {latestApplication?.rejection ? (
              <RejectionReasonTag rejection={latestApplication.rejection} showStatus={false} />
            ) : null}
          </div>
          {candidate.headline || candidate.location ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[14px] leading-6 text-soft-ink">
              {candidate.headline ? <span>{candidate.headline}</span> : null}
              {candidate.headline && candidate.location ? (
                <span aria-hidden>·</span>
              ) : null}
              {candidate.location ? (
                <RedactLink
                  href={`https://maps.google.com/?q=${encodeURIComponent(candidate.location)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded transition-colors duration-150 hover:text-near-ink"
                >
                  <MapPin className="size-3.5 shrink-0" strokeWidth={1.6} />
                  {candidate.location}
                </RedactLink>
              ) : null}
            </p>
          ) : null}
        </div>

        <CandidateContactLinks
          email={candidate.email}
          phone={candidate.phone}
          linkedinUrl={candidate.linkedinUrl}
          githubUrl={candidate.githubUrl}
          websiteUrl={candidate.websiteUrl}
        />

        <div className="flex flex-wrap items-center gap-2">
          <CandidateTags
            candidateId={candidate.id}
            workspaceId={workspaceId}
            tags={tags}
          />
          {canCollaborate ? (
            <ReferCandidateDrawer
              candidateId={candidate.id}
              workspaceId={workspaceId}
              jobs={jobOptions.map((job) => ({ id: job.id, title: job.title }))}
              members={members}
              currentUserId={workspaceContext.user.id}
              canAttributeToOthers={canEditCandidates}
              trigger={
                <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs text-soft-ink">
                  <UserPlus className="size-3.5" />
                  Refer
                </Button>
              }
            />
          ) : null}
        </div>
        <CandidateReferrals
          referrals={referrals}
          currentUserId={workspaceContext.user.id}
          canEditCandidates={canEditCandidates}
        />
      </div>
    </div>
  );

  const actionBarProps = {
    candidate: actionCandidate,
    name: fullName,
    resumeUrl: latestResume?.fileUrl ?? null,
    resumeFileName: latestResume?.fileName ?? null,
    resumeFileType: latestResume?.fileType ?? null,
    stageName: latestApplication?.currentStageName ?? null,
    applications: scheduleApplications,
    members,
    cal: actionCal,
    move: moveTarget,
    moveTargets,
    emailTemplates,
    emailTemplateValues: actionTemplateValues,
    inPool,
    aiConfigured,
  };

  const queueNavigation = {
    autoAdvance: navigation.origin.kind === "review",
    candidateName: fullName,
    applicationId: originApplication?.id ?? null,
    nextHref: navigation.next?.href ?? null,
    nextName: navigation.next?.name ?? null,
    doneHref: navigation.doneHref,
  };

  return (
    <CandidateQueueNavigationProvider value={queueNavigation}>
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href={navigation.backHref as Route}>
            <ArrowLeft className="size-4" />
            {navigation.backLabel}
          </Link>
        </Button>

        <CandidatePager
          prev={navigation.prev}
          next={navigation.next}
          position={navigation.position}
          total={navigation.total}
          label={navigation.label}
          plain={navigation.origin.kind === "candidates" && Object.keys(navigation.origin.filters).length === 0}
        />
      </div>

      <div className="min-w-0 space-y-5">
        <CandidateStickyHeader
          name={fullName}
          avatarUrl={candidate.avatarUrl ?? null}
          fallbackSrcs={avatarFallbackSrcs}
          stageName={latestApplication?.currentStageName ?? null}
          phone={candidate.phone}
          actions={<CandidateActionBar {...actionBarProps} variant="compact" />}
        >
          <IdentityShield anonymize={aiStatus.resumeAnonymization}>
            <div className="rounded-[var(--radius-card)] bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
              <CandidateActionBar {...actionBarProps} identity={identity} />
            </div>
          </IdentityShield>
        </CandidateStickyHeader>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <DuplicateDetectionCard
              candidateId={candidate.id}
              suspects={suspectCandidates}
              aiConfigured={aiConfigured}
            />

            <CandidateProfileTabs
              candidateId={candidate.id}
              workspaceId={workspaceId}
              candidateEmail={candidate.email}
              candidateName={fullName}
              candidatePhone={candidate.phone}
              candidateAddress={candidate.address ?? candidate.location}
              candidateLinkedinUrl={candidate.linkedinUrl}
              candidateGithubUrl={candidate.githubUrl}
              candidateWebsiteUrl={candidate.websiteUrl}
              candidateSummary={candidate.summary}
              candidateEducationEntries={candidate.educationEntries ?? []}
              candidateExperienceEntries={candidate.experienceEntries ?? []}
              stageName={latestApplication?.currentStageName ?? null}
              applications={applications.map((application) => ({
                ...application,
                appliedAt: application.appliedAt.toISOString(),
              }))}
              notes={notes}
              files={files.map((file) => ({
                ...file,
                parsedSkills: Array.isArray(file.parsedSkills) ? file.parsedSkills : [],
                parsedAt: file.parsedAt?.toISOString() ?? null,
                createdAt: file.createdAt.toISOString(),
              }))}
              relatedDocuments={relatedDocuments}
              activity={serializedActivity}
              scorecards={scorecards}
              messages={messages}
              interviews={interviews}
              members={members}
              aiEvaluations={aiEvaluations}
              scheduleApplications={scheduleApplications}
              scheduleMembers={members}
              scheduleCal={{
                enabled: calStatus.enabled,
                bookingUrl: calStatus.bookingUrl,
              }}
              currentUserId={workspaceContext.user.id}
              aiConfigured={aiConfigured}
              offers={offers}
              offerSignatureChannel={esignStatus.offerSignatureChannel}
              privacyRequests={canManageDsar ? privacyRequests.map((request) => ({
                ...request,
                createdAt: request.createdAt.toISOString(),
                completedAt: request.completedAt?.toISOString() ?? null,
              })) : []}
              canFulfilErasure={canManageDsar && canDeleteCandidates}
            />
          </div>

          <div className="min-w-0 space-y-5">
            <CandidateSummaryCard
              jobTitle={latestApplication?.jobTitle ?? null}
              stageName={latestApplication?.currentStageName ?? null}
              source={latestApplication?.source ?? null}
              appliedAt={latestApplication?.appliedAt.toISOString() ?? null}
              createdAt={candidate.createdAt.toISOString()}
              tags={tags}
              applicationCount={applications.length}
              rejection={latestApplication?.rejection ?? null}
            />
            <CandidateActivityRail activity={serializedActivity} />
          </div>
        </div>
      </div>
    </div>
    </CandidateQueueNavigationProvider>
  );
}
