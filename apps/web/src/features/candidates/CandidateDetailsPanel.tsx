"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Briefcase,
  Building,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Layers,
  Mail,
  Megaphone,
  MessageSquareText,
  MousePointerClick,
  Phone,
  Sparkles,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";

import type {
  CandidateEducationEntry,
  CandidateExperienceEntry,
  ResumeEducationItem,
  ResumeExperienceItem,
} from "@harly/db";

import {
  CandidateFileUpload,
  type CandidateFileItem,
} from "@/features/candidates/CandidateFileUpload";
import { EducationList } from "@/features/candidates/EducationList";
import { ExperienceTimeline } from "@/features/candidates/ExperienceTimeline";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShortDate } from "@/lib/date-hydration";

type Application = {
  id: string;
  jobId: string;
  jobTitle: string;
  currentStageName: string | null;
  status: string;
  appliedAt: string;
  source: string | null;
  answers: Array<{ id: string; label: string; type: string; answer: string }>;
};

const APPLICATION_SOURCE_META: Record<
  string,
  { label: string; icon: typeof Briefcase }
> = {
  public_form: { label: "Job board", icon: Briefcase },
  csv_import: { label: "CSV import", icon: FileSpreadsheet },
  referral: { label: "Referral", icon: Users },
  linkedin: { label: "LinkedIn", icon: Briefcase },
  career_page: { label: "Career page", icon: Globe },
  agency: { label: "Agency", icon: Building },
  direct_apply: { label: "Direct apply", icon: MousePointerClick },
  internal: { label: "Internal", icon: UserPlus },
  email: { label: "Email", icon: Mail },
  event: { label: "Event", icon: Megaphone },
  manual: { label: "Manual", icon: Upload },
};

