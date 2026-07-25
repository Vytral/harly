"use client";

import { useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  CalendarClock,
  Check,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  NotebookTabs,
  MessageSquare,
  Minus,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AiScoreCard } from "@/features/candidates/AiScoreCard";
import { CandidateDetailsPanel } from "@/features/candidates/CandidateDetailsPanel";
import { CandidateDocumentUploadButton } from "@/features/candidates/CandidateDocumentUpload";
import { DocumentRequestsPanel } from "@/features/candidates/DocumentRequestsPanel";
import type { DocumentRequestItem } from "@/features/documents/requests-shared";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { EnvelopeSimpleDuotoneIcon } from "@/components/ui/icons/phosphor";
import { EditInterviewDialog } from "@/features/candidates/EditInterviewDialog";
import { EvaluationDrawer } from "@/features/candidates/EvaluationDrawer";
import { ScheduleDrawer } from "@/features/candidates/ScheduleDrawer";
import type {
  ScheduleApplicationOption,
  ScheduleCalConfig,
  ScheduleMemberOption,
} from "@/features/candidates/ScheduleDialog";
import { OffersPanel } from "@/features/offers/OffersPanel";
import type { CandidateOfferItem } from "@/features/offers/shared";
import { NoteForm } from "@/features/candidates/NoteForm";
import {
  EmailDrawer,
  type EmailTemplateOption,
} from "@/features/candidates/EmailDrawer";
import type { TemplateValues } from "@/features/email-templates/interpolate";
import { createCandidateNote } from "@/features/candidates/actions";
import {
  fulfilDsarErasureAction,
  reviewDsarRequestAction,
} from "@/features/workspaces/dsar-actions";
import {
  generateInterviewBriefAction,
  setInterviewStatus,
  summarizeInterviewNotesAction,
} from "@/features/interviews/actions";
import { retryInterviewSyncAction } from "@/features/interviews/sync-actions";
import {
  interviewModeLabel,
  interviewTypeLabel,
  type CandidateInterviewItem,
} from "@/features/interviews/shared";
import type {
  CandidateEducationEntry,
  CandidateExperienceEntry,
  ResumeEducationItem,
  ResumeExperienceItem,
} from "@harly/db";
import type { InterviewBrief, InterviewNotesSummary } from "@/lib/ai/schemas";
import type {
  CandidateActivityItem,
  CandidateAiEvaluationItem,
  CandidateApplicationStatus,
  CandidateNoteItem,
  CandidatePrivacyRequestItem,
  NoteMention,
} from "@/features/candidates/data";
import { AiButton } from "@/components/ui/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { RelativeTime, ShortDate } from "@/lib/date-hydration";
import { cn } from "@/lib/utils";
import { SidePanel } from "@/components/ui/side-panel";
import { sendDocumentForNativeSignature } from "@/features/documents/native-sign-actions";

type CandidateProfileApplication = {
  id: string;
  jobId: string;
  jobTitle: string;
  currentStageName: string | null;
  status: CandidateApplicationStatus;
  appliedAt: string;
  source: string | null;
  answers: Array<{ id: string; label: string; type: string; answer: string }>;
};

type CandidateFile = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  contentHash: string | null;
  parsedSummary: string | null;
  parsedSkills: string[];
  parsedEducation: string | null;
  parsedExperienceYears: number | null;
  parsedExperience: ResumeExperienceItem[];
  parsedEducationItems: ResumeEducationItem[];
  parsedAt: string | null;
  createdAt: string;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
};

type Scorecard = {
  id: string;
  rating: "strong" | "mixed" | "weak";
  comment: string | null;
  stageName: string | null;
  authorName: string | null;
  createdAt: string;
};

type CandidateMessage = {
  id: string;
  threadId: string | null;
  applicationId: string | null;
  direction: "outbound" | "inbound";
  transport: "imap" | "legacy-webhook" | "provider" | "smtp";
  subject: string;
  body: string;
  toEmail: string;
  fromEmail: string | null;
  status: "queued" | "sent" | "failed";
  read: boolean;
  authorName: string | null;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    storageKey: string;
  }>;
  createdAt: string;
};

type CandidateProfileTabsProps = {
  candidateId: string;
  workspaceId: string;
  candidateEmail: string;
  candidateName: string;
  candidatePhone: string | null;
  candidateAddress: string | null;
  candidateLinkedinUrl: string | null;
  candidateGithubUrl: string | null;
  candidateWebsiteUrl: string | null;
  candidateSummary: string | null;
  candidateEducationEntries: CandidateEducationEntry[];
  candidateExperienceEntries: CandidateExperienceEntry[];
  stageName: string | null;
  applications: CandidateProfileApplication[];
  notes: CandidateNoteItem[];
  files: CandidateFile[];
  relatedDocuments: Array<{ id: string; name: string; mimeType: string }>;
  signableDocuments: Array<{ id: string; name: string; mimeType: string; sizeBytes: number; updatedAt: Date }>;
  documentRequests: DocumentRequestItem[];
  canManageDocuments: boolean;
  activity: Array<
    Omit<CandidateActivityItem, "createdAt"> & { createdAt: string }
  >;
  scorecards: Scorecard[];
  messages: CandidateMessage[];
  interviews: CandidateInterviewItem[];
  members: NoteMention[];
  aiEvaluations: CandidateAiEvaluationItem[];
  aiConfigured: boolean;
  offers: CandidateOfferItem[];
  emailTemplates?: EmailTemplateOption[];
  emailTemplateValues?: TemplateValues;
  scheduleApplications: ScheduleApplicationOption[];
  scheduleMembers: ScheduleMemberOption[];
  scheduleCal: ScheduleCalConfig;
  currentUserId?: string;
  privacyRequests?: Array<
    Omit<CandidatePrivacyRequestItem, "createdAt" | "completedAt"> & {
      createdAt: string;
      completedAt: string | null;
    }
  >;
  canFulfilErasure?: boolean;
};

