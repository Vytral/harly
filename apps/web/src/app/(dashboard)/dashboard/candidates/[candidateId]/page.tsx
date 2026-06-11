import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Code2,
  Globe,
  Link2,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";

import { PipelineSpine } from "@/components/ui/PipelineSpine";
import { UserAvatar } from "@/components/ui/UserAvatar";
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

type CandidateDetailPageProps = {
  params: Promise<{ candidateId: string }>;
};

function ExternalProfileLink({
  href,
  label,
  icon,
}: {
  href: string | null;
  label: string;
  icon: ReactNode;
}) {
  if (!href) return null;
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} target="_blank" rel="noreferrer">
        {icon}
        {label}
      </a>
    </Button>
  );
}

function ContactChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-foreground">
      {icon}
      {children}
    </span>
  );
}

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

  const railCandidates = allCandidates.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    email: c.email,
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
                <UserAvatar
                  name={fullName}
                  src={avatarSrc}
                  size="xl"
                  className="ring-4 ring-card"
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

              <div className="mt-3 space-y-3">
                <div>
                  <h1 className="font-display text-xl font-semibold tracking-tight">{fullName}</h1>
                  {candidate.headline ? (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {candidate.headline}
                    </p>
                  ) : null}
                </div>

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

                <div className="flex flex-wrap items-center gap-2">
                  <ContactChip icon={<Mail className="size-3.5 text-muted-foreground" />}>
                    <a href={`mailto:${candidate.email}`} className="hover:underline">
                      {candidate.email}
                    </a>
                  </ContactChip>
                  {candidate.phone ? (
                    <ContactChip icon={<Phone className="size-3.5 text-muted-foreground" />}>
                      {candidate.phone}
                    </ContactChip>
                  ) : null}
                  {candidate.location ? (
                    <ContactChip icon={<MapPin className="size-3.5 text-muted-foreground" />}>
                      {candidate.location}
                    </ContactChip>
                  ) : null}
                </div>

                {candidate.linkedinUrl ||
                candidate.githubUrl ||
                candidate.websiteUrl ? (
                  <div className="flex flex-wrap gap-2">
                    <ExternalProfileLink
                      href={candidate.linkedinUrl}
                      label="LinkedIn"
                      icon={<Link2 className="size-4" />}
                    />
                    <ExternalProfileLink
                      href={candidate.githubUrl}
                      label="GitHub"
                      icon={<Code2 className="size-4" />}
                    />
                    <ExternalProfileLink
                      href={candidate.websiteUrl}
                      label="Website"
                      icon={<Globe className="size-4" />}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <CandidateProfileTabs
            candidateId={candidate.id}
            workspaceId={workspaceId}
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
