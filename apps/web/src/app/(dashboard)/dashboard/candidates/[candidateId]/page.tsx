import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Briefcase,
  Building,
  FileSpreadsheet,
  Globe,
  Mail,
  MapPin,
  Megaphone,
  MousePointerClick,
  Phone,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";

import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";

import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { CandidateAvatarEdit } from "@/features/candidates/CandidateAvatarEdit";
import { Button } from "@/components/ui/button";
import { CandidateActionBar } from "@/features/candidates/CandidateActionBar";
import { CandidateActivityRail } from "@/features/candidates/CandidateActivityRail";
import { CandidatePager } from "@/features/candidates/CandidatePager";
import { CandidateStickyHeader } from "@/features/candidates/CandidateStickyHeader";
import { CandidateProfileTabs } from "@/features/candidates/CandidateProfileTabs";
import { CandidateTags } from "@/features/candidates/CandidateTags";
import { DuplicateDetectionCard } from "@/features/candidates/DuplicateDetectionCard";
import { getCandidateProfile, listCandidates, findSuspectDuplicates } from "@/features/candidates/data";
import { getNextStage } from "@/features/pipeline/data";
import { listCandidateInterviews } from "@/features/interviews/data";
import { listEmailTemplates } from "@/features/email-templates/data";
import { listOffersForCandidate } from "@/features/offers/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { listWorkspaceMembers } from "@/features/jobs/hiring-team-data";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getWorkspaceCalStatus } from "@/lib/cal/config";
import { gravatarUrl } from "@/lib/gravatar";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  public_form: "Job board",
  csv_import: "CSV import",
  referral: "Referral",
  linkedin: "LinkedIn",
  career_page: "Career page",
  agency: "Agency",
  direct_apply: "Direct apply",
  internal: "Internal",
  email: "Email",
  event: "Event",
  manual: "Manual",
};

const SOURCE_ICON: Record<string, ReactNode> = {
  public_form: <Briefcase className="size-3.5" />,
  csv_import: <FileSpreadsheet className="size-3.5" />,
  referral: <Users className="size-3.5" />,
  linkedin: <LinkedinLogo className="size-3.5" />,
  career_page: <Globe className="size-3.5" />,
  agency: <Building className="size-3.5" />,
  direct_apply: <MousePointerClick className="size-3.5" />,
  internal: <UserPlus className="size-3.5" />,
  email: <Mail className="size-3.5" />,
  event: <Megaphone className="size-3.5" />,
  manual: <Upload className="size-3.5" />,
};

type CandidateDetailPageProps = {
  params: Promise<{ candidateId: string }>;
};