function SectionLabel({
  children,
  meta,
}: {
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <p className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>{children}</span>
      {meta ? (
        <span className="font-medium normal-case tracking-normal text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </p>
  );
}

function Section({
  children,
  hidden,
}: {
  children: React.ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return <section className="px-5 py-5 sm:px-6">{children}</section>;
}

function SkillsList({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null;
  const visible = skills.slice(0, 18);
  const overflow = skills.length - visible.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((skill) => (
        <Badge key={skill} variant="outline" className="font-normal text-foreground/80">
          {skill}
        </Badge>
      ))}
      {overflow > 0 ? (
        <Badge variant="outline">+{overflow}</Badge>
      ) : null}
    </div>
  );
}

function ExperienceHeadline({ years }: { years: number | null }) {
  if (years === null) return null;
  return (
    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/90">
      <Sparkles className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
      {years}+ years of experience
    </p>
  );
}

function ApplicationMetaItem({
  icon: Icon,
  children,
}: {
  icon: typeof Calendar;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3 shrink-0" strokeWidth={1.8} />
      {children}
    </span>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{value}</dd>
    </>
  );
}

function ApplicationDisclosure({
  application,
}: {
  application: Application;
}) {
  const [open, setOpen] = useState(false);
  const hasAnswers = application.answers.length > 0;
  const sourceMeta = application.source
    ? APPLICATION_SOURCE_META[application.source]
    : null;

  return (
    <div className="group/app space-y-0 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <Briefcase className="size-3.5" strokeWidth={1.8} />
          </span>
          <h3 className="truncate text-sm font-medium text-foreground">
            {application.jobTitle}
          </h3>
          <ApplicationStatusBadge status={application.status as never} />
        </div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Link href={`/dashboard/pipeline?job=${application.jobId}` as Route}>
            <ExternalLink className="size-3.5" strokeWidth={1.8} />
            Pipeline
          </Link>
        </Button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[2.4rem]">
        {application.currentStageName ? (
          <ApplicationMetaItem icon={Layers}>
            {application.currentStageName}
          </ApplicationMetaItem>
        ) : null}
        <ApplicationMetaItem icon={Calendar}>
          <ShortDate value={application.appliedAt} />
        </ApplicationMetaItem>
        {sourceMeta ? (
          <ApplicationMetaItem icon={sourceMeta.icon}>
            {sourceMeta.label}
          </ApplicationMetaItem>
        ) : null}
        {hasAnswers ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <MessageSquareText className="size-3 shrink-0" strokeWidth={1.8} />
            {application.answers.length} answer
            {application.answers.length === 1 ? "" : "s"}
            {open ? (
              <ChevronUp className="size-3 shrink-0" strokeWidth={2} />
            ) : (
              <ChevronDown className="size-3 shrink-0" strokeWidth={2} />
            )}
          </button>
        ) : null}
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open && hasAnswers ? "1fr" : "0fr" }}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          <dl className="mt-3 space-y-3 rounded-md border border-border/70 bg-muted/25 p-4">
            {application.answers.map((answer) => (
              <div key={answer.id} className="space-y-1">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {answer.label}
                </dt>
                <dd className="whitespace-pre-line text-sm leading-6 text-foreground/90">
                  {answer.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

export type CandidateDetailsPanelProps = {
  candidateId: string;
  workspaceId: string;
  files: CandidateFileItem[];
  applications: Application[];
  email: string;
  phone: string | null;
  address: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  summary: string | null;
  educationEntries: CandidateEducationEntry[];
  experienceEntries: CandidateExperienceEntry[];
};

export function CandidateDetailsPanel({
  candidateId,
  workspaceId,
  files,
  applications,
  email,
  phone,
  address,
  linkedinUrl,
  githubUrl,
  websiteUrl,
  summary,
  educationEntries,
  experienceEntries,
}: CandidateDetailsPanelProps) {
  const [open, setOpen] = useState(true);
  const latestFile = files[0] ?? null;
  const resumeSummary = latestFile?.parsedSummary ?? null;
  const profileSummary = summary ?? resumeSummary;
  const skills = latestFile?.parsedSkills ?? [];
  const experienceYears = latestFile?.parsedExperienceYears ?? null;
  const resumeExperience: ResumeExperienceItem[] = latestFile?.parsedExperience ?? [];
  const resumeEducation: ResumeEducationItem[] = latestFile?.parsedEducationItems ?? [];
  const experience =
    experienceEntries.length > 0 ? experienceEntries : resumeExperience;
  const education = educationEntries.length > 0 ? educationEntries : resumeEducation;
  const educationFallback = latestFile?.parsedEducation ?? null;
  const applicationsWithAnswers = applications.filter(
    (application) => application.answers.length > 0,
  );
  const hasContactDetails = Boolean(
    email || phone || address || linkedinUrl || githubUrl || websiteUrl,
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm shadow-black/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 bg-muted/40 px-5 py-3.5 text-left sm:px-6"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold">Details</span>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" strokeWidth={1.8} />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" strokeWidth={1.8} />
        )}
      </button>

      {open ? (
        <div className="divide-y divide-border/70 border-t bg-card">
          <Section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionLabel>Resume</SectionLabel>
              <p className="text-xs text-muted-foreground">
                {files.length} {files.length === 1 ? "file" : "files"}
              </p>
            </div>
            <div className="mt-4">
              <CandidateFileUpload
                candidateId={candidateId}
                workspaceId={workspaceId}
                initialFiles={files}
              />
            </div>
          </Section>

          <Section hidden={!profileSummary}>
            <SectionLabel>Profile summary</SectionLabel>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-foreground/85">
              {profileSummary}
            </p>
          </Section>

          <Section hidden={!summary || !resumeSummary || summary === resumeSummary}>
            <SectionLabel>Resume summary</SectionLabel>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-foreground/85">
              {resumeSummary}
            </p>
          </Section>

          <Section hidden={experience.length === 0}>
            <SectionLabel meta={`${experience.length} entries`}>
              Work experience
            </SectionLabel>
            <div className="mt-4">
              <ExperienceTimeline experience={experience} />
            </div>
          </Section>

          <Section
            hidden={education.length === 0 && !educationFallback && experienceYears === null}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionLabel>Education</SectionLabel>
              <ExperienceHeadline years={experienceYears} />
            </div>
            <div className="mt-4">
              <EducationList education={education} fallback={educationFallback} />
            </div>
          </Section>

          <Section hidden={skills.length === 0}>
            <SectionLabel>Skills</SectionLabel>
            <div className="mt-4">
              <SkillsList skills={skills} />
            </div>
          </Section>

          <Section hidden={!hasContactDetails}>
            <SectionLabel>Contact details</SectionLabel>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <DetailRow
                label="Email"
                value={
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-2 break-all text-foreground transition-colors hover:text-primary"
                  >
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                    {email}
                  </a>
                }
              />
              {phone ? (
                <DetailRow
                  label="Phone"
                  value={
                    <a
                      href={`tel:${phone}`}
                      className="inline-flex items-center gap-2 text-foreground transition-colors hover:text-primary"
                    >
                      <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                      {phone}
                    </a>
                  }
                />
              ) : null}
              {address ? (
                <DetailRow
                  label="Address"
                  value={
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-foreground transition-colors hover:text-primary"
                    >
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                      {address}
                    </a>
                  }
                />
              ) : null}
              {linkedinUrl ? (
                <DetailRow
                  label="LinkedIn"
                  value={
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 break-all text-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                      {linkedinUrl}
                    </a>
                  }
                />
              ) : null}
              {githubUrl ? (
                <DetailRow
                  label="GitHub"
                  value={
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 break-all text-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                      {githubUrl}
                    </a>
                  }
                />
              ) : null}
              {websiteUrl ? (
                <DetailRow
                  label="Website"
                  value={
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 break-all text-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                      {websiteUrl}
                    </a>
                  }
                />
              ) : null}
            </dl>
          </Section>

          {applications.length > 0 ? (
            <section className="px-5 py-5 sm:px-6">
              <SectionLabel meta={`${applications.length} total`}>
                Applications
              </SectionLabel>
              <div className="mt-4 divide-y divide-border/60">
                {applications.map((application) => (
                  <ApplicationDisclosure key={application.id} application={application} />
                ))}
              </div>
            </section>
          ) : null}

          <Section hidden={applicationsWithAnswers.length === 0}>
            <SectionLabel
              meta={`${applicationsWithAnswers.length} application${applicationsWithAnswers.length === 1 ? "" : "s"}`}
            >
              Application answers
            </SectionLabel>
            <div className="mt-4 divide-y divide-border/60">
              {applicationsWithAnswers.map((application) => (
                <div key={application.id} className="py-4 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-foreground">
                    {application.jobTitle}
                  </p>
                  <dl className="mt-4 space-y-4">
                    {application.answers.map((answer) => (
                      <div key={answer.id} className="border-l border-border/70 pl-4">
                        <dt className="text-sm text-muted-foreground">
                          {answer.label}
                        </dt>
                        <dd className="mt-1 whitespace-pre-line text-sm leading-6 text-foreground/90">
                          {answer.answer}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </Section>
        </div>
      ) : null}
    </section>
  );
}
