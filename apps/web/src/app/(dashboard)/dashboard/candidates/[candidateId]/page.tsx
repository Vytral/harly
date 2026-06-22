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
import { CandidateListRail } from "@/features/candidates/CandidateListRail";
import { CandidateProfileTabs } from "@/features/candidates/CandidateProfileTabs";
import { CandidateTags } from "@/features/candidates/CandidateTags";
import { getCandidateProfile, listCandidates } from "@/features/candidates/data";
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

  const { candidate, applications, notes, files, activity, workspaceId, scorecards, messages, tags, aiEvaluations } =
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

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/dashboard/candidates">
          <ArrowLeft className="size-4" />
          Back to candidates
        </Link>
      </Button>

      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <CandidateListRail candidates={railCandidates} activeId={candidate.id} />

        <main className="min-w-0 space-y-5">
          {/* Profile header */}
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            <div className="h-20 bg-gradient-to-r from-sage via-kraft to-card" />
            <div className="-mt-10 px-5 pb-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <CandidateAvatarEdit
                  candidateId={candidate.id}
                  workspaceId={workspaceId}
                  name={fullName}
                  avatarUrl={candidate.avatarUrl ?? null}
                  fallbackSrc={avatarSrc}
                />
                <div className="pb-1">
                  <CandidateActionBar
                    candidate={{
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
                    }}
                    name={fullName}
                    resumeUrl={latestResume?.fileUrl ?? null}
                    resumeFileName={latestResume?.fileName ?? null}
                    resumeFileType={latestResume?.fileType ?? null}
                    stageName={latestApplication?.currentStageName ?? null}
                    applications={scheduleApplications}
                    members={members}
                    cal={{
                      enabled: calStatus.enabled,
                      bookingUrl: calStatus.bookingUrl,
                    }}
                    emailTemplates={emailTemplates}
                    emailTemplateValues={{
                      candidate_first_name: candidate.firstName,
                      candidate_last_name: candidate.lastName,
                      candidate_full_name: fullName,
                      job_title: latestApplication?.jobTitle ?? "",
                      company_name: workspaceName,
                      sender_name: currentUserName,
                    }}
                  />
                </div>
              </div>

              {/* Two-column: identity left, contact+social right */}
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:justify-between">
                {/* Left — name, headline, source, pipeline, tags */}
                <div className="min-w-0 space-y-2.5">
                  <div>
                    <h1 className="font-display text-xl font-semibold tracking-tight">{fullName}</h1>
                    {candidate.headline ? (
                      <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                        {candidate.headline}
                      </p>
                    ) : null}
                  </div>

                  {latestApplication?.source ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      {SOURCE_ICON[latestApplication.source] ?? <Briefcase className="size-3.5" />}
                      {SOURCE_LABEL[latestApplication.source] ?? latestApplication.source}
                    </span>
                  ) : null}

                  {latestApplication?.currentStageName ? (
                    <PipelineSpine
                      current={latestApplication.currentStageName}
                      showLabel
                      className="max-w-xs"
                    />
                  ) : null}

                  <CandidateTags
                    candidateId={candidate.id}
                    workspaceId={workspaceId}
                    tags={tags}
                  />
                </div>

                {/* Right — contact centered vertically, social at bottom */}
                <div className="flex shrink-0 flex-col justify-center gap-4 sm:items-end">
                  <div className="flex flex-col gap-2">
                    <a
                      href={`mailto:${candidate.email}`}
                      className="inline-flex items-center gap-2.5 text-sm text-foreground transition-colors hover:text-foreground/70"
                    >
                      <Mail className="size-5 shrink-0" strokeWidth={1.5} />
                      {candidate.email}
                    </a>
                    {candidate.phone ? (
                      <a
                        href={`tel:${candidate.phone}`}
                        className="inline-flex items-center gap-2.5 text-sm text-foreground transition-colors hover:text-foreground/70"
                      >
                        <Phone className="size-5 shrink-0" strokeWidth={1.5} />
                        {candidate.phone}
                      </a>
                    ) : null}
                    {candidate.location ? (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(candidate.location)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2.5 text-sm text-foreground transition-colors hover:text-foreground/70"
                      >
                        <MapPin className="size-5 shrink-0" strokeWidth={1.5} />
                        {candidate.location}
                      </a>
                    ) : null}
                  </div>

                  {candidate.linkedinUrl ||
                  candidate.githubUrl ||
                  candidate.websiteUrl ? (
                    <div className="flex items-center gap-4 text-sm">
                      {candidate.linkedinUrl ? (
                        <a
                          href={candidate.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-foreground transition-colors hover:text-foreground/70"
                        >
                          <LinkedinLogo className="size-[18px]" />
                          LinkedIn
                        </a>
                      ) : null}
                      {candidate.githubUrl ? (
                        <a
                          href={candidate.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-foreground transition-colors hover:text-foreground/70"
                        >
                          <GithubIcon className="size-[18px]" />
                          GitHub
                        </a>
                      ) : null}
                      {candidate.websiteUrl ? (
                        <a
                          href={candidate.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-foreground transition-colors hover:text-foreground/70"
                        >
                          <Globe className="size-[18px]" strokeWidth={1.5} />
                          Website
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

            </div>
          </div>

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
              createdAt: file.createdAt.toISOString(),
            }))}
            activity={activity.map((event) => ({
              ...event,
              createdAt: event.createdAt.toISOString(),
            }))}
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
            aiConfigured={
              aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady
            }
            offers={offers}
          />
        </main>
      </div>
    </div>
  );
}