export default async function CandidateDetailPage({
  params,
}: CandidateDetailPageProps) {
  const { candidateId } = await params;
  const [profile, allCandidates, members, interviews, offers, emailTemplates] =
    await Promise.all([
      getCandidateProfile(candidateId),
      listCandidates(),
      listWorkspaceMembers(),
      listCandidateInterviews(candidateId),
      listOffersForCandidate(candidateId),
      listEmailTemplates(),
    ]);

  if (!profile) {
    notFound();
  }

  const { candidate, applications, notes, files, activity, workspaceId, scorecards, messages, tags, aiEvaluations, inPool } =
    profile;
  const [calStatus, aiStatus, workspaceContext] = await Promise.all([
    getWorkspaceCalStatus(workspaceId),
    getWorkspaceAiStatus(workspaceId),
    getWorkspaceContext(),
  ]);
  const workspaceName = workspaceContext.organization.name;
  const currentUserName = workspaceContext.user.name;
  const fullName = `${candidate.firstName} ${candidate.lastName}`;
  const latestResume = files[0] ?? null;
  const latestApplication = applications[0] ?? null;
  const avatarSrc = candidate.email ? gravatarUrl(candidate.email) : null;

  const [suspectCandidates, nextStage] = await Promise.all([
    // Fuzzy duplicate check (heuristic only, no AI at load time)
    findSuspectDuplicates(
      candidate.id,
      candidate.firstName,
      candidate.lastName,
      workspaceId,
    ),
    latestApplication
      ? getNextStage(latestApplication.jobId, latestApplication.currentStageId)
      : Promise.resolve(null),
  ]);

  const railCandidates = allCandidates
    .slice()
    .sort((a, b) => {
      const aTime = a.latestApplication?.appliedAt?.getTime() ?? 0;
      const bTime = b.latestApplication?.appliedAt?.getTime() ?? 0;
      return bTime - aTime;
    })
    .map((c) => ({
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      avatarUrl: c.avatarUrl ?? null,
      role: c.latestApplication?.jobTitle ?? null,
      stage: c.latestApplication?.currentStageName ?? null,
    }));

  const scheduleApplications = applications.map((application) => ({
    applicationId: application.id,
    jobTitle: application.jobTitle,
    currentStageName: application.currentStageName,
  }));
  const activeIndex = railCandidates.findIndex((entry) => entry.id === candidate.id);
  const prevId = activeIndex > 0 ? railCandidates[activeIndex - 1]?.id ?? null : null;
  const nextId = activeIndex >= 0 ? railCandidates[activeIndex + 1]?.id ?? null : null;
  const actionCandidate = {
    id: candidate.id,
    workspaceId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    linkedinUrl: candidate.linkedinUrl,
    githubUrl: candidate.githubUrl,
    websiteUrl: candidate.websiteUrl,
    headline: candidate.headline,
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
  const moveTarget = latestApplication
    ? {
        applicationId: latestApplication.id,
        fromStageId: latestApplication.currentStageId,
        workspaceId: latestApplication.workspaceId,
        nextStage,
      }
    : null;
  const serializedActivity = activity.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/dashboard/candidates">
            <ArrowLeft className="size-4" />
            Back to candidates
          </Link>
        </Button>

        <CandidatePager
          prevId={prevId}
          nextId={nextId}
          position={activeIndex >= 0 ? activeIndex + 1 : null}
          total={railCandidates.length}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">

        <div className="min-w-0 space-y-5">
          <CandidateStickyHeader
            name={fullName}
            avatarUrl={candidate.avatarUrl ?? null}
            fallbackSrc={avatarSrc}
            stageName={latestApplication?.currentStageName ?? null}
            phone={candidate.phone}
            actions={
              <CandidateActionBar
                candidate={actionCandidate}
                name={fullName}
                resumeUrl={latestResume?.fileUrl ?? null}
                resumeFileName={latestResume?.fileName ?? null}
                resumeFileType={latestResume?.fileType ?? null}
                stageName={latestApplication?.currentStageName ?? null}
                applications={scheduleApplications}
                members={members}
                cal={actionCal}
                move={moveTarget}
                emailTemplates={emailTemplates}
                emailTemplateValues={actionTemplateValues}
                inPool={inPool}
                variant="compact"
              />
            }
          >
            {/* Identity header — one cohesive block, no decorative banner */}
            <div className="rounded-2xl border border-border/70 bg-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {/* Identity + contact, all in one column tight to the avatar */}
              <div className="flex min-w-0 items-start gap-4">
                <CandidateAvatarEdit
                  candidateId={candidate.id}
                  workspaceId={workspaceId}
                  name={fullName}
                  avatarUrl={candidate.avatarUrl ?? null}
                  fallbackSrc={avatarSrc}
                />
                <div className="min-w-0 space-y-2.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h1 className="font-display text-xl font-semibold tracking-tight">
                        {fullName}
                      </h1>
                      {latestApplication?.source ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {SOURCE_ICON[latestApplication.source] ?? (
                            <Briefcase className="size-3.5" />
                          )}
                          {SOURCE_LABEL[latestApplication.source] ??
                            latestApplication.source}
                        </span>
                      ) : null}
                    </div>
                    {candidate.headline ? (
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {candidate.headline}
                      </p>
                    ) : null}
                  </div>

                  {/* Contact + social — one compact inline row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    <a
                      href={`mailto:${candidate.email}`}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                    >
                      <Mail className="size-4 shrink-0" strokeWidth={1.6} />
                      {candidate.email}
                    </a>
                    {candidate.phone ? (
                      <a
                        href={`tel:${candidate.phone}`}
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                      >
                        <Phone className="size-4 shrink-0" strokeWidth={1.6} />
                        {candidate.phone}
                      </a>
                    ) : null}
                    {candidate.location ? (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(candidate.location)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                      >
                        <MapPin className="size-4 shrink-0" strokeWidth={1.6} />
                        {candidate.location}
                      </a>
                    ) : null}

                    {candidate.linkedinUrl ||
                    candidate.githubUrl ||
                    candidate.websiteUrl ? (
                      <span
                        aria-hidden
                        className="hidden h-3.5 w-px bg-border sm:block"
                      />
                    ) : null}

                    {candidate.linkedinUrl ? (
                      <a
                        href={candidate.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                      >
                        <LinkedinLogo className="size-4" />
                        LinkedIn
                      </a>
                    ) : null}
                    {candidate.githubUrl ? (
                      <a
                        href={candidate.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                      >
                        <GithubIcon className="size-4" />
                        GitHub
                      </a>
                    ) : null}
                    {candidate.websiteUrl ? (
                      <a
                        href={candidate.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                      >
                        <Globe className="size-4" strokeWidth={1.6} />
                        Website
                      </a>
                    ) : null}
                  </div>

                  {/* Pipeline spine — the single, canonical stage indicator */}
                  {latestApplication?.currentStageName ? (
                    <PipelineSpine
                      current={latestApplication.currentStageName}
                      showLabel
                      className="max-w-sm pt-0.5"
                    />
                  ) : null}

                  <CandidateTags
                    candidateId={candidate.id}
                    workspaceId={workspaceId}
                    tags={tags}
                  />
                </div>
              </div>

              {/* Actions — grouped with clear hierarchy, delete isolated */}
              <div className="shrink-0 lg:pl-2">
                <CandidateActionBar
                  candidate={actionCandidate}
                  name={fullName}
                  resumeUrl={latestResume?.fileUrl ?? null}
                  resumeFileName={latestResume?.fileName ?? null}
                  resumeFileType={latestResume?.fileType ?? null}
                  stageName={latestApplication?.currentStageName ?? null}
                  applications={scheduleApplications}
                  members={members}
                  cal={actionCal}
                  move={moveTarget}
                  emailTemplates={emailTemplates}
                  emailTemplateValues={actionTemplateValues}
                  inPool={inPool}
                />
              </div>
            </div>
          </div>
          </CandidateStickyHeader>

          <DuplicateDetectionCard
            candidateId={candidate.id}
            suspects={suspectCandidates}
            aiConfigured={aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady}
          />

          <CandidateProfileTabs
            candidateId={candidate.id}
            workspaceId={workspaceId}
            candidateEmail={candidate.email}
            candidateName={fullName}
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
            aiConfigured={
              aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady
            }
            offers={offers}
          />
        </div>

        <CandidateActivityRail activity={serializedActivity} />
      </div>
    </div>
  );
}