const INTERVIEW_MODE_ICON = {
  video: Video,
  phone: Phone,
  onsite: MapPin,
} as const;

const INTERVIEW_STATUS_META = {
  scheduled: { label: "Scheduled", variant: "neutral" as const, accent: "bg-slate-info" },
  completed: { label: "Completed", variant: "secondary" as const, accent: "bg-lime" },
  canceled: { label: "Canceled", variant: "danger" as const, accent: "bg-destructive" },
};

const interviewDateFmt = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const activityDotStyles: Record<string, string> = {
  "application.created": "bg-slate-info",
  "stage.changed": "bg-clay",
  "note.added": "bg-primary",
  "candidate.updated": "bg-muted-foreground",
  "file.uploaded": "bg-slate-info",
  "application.hired": "bg-primary",
  "application.rejected": "bg-destructive",
  "interview.scheduled": "bg-indigo-500",
  "interview.canceled": "bg-destructive",
  "interview.completed": "bg-emerald-500",
  "interview.rescheduled": "bg-amber-500",
};

const RATING_META = {
  strong: { label: "Strong", icon: ThumbsUp, className: "text-primary", accent: "bg-lime" },
  mixed: { label: "Mixed", icon: Minus, className: "text-clay", accent: "bg-clay" },
  weak: { label: "Weak", icon: ThumbsDown, className: "text-destructive", accent: "bg-destructive" },
} as const;

/**
 * Quiet label for a stacked section inside Overview / Process / Files. Uses the
 * chrome face at column-header scale so it structures without shouting , the
 * same treatment the human table gives its column heads.
 */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="type-col-head pt-1 uppercase">{children}</h3>;
}

function TabCount({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <Badge variant="secondary" className="ml-1.5 px-1.5">
      {value}
    </Badge>
  );
}

export function CandidateProfileTabs({
  candidateId,
  workspaceId,
  candidateEmail,
  candidateName,
  candidatePhone,
  candidateAddress,
  candidateLinkedinUrl,
  candidateGithubUrl,
  candidateWebsiteUrl,
  candidateSummary,
  candidateEducationEntries,
  candidateExperienceEntries,
  stageName,
  applications,
  notes,
  files,
  relatedDocuments,
  signableDocuments,
  documentRequests,
  canManageDocuments,
  activity,
  scorecards,
  messages,
  interviews,
  members,
  aiEvaluations,
  aiConfigured,
  offers,
  emailTemplates = [],
  emailTemplateValues = {},
  scheduleApplications,
  scheduleMembers,
  scheduleCal,
  currentUserId,
  privacyRequests = [],
  canFulfilErasure = false,
}: CandidateProfileTabsProps) {
  const [tab, setTab] = useState("overview");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const conversations = Array.from(
    messages.reduce((groups, message) => {
      const key = message.threadId ?? `legacy:${message.id}`;
      const group = groups.get(key) ?? [];
      group.push(message);
      groups.set(key, group);
      return groups;
    }, new Map<string, CandidateMessage[]>()).values(),
  ).map((group) => group.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));

  return (
    <Tabs value={tab} onValueChange={setTab}>
      {/*
        Three sections, hard cap (DESIGN.md , Candidate Focus).

        This was eight equal tabs: Profile, Interviews, Communication,
        Evaluation, Offers, Activity, Documents, Privacy. Eight equal tabs is a
        confession that the model was never decided , everything is equally
        important, so nothing is. A recruiter does not work by tab, they work by
        intention: is this person any good (Overview), what is happening with
        them (Process), and what is on file (Files).

        Radix renders every TabsContent whose value matches, so the old panels
        stack as labelled sections inside their new home rather than being
        rewritten , same content, three doors instead of eight.
      */}
      <TabsList
        variant="line"
        className="w-full justify-start gap-5 border-b border-hairline text-sm [&>button]:flex-none [&>button]:px-0.5"
      >
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="process">
          Process
          <TabCount
            value={
              interviews.length +
              messages.length +
              scorecards.length +
              offers.length
            }
          />
        </TabsTrigger>
        <TabsTrigger value="files">
          Files
          <TabCount value={relatedDocuments.length + privacyRequests.length} />
        </TabsTrigger>
      </TabsList>

      {/* ── Profile , AI match leads, single "Details" panel follows ── */}
      <TabsContent value="overview" className="mt-5 space-y-4">
        <AiScoreCard
          applications={applications.map((application) => ({
            id: application.id,
            jobTitle: application.jobTitle,
          }))}
          evaluations={aiEvaluations}
          aiConfigured={aiConfigured}
          variant="condensed"
          onViewDetailsAction={() => setTab("process")}
        />

        <CandidateDetailsPanel
          candidateId={candidateId}
          workspaceId={workspaceId}
          files={files}
          applications={applications}
          email={candidateEmail}
          phone={candidatePhone}
          address={candidateAddress}
          linkedinUrl={candidateLinkedinUrl}
          githubUrl={candidateGithubUrl}
          websiteUrl={candidateWebsiteUrl}
          summary={candidateSummary}
          educationEntries={candidateEducationEntries}
          experienceEntries={candidateExperienceEntries}
        />
      </TabsContent>

      {/* ── Interviews ── */}
      <TabsContent value="process" className="mt-4 space-y-3">
        <SectionHeading>Interviews</SectionHeading>
        <div className="flex justify-end">
          <ScheduleDrawer
            candidateId={candidateId}
            workspaceId={workspaceId}
            candidateName={candidateName}
            candidateEmail={candidateEmail}
            applications={scheduleApplications}
            members={scheduleMembers}
            cal={scheduleCal}
            trigger={
              <Button size="sm">
                <Plus className="size-4" />
                Schedule interview
              </Button>
            }
          />
        </div>
        {interviews.length === 0 ? (
          <EmptyTab icon={CalendarClock} text="No interviews scheduled yet." />
        ) : (
          <div className="space-y-3 duration-300 animate-in fade-in slide-in-from-bottom-1">
            {interviews.map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                candidateId={candidateId}
                workspaceId={workspaceId}
                members={scheduleMembers}
                currentUserId={currentUserId}
                aiConfigured={aiConfigured}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Activity (merged History + Comments) ── */}
      <TabsContent value="overview" className="mt-4 space-y-4">
        <SectionHeading>Activity & notes</SectionHeading>
        {/* Notes always on top so the form is reachable without scrolling */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes &amp; comments
          </p>
          <NoteForm
            candidateId={candidateId}
            workspaceId={workspaceId}
            initialNotes={notes}
            members={members}
          />
        </div>

        {/* Timeline below */}
        {activity.length > 0 ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Timeline
            </p>
            <div className="space-y-1">
              {activity.map((event, index) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                        activityDotStyles[event.type] ?? "bg-muted-foreground"
                      }`}
                    />
                    {index < activity.length - 1 ? (
                      <span className="my-1 w-px flex-1 bg-border" />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium">{event.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {event.actorName ? `${event.actorName} · ` : ""}
                      <RelativeTime value={event.createdAt} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activity.length === 0 && notes.length === 0 ? (
          <EmptyTab icon={MessageSquare} text="No activity yet." />
        ) : null}
      </TabsContent>

      <TabsContent value="files" className="mt-4 space-y-3">
        <SectionHeading>Privacy requests</SectionHeading>
        <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <p className="text-sm font-medium">Privacy requests</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the candidate’s applications, communication, notes, and
              activity before recording a decision.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTab("overview")}
          >
            View activity
          </Button>
        </div>
        <div className="space-y-4 duration-300 animate-in fade-in slide-in-from-bottom-1">
          {privacyRequests.map((request) => (
            <PrivacyRequestCard
              key={request.id}
              request={request}
              candidateId={candidateId}
              candidateEmail={candidateEmail}
              canFulfilErasure={canFulfilErasure}
              inventory={{
                applications: applications.length,
                interviews: interviews.length,
                messages: messages.length,
                files: files.length,
                notes: notes.length,
                scorecards: scorecards.length,
                aiEvaluations: aiEvaluations.length,
                offers: offers.length,
                activity: activity.length,
              }}
            />
          ))}
        </div>
      </TabsContent>

      {/* ── Communication ── */}
      <TabsContent value="process" className="mt-4 space-y-3">
        <SectionHeading>Communication</SectionHeading>
        <div className="flex justify-end">
          <EmailDrawer
            candidateId={candidateId}
            workspaceId={workspaceId}
            email={candidateEmail}
            name={candidateName}
            templates={emailTemplates}
            templateValues={emailTemplateValues}
            aiConfigured={aiConfigured}
            trigger={
              <Button size="sm">
                <Mail className="size-4" />
                New message
              </Button>
            }
          />
        </div>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <EnvelopeSimpleDuotoneIcon className="size-6" />
            </span>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Send your first message using the button above.
            </p>
          </div>
        ) : (
          <div className="space-y-4 duration-300 animate-in fade-in slide-in-from-bottom-1">
            {conversations.map((conversation) => (
              <ConversationThread
                key={conversation[0]!.threadId ?? `legacy:${conversation[0]!.id}`}
                conversation={conversation}
                candidateId={candidateId}
                candidateName={candidateName}
                candidateEmail={candidateEmail}
                workspaceId={workspaceId}
                aiConfigured={aiConfigured}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Evaluation: AI score + scorecards ── */}
      <TabsContent value="process" className="mt-4 space-y-4">
        <SectionHeading>Evaluation</SectionHeading>
        <AiScoreCard
          applications={applications.map((application) => ({
            id: application.id,
            jobTitle: application.jobTitle,
          }))}
          evaluations={aiEvaluations}
          aiConfigured={aiConfigured}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {scorecards.length === 0
              ? "No evaluations yet."
              : `${scorecards.length} evaluation${scorecards.length === 1 ? "" : "s"}.`}
          </p>
          {applications[0] ? (
            <EvaluationDrawer
              candidateId={candidateId}
              workspaceId={workspaceId}
              applicationId={applications[0].id}
              stageName={stageName}
              trigger={
                <Button size="sm">
                  <ClipboardCheck className="size-4" />
                  Add evaluation
                </Button>
              }
            />
          ) : (
            <Button size="sm" disabled>
              <ClipboardCheck className="size-4" />
              Add evaluation
            </Button>
          )}
        </div>
        <div className="space-y-3 duration-300 animate-in fade-in slide-in-from-bottom-1">
          {scorecards.map((scorecard) => {
            const meta = RATING_META[scorecard.rating];
            return (
              <div
                key={scorecard.id}
                className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm"
              >
                <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", meta.accent)} />
                <div className="space-y-2 p-5 pl-6">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-sm font-semibold",
                        meta.className,
                      )}
                    >
                      <meta.icon className="size-4" strokeWidth={2} />
                      {meta.label}
                    </span>
                    {scorecard.stageName ? (
                      <Badge variant="neutral">{scorecard.stageName}</Badge>
                    ) : null}
                  </div>
                  {scorecard.comment ? (
                    <p className="whitespace-pre-line text-sm">
                      {scorecard.comment}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {scorecard.authorName ?? "Someone"} ·{" "}
                    <RelativeTime value={scorecard.createdAt} />
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </TabsContent>

      {/* ── Offers ── */}
      <TabsContent value="process" className="mt-4">
        <SectionHeading>Offers</SectionHeading>
        <OffersPanel
          offers={offers}
          applications={applications.map((application) => ({
            id: application.id,
            jobTitle: application.jobTitle,
          }))}
          documents={relatedDocuments}
        />
      </TabsContent>

      <TabsContent value="files" className="mt-4 space-y-4">
        <SectionHeading>Documents</SectionHeading>
        <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><NotebookTabs className="size-4" /></span>
            <div><p className="text-sm font-medium">Candidate documents</p><p className="mt-1 text-xs leading-5 text-muted-foreground">CVs and documents linked to this candidate stay visible here while the Documents hub remains the source of truth.</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canManageDocuments ? <CandidateDocumentUploadButton candidateId={candidateId} /> : null}
            {canManageDocuments ? <Button size="sm" onClick={() => setSignatureOpen(true)} disabled={signableDocuments.length === 0}><Send className="size-4" />Request signature</Button> : null}
            <Button asChild size="sm" variant="outline"><Link href={{ pathname: "/dashboard/documents", query: { candidateId } }}>Open hub</Link></Button>
          </div>
        </div>
        {relatedDocuments.length === 0 ? <div className="rounded-xl border border-dashed px-6 py-12 text-center"><NotebookTabs className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No linked documents yet</p><p className="mt-1 text-sm text-muted-foreground">Upload a document in the hub and associate it with this candidate.</p></div> : <div className="divide-y rounded-xl border">{relatedDocuments.map((document) => <Link key={document.id} href={`/dashboard/documents/${document.id}` as Route} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/30"><FileText className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{document.name}</span><span className="text-xs text-muted-foreground">{document.mimeType === "application/pdf" ? "PDF" : "Document"}</span><ExternalLink className="size-3.5 text-muted-foreground" /></Link>)}</div>}

        <DocumentRequestsPanel
          requests={documentRequests}
          applications={applications.map((application) => ({ id: application.id, jobTitle: application.jobTitle }))}
          canManage={canManageDocuments}
        />
        <CandidateSignaturePanel
          open={signatureOpen}
          onOpenChange={setSignatureOpen}
          candidateName={candidateName}
          candidateEmail={candidateEmail}
          documents={signableDocuments}
        />
      </TabsContent>
    </Tabs>
  );
}

function CandidateSignaturePanel({
  open,
  onOpenChange,
  candidateName,
  candidateEmail,
  documents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  candidateEmail: string;
  documents: Array<{ id: string; name: string; mimeType: string; sizeBytes: number; updatedAt: Date | string }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = documents.filter((document) => document.name.toLowerCase().includes(normalizedQuery));
  const selected = documents.find((document) => document.id === selectedId) ?? null;

  function reset() {
    setQuery("");
    setSelectedId("");
  }

  function submit() {
    if (!selected) {
      toast.error("Choose a PDF document first.");
      return;
    }
    startTransition(async () => {
      const result = await sendDocumentForNativeSignature({ documentId: selected.id, recipientEmail: candidateEmail, recipientName: candidateName });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Signing link sent to ${candidateName}`);
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={(value) => { if (!value) reset(); onOpenChange(value); }}
      title="Request a signature"
      description={`Choose a PDF from the workspace library for ${candidateName}.`}
      className="sm:max-w-[760px]"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button><Button onClick={submit} disabled={pending || !selected}>{pending ? "Sending…" : "Send signing link"}</Button></>}
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
          <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="size-4" /></span><div><p className="text-sm font-medium">Recipient</p><p className="mt-1 text-sm">{candidateName}</p><p className="text-xs text-muted-foreground">{candidateEmail}</p></div></div>
        </div>
        <div className="space-y-3">
          <div><p className="text-sm font-medium">Document</p><p className="mt-1 text-xs text-muted-foreground">Only active, unsigned PDFs you can manage are shown.</p></div>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by document name…" className="pl-9" aria-label="Search documents" /></div>
          <div className="max-h-[min(52vh,520px)] overflow-y-auto rounded-xl border">
            {filtered.length === 0 ? <div className="px-5 py-10 text-center"><FileText className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No matching documents</p><p className="mt-1 text-xs text-muted-foreground">Try another name or upload the PDF to the Documents hub first.</p></div> : filtered.map((document) => <button type="button" key={document.id} onClick={() => setSelectedId(document.id)} className={cn("flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/40", selectedId === document.id && "bg-primary/[0.08]")}><span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", selectedId === document.id ? "border-primary bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground")}><FileText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{document.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">PDF · {(document.sizeBytes / 1024).toFixed(0)} KB</span></span>{selectedId === document.id ? <Check className="size-4 shrink-0 text-primary" /> : null}</button>)}
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">The candidate receives a secure Harly Signature link. The workspace security setting controls whether email OTP is required.</p>
      </div>
    </SidePanel>
  );
}

type PrivacyRequest = NonNullable<
  CandidateProfileTabsProps["privacyRequests"]
>[number];

type PrivacyInventory = {
  applications: number;
  interviews: number;
  messages: number;
  files: number;
  notes: number;
  scorecards: number;
  aiEvaluations: number;
  offers: number;
  activity: number;
};

const INVENTORY_ROWS: Array<{ key: keyof PrivacyInventory; label: string }> = [
  { key: "applications", label: "Applications" },
  { key: "interviews", label: "Interviews" },
  { key: "messages", label: "Email messages" },
  { key: "files", label: "Files & résumés" },
  { key: "notes", label: "Internal notes" },
  { key: "scorecards", label: "Scorecards" },
  { key: "aiEvaluations", label: "AI evaluations" },
  { key: "offers", label: "Offers" },
];

// GDPR Art. 12(3): respond to a data-subject request within one month.
const DSAR_DUE_DAYS = 30;

const PRIVACY_TYPE_META = {
  export: { label: "Data export request", icon: Download, className: "bg-slate-info/10 text-slate-info" },
  erasure: { label: "Erasure request", icon: Trash2, className: "bg-destructive/10 text-destructive" },
} as const;

const PRIVACY_STATUS_ACCENT: Record<string, string> = {
  warning: "bg-clay",
  info: "bg-slate-info",
  success: "bg-lime",
  danger: "bg-destructive",
};

function PrivacyRequestCard({
  request,
  candidateId,
  candidateEmail,
  canFulfilErasure,
  inventory,
}: {
  request: PrivacyRequest;
  candidateId: string;
  candidateEmail: string;
  canFulfilErasure: boolean;
  inventory: PrivacyInventory;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");

  function review(decision: "approve" | "deny") {
    startTransition(async () => {
      const result = await reviewDsarRequestAction({
        requestId: request.id,
        decision,
        notes: note || undefined,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not review the request.");
        return;
      }
      toast.success(
        decision === "approve"
          ? "Request approved for fulfilment."
          : "Request denied.",
      );
      router.refresh();
    });
  }

  function fulfilErasure() {
    startTransition(async () => {
      const result = await fulfilDsarErasureAction({
        requestId: request.id,
        candidateId,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not fulfil the erasure request.");
        return;
      }
      toast.success("Candidate data erased and request fulfilled.");
      router.replace("/dashboard/candidates");
    });
  }

  const statusLabel =
    request.status === "processing"
      ? "In progress"
      : request.status[0].toUpperCase() + request.status.slice(1);

  const statusBadge = {
    pending: "warning",
    processing: "info",
    completed: "success",
    denied: "danger",
  }[request.status] as "warning" | "info" | "success" | "danger";

  const dueDate = new Date(
    new Date(request.createdAt).getTime() + DSAR_DUE_DAYS * 86_400_000,
  );
  const isOpen =
    request.status === "pending" || request.status === "processing";
  const isErasure = request.type === "erasure";
  const scoped = INVENTORY_ROWS.filter((row) => inventory[row.key] > 0);
  const emailConfirmed =
    confirmEmail.trim().toLowerCase() === candidateEmail.trim().toLowerCase();

  const source = request.requestedBy ? "candidate portal" : null;
  const typeMeta = PRIVACY_TYPE_META[request.type];

  return (
    <div className="relative max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", PRIVACY_STATUS_ACCENT[statusBadge])}
      />
      <div className="space-y-5 p-5 pl-6">
        {/* Heading , type icon + title + status, timing floated right */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", typeMeta.className)}>
              <typeMeta.icon className="size-4" strokeWidth={1.8} />
            </span>
            <h3 className="font-medium">{typeMeta.label}</h3>
            <Badge variant={statusBadge}>{statusLabel}</Badge>
          </div>
          <span className="shrink-0 text-[13px] text-muted-foreground">
            <RelativeTime value={request.createdAt} />
          </span>
        </div>

        {/* One-line context , who, how, deadline */}
        <p className="text-sm text-muted-foreground">
          Requested by{" "}
          <span className="text-foreground">
            {request.requestedBy ?? "the candidate"}
          </span>
          {source ? ` via ${source}` : ""}
          {isOpen ? (
            <>
              {" "}
              · respond by <ShortDate value={dueDate} />
            </>
          ) : null}
          {request.processedBy ? (
            <> · reviewed by {request.processedBy}</>
          ) : null}
        </p>

        {/* Data in scope , scannable number grid, weighted like the warning it is */}
        {isErasure ? (
          <div
            className={cn(
              "rounded-xl border p-5",
              scoped.length > 0
                ? "border-destructive/20 bg-destructive/[0.04]"
                : "border-border/60 bg-muted/30",
            )}
          >
            <p
              className={cn(
                "flex items-center gap-1.5 text-[13px]",
                scoped.length > 0 ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {scoped.length > 0 ? <AlertTriangle className="size-3.5 shrink-0" /> : null}
              {scoped.length > 0
                ? "Approving permanently destroys the following"
                : "No linked records — only the candidate profile remains"}
            </p>
            {scoped.length > 0 ? (
              <dl className="mt-4 grid grid-cols-[repeat(3,auto)] justify-start gap-x-12 gap-y-5">
                {scoped.map((row) => (
                  <div key={row.key}>
                    <dd className="text-xl font-semibold tabular-nums leading-none text-foreground">
                      {inventory[row.key]}
                    </dd>
                    <dt className="mt-1.5 text-[13px] text-muted-foreground">
                      {row.label}
                    </dt>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}

        {/* Prior review note , only for already-decided requests */}
        {request.notes && request.status !== "pending" ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {request.notes}
          </p>
        ) : null}

        {/* Decision , pending: optional note + Deny / Approve */}
        {request.status === "pending" ? (
          <div className="space-y-4">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Internal review note (optional)"
              maxLength={1000}
              className="min-h-[70px] resize-y text-sm"
            />
            <div className="flex gap-2.5">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    className="border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                  >
                    Deny
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Deny this request?</DialogTitle>
                    <DialogDescription>
                      This records the decision and its review note in the audit
                      log.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" disabled={isPending}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => review("deny")}
                      >
                        Deny request
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={isPending}>
                    Approve
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve for fulfilment?</DialogTitle>
                    <DialogDescription>
                      {isErasure
                        ? "Approval moves the request to fulfilment; it does not delete data yet. A role with candidate deletion access confirms the erasure in a second step."
                        : "This records your approval in the audit log."}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" disabled={isPending}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        disabled={isPending}
                        onClick={() => review("approve")}
                      >
                        Approve request
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : null}

        {/* Fulfilment , processing erasure: irreversible confirm */}
        {request.status === "processing" && isErasure ? (
          canFulfilErasure ? (
            <Dialog
              onOpenChange={(open) => {
                if (!open) setConfirmEmail("");
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={isPending}>
                  Erase candidate data
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Permanently erase candidate data?</DialogTitle>
                  <DialogDescription>
                    This fulfils the approved request. The candidate profile and
                    every linked record above are permanently removed, then you
                    return to Candidates.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <label
                    htmlFor={`erase-confirm-${request.id}`}
                    className="text-sm text-muted-foreground"
                  >
                    Type{" "}
                    <span className="font-medium text-foreground">
                      {candidateEmail}
                    </span>{" "}
                    to confirm.
                  </label>
                  <Input
                    id={`erase-confirm-${request.id}`}
                    value={confirmEmail}
                    onChange={(event) => setConfirmEmail(event.target.value)}
                    placeholder={candidateEmail}
                    autoComplete="off"
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" disabled={isPending}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      variant="destructive"
                      disabled={isPending || !emailConfirmed}
                      onClick={fulfilErasure}
                    >
                      Erase permanently
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <p className="text-sm text-muted-foreground">
              Approved and awaiting fulfilment — a role with candidate deletion
              access must complete the erasure.
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}

function ConversationThread({
  conversation,
  candidateId,
  candidateName,
  candidateEmail,
  workspaceId,
  aiConfigured,
}: {
  conversation: CandidateMessage[];
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  workspaceId: string;
  aiConfigured: boolean;
}) {
  const first = conversation[0]!;
  const last = conversation[conversation.length - 1]!;
  const threadId = first.threadId;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <UserAvatar name={candidateName} size="sm" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{first.subject}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {candidateName} · {conversation.length}{" "}
              {conversation.length === 1 ? "message" : "messages"} ·{" "}
              <RelativeTime value={last.createdAt} />
            </p>
          </div>
        </div>
        <Badge
          variant={last.status === "failed" ? "danger" : last.read ? "neutral" : "secondary"}
        >
          {last.status === "failed" ? "Failed" : last.read ? "Read" : "Unread"}
        </Badge>
      </div>

      <div className="space-y-3 px-5 py-4">
        {conversation.map((message) => {
          const inbound = message.direction === "inbound";
          return (
            <div key={message.id} className={cn("flex", inbound ? "justify-start" : "justify-end")}>
              <div className={cn("flex max-w-[85%] flex-col gap-1.5", inbound ? "items-start" : "items-end")}>
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs text-muted-foreground",
                    !inbound && "flex-row-reverse",
                  )}
                >
                  <span className="font-medium text-foreground/80">
                    {inbound ? message.fromEmail ?? "Candidate" : "You"}
                  </span>
                  <RelativeTime value={message.createdAt} />
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm",
                    inbound ? "bg-muted/60 text-foreground" : "bg-primary/10 text-foreground",
                  )}
                >
                  <p className="whitespace-pre-line">{message.body}</p>
                </div>
                {message.attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((attachment, index) => (
                      <a
                        key={`${attachment.storageKey}-${index}`}
                        href={`/api/inbound-email/attachments/${message.id}/${index}`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground"
                      >
                        <Paperclip className="size-3" />
                        {attachment.filename}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
        {threadId ? (
          <Link
            href={`/dashboard/inbox?thread=${encodeURIComponent(threadId)}`}
            className="text-xs font-semibold text-foreground underline underline-offset-4"
          >
            Open in Inbox
          </Link>
        ) : (
          <span />
        )}
        {threadId ? (
          <EmailDrawer
            candidateId={candidateId}
            threadId={threadId}
            workspaceId={workspaceId}
            email={candidateEmail}
            name={candidateName}
            aiConfigured={aiConfigured}
            trigger={
              <Button size="sm" variant="outline">
                <Mail className="size-4" />
                Reply
              </Button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function InterviewCard({
  interview,
  candidateId,
  workspaceId,
  members,
  currentUserId,
  aiConfigured,
}: {
  interview: CandidateInterviewItem;
  candidateId: string;
  workspaceId: string;
  members: ScheduleMemberOption[];
  currentUserId?: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ModeIcon = INTERVIEW_MODE_ICON[interview.mode];
  const statusMeta = INTERVIEW_STATUS_META[interview.status];
  const isPast = interview.status !== "scheduled";

  function update(status: "completed" | "canceled") {
    startTransition(async () => {
      const result = await setInterviewStatus({
        interviewId: interview.id,
        candidateId,
        status,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(
        status === "completed" ? "Marked complete" : "Interview canceled",
      );
      if (result.warning) toast.warning(result.warning);
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  function retrySync(syncId: string) {
    startTransition(async () => {
      const result = await retryInterviewSyncAction({ syncId });
      if (!result.success) {
        toast.error(result.error ?? "Could not retry synchronization.");
        return;
      }
      toast.success("Synchronization retried");
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm",
        isPast && "opacity-80",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1", INTERVIEW_STATUS_META[interview.status].accent)}
      />
      <div className="space-y-3 p-6 pl-7">
        {/* Title row: title left, status + edit right */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">
              {interview.title ?? interviewTypeLabel(interview.type)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {interviewDateFmt.format(new Date(interview.scheduledAt))} ·{" "}
              {interview.durationMins} min
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {interview.status === "scheduled" ? (
              <EditInterviewDialog
                interview={interview}
                candidateId={candidateId}
                members={members}
                currentUserId={currentUserId}
                trigger={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </Button>
                }
              />
            ) : null}
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
        </div>

        {/* Mode pill */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground w-fit">
          <ModeIcon className="size-3.5" strokeWidth={1.8} />
          {interviewModeLabel(interview.mode)}
        </span>

        {/* Location */}
        {interview.location ? (
          <div className="flex items-center gap-2 text-sm text-foreground/90">
            <MapPin
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.8}
            />
            <span className="truncate">{interview.location}</span>
          </div>
        ) : null}

        {/* Meet link */}
        {interview.teamsMeetingId && interview.meetLink ? (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <a
              href={interview.meetLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video className="size-4" />
              Join Teams Meeting
            </a>
          </Button>
        ) : interview.zoomMeetingId && interview.meetLink ? (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <a
              href={interview.meetLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video className="size-4" />
              Join Zoom Meeting
            </a>
          </Button>
        ) : interview.meetLink ? (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <a
              href={interview.meetLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video className="size-4" />
              Join Google Meet
            </a>
          </Button>
        ) : null}

        {/* Provider sync recovery */}
        {interview.syncs?.map((sync) => {
          if (sync.status === "synced" || sync.status === "canceled") return null;
          const providerLabel =
            sync.provider === "google_calendar"
              ? "Google Calendar"
              : sync.provider === "microsoft_teams"
                ? "Microsoft Teams"
                : sync.provider === "jitsi"
                  ? "Jitsi"
                  : "Zoom";
          const pending = sync.status === "pending";
          return (
            <div
              key={sync.id}
              className="flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/20"
            >
              <AlertTriangle className="size-4 shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
                {pending
                  ? `${providerLabel} sync is pending.`
                  : `${providerLabel} sync failed${sync.lastError ? `: ${sync.lastError}` : "."}`}
              </span>
              {!pending ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => retrySync(sync.id)}
                >
                  <RotateCcw className="size-3.5" />
                  Retry
                </Button>
              ) : null}
            </div>
          );
        })}

        {/* Notes */}
        {interview.notes ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <FileText className="size-4 shrink-0 mt-0.5" strokeWidth={1.8} />
            <span className="whitespace-pre-line">{interview.notes}</span>
          </div>
        ) : null}

        {/* Interviewer */}
        {interview.interviewerName ? (
          <div className="flex items-center gap-2.5">
            <UserAvatar
              name={interview.interviewerName}
              src={interview.interviewerImage}
              size="sm"
              className="size-7 text-[11px]"
            />
            <span className="text-sm font-medium">
              {interview.interviewerName}
            </span>
          </div>
        ) : null}

        {/* Separator + actions */}
        <div className="border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {interview.status === "scheduled" ? (
              <>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={isPending}>
                      <Check className="size-4" />
                      Mark complete
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Mark interview as complete?</DialogTitle>
                      <DialogDescription>
                        This will mark the interview with{" "}
                        {interview.interviewerName ?? "the interviewer"} as
                        completed.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" disabled={isPending}>
                          Cancel
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          disabled={isPending}
                          onClick={() => update("completed")}
                        >
                          {isPending ? "Saving…" : "Confirm"}
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      disabled={isPending}
                    >
                      <X className="size-4" />
                      Cancel
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancel this interview?</DialogTitle>
                      <DialogDescription>
                        The candidate will be notified. This action cannot be
                        undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" disabled={isPending}>
                          Go back
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => update("canceled")}
                        >
                          {isPending ? "Canceling…" : "Yes, cancel interview"}
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            ) : null}
            {interview.gcalEventId ? (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
              >
                <a
                  href={`https://calendar.google.com/calendar/r/search?q=${encodeURIComponent(interview.gcalEventId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Google Calendar
                </a>
              </Button>
            ) : interview.status === "scheduled" ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-400" />
                Not synced to GCal
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {aiConfigured ? (
                <>
                  <InterviewBriefSheet
                    interview={interview}
                    trigger={
                      <AiButton size="sm" variant="outline">
                        Interview Brief
                      </AiButton>
                    }
                  />
                  {interview.status === "completed" ? (
                    <SummarizeNotesSheet
                      interview={interview}
                      candidateId={candidateId}
                      workspaceId={workspaceId}
                      trigger={
                        <AiButton size="sm" variant="outline">
                          Summarize notes
                        </AiButton>
                      }
                    />
                  ) : null}
                </>
              ) : null}
              <EvaluationDrawer
                candidateId={candidateId}
                workspaceId={workspaceId}
                applicationId={interview.applicationId}
                stageName={
                  interview.title ?? interviewTypeLabel(interview.type)
                }
                trigger={
                  <Button size="sm" variant="outline">
                    <ClipboardCheck className="size-4" />
                    Evaluate
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recommendation meta (mirrors AiScoreCard) ────────────────────────────────
const DECISION_META: Record<
  "strong_yes" | "yes" | "maybe" | "no",
  { label: string; className: string }
> = {
  strong_yes: { label: "Strong yes", className: "bg-primary/10 text-primary" },
  yes: { label: "Yes", className: "bg-primary/10 text-primary" },
  maybe: { label: "Maybe", className: "bg-clay/15 text-clay" },
  no: { label: "No", className: "bg-destructive/10 text-destructive" },
};

// ── InterviewBriefSheet ───────────────────────────────────────────────────────
function InterviewBriefSheet({
  interview,
  trigger,
}: {
  interview: CandidateInterviewItem;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [brief, setBrief] = useState<InterviewBrief | null>(
    interview.briefContent ?? null,
  );

  function generate() {
    startTransition(async () => {
      const result = await generateInterviewBriefAction({
        interviewId: interview.id,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBrief(result.brief);
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      mobilePresentation="bottom-on-mobile"
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title="Interview Brief"
        description={`${interview.title ?? interviewTypeLabel(interview.type)} · ${interview.jobTitle}`}
        footer={
          <AiButton
            size="sm"
            variant={brief ? "outline" : "default"}
            onClick={generate}
            loading={isPending}
            loadingText="Generating"
          >
            {brief ? "Regenerate" : "Generate Brief"}
          </AiButton>
        }
      >
        {brief ? (
          <div className="space-y-5 text-sm">
            <div>
              <p className="mb-1.5 font-medium text-foreground">
                Candidate summary
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {brief.candidateSummary}
              </p>
            </div>

            {brief.keyAreasToProbe.length > 0 ? (
              <div>
                <p className="mb-1.5 font-medium text-foreground">
                  Key areas to probe
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  {brief.keyAreasToProbe.map((area, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {brief.suggestedQuestions.length > 0 ? (
              <div>
                <p className="mb-1.5 font-medium text-foreground">
                  Suggested questions
                </p>
                <ol className="space-y-2 text-muted-foreground">
                  {brief.suggestedQuestions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="shrink-0 tabular-nums text-muted-foreground/50 w-4">
                        {i + 1}.
                      </span>
                      {q}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {brief.redFlags.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                <div className="mb-1.5 flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle
                    className="size-3.5 shrink-0"
                    strokeWidth={2}
                  />
                  Watch for
                </div>
                <ul className="space-y-1 text-amber-700/90 dark:text-amber-400/80">
                  {brief.redFlags.map((flag, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400" />
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <BrainCircuit className="size-5" strokeWidth={1.8} />
            </span>
            <p className="text-sm text-muted-foreground max-w-[220px]">
              Generate a brief to get candidate context, suggested questions,
              and areas to probe.
            </p>
          </div>
        )}
      </DrawerLayout>
    </Sheet>
  );
}

// ── SummarizeNotesSheet ───────────────────────────────────────────────────────
function SummarizeNotesSheet({
  interview,
  candidateId,
  workspaceId,
  trigger,
}: {
  interview: CandidateInterviewItem;
  candidateId: string;
  workspaceId: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rawNotes, setRawNotes] = useState("");
  const [summary, setSummary] = useState<InterviewNotesSummary | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  function summarize() {
    if (!rawNotes.trim()) {
      toast.error("Enter some notes first.");
      return;
    }
    startTransition(async () => {
      const result = await summarizeInterviewNotesAction({
        interviewId: interview.id,
        rawNotes,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSummary(result.summary);
    });
  }

  function saveAsNote() {
    if (!summary) return;
    const decision = DECISION_META[summary.suggestedDecision];
    const body = [
      `Interview summary, ${interview.title ?? interviewTypeLabel(interview.type)}`,
      "",
      summary.executiveSummary,
      "",
      "Positive signals",
      ...summary.positiveSignals.map((s) => `• ${s}`),
      ...(summary.concerns.length > 0
        ? ["", "Concerns", ...summary.concerns.map((c) => `• ${c}`)]
        : []),
      "",
      `Suggested decision: ${decision?.label ?? summary.suggestedDecision}`,
    ].join("\n");

    startSaveTransition(async () => {
      const result = await createCandidateNote({
        candidateId,
        workspaceId,
        body,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not save note.");
        return;
      }
      toast.success("Summary saved as note");
      setOpen(false);
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      mobilePresentation="bottom-on-mobile"
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <DrawerLayout
        title="Summarize interview notes"
        description={`${interview.title ?? interviewTypeLabel(interview.type)} · ${interview.jobTitle}`}
        footer={
          summary ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={saveAsNote}
            >
              {isSaving ? "Saving…" : "Save as note"}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {!summary ? (
            <>
              <Textarea
                placeholder="Paste or type your raw interview notes here…"
                className="min-h-[180px] resize-y text-sm"
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                disabled={isPending}
              />
              <AiButton
                size="sm"
                onClick={summarize}
                loading={isPending}
                loadingText="Summarizing"
                disabled={!rawNotes.trim()}
              >
                Summarize with AI
              </AiButton>
            </>
          ) : (
            <div className="space-y-5 text-sm">
              <div>
                <p className="mb-1.5 font-medium text-foreground">Summary</p>
                <p className="text-muted-foreground leading-relaxed">
                  {summary.executiveSummary}
                </p>
              </div>

              {summary.positiveSignals.length > 0 ? (
                <div>
                  <p className="mb-1.5 font-medium text-foreground">
                    Positive signals
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    {summary.positiveSignals.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {summary.concerns.length > 0 ? (
                <div>
                  <p className="mb-1.5 font-medium text-foreground">Concerns</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {summary.concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive/60" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">
                  Suggested decision
                </p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    DECISION_META[summary.suggestedDecision]?.className,
                  )}
                >
                  {DECISION_META[summary.suggestedDecision]?.label ??
                    summary.suggestedDecision}
                </span>
              </div>

              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setSummary(null)}
              >
                Edit notes and re-summarize
              </button>
            </div>
          )}
        </div>
      </DrawerLayout>
    </Sheet>
  );
}

/** Empty-state slot for tabs that have no data yet. */
function EmptyTab({
  icon: Icon,
  text,
}: {
  icon: typeof MessageSquare;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
