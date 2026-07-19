"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownLeft,
  BrainCircuit,
  CalendarClock,
  Check,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  MessageSquare,
  Minus,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AiScoreCard } from "@/features/candidates/AiScoreCard";
import { CandidateDetailsPanel } from "@/features/candidates/CandidateDetailsPanel";
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
import { EmailDrawer, type EmailTemplateOption } from "@/features/candidates/EmailDrawer";
import type { TemplateValues } from "@/features/email-templates/interpolate";
import { createCandidateNote } from "@/features/candidates/actions";
import { fulfilDsarErasureAction, reviewDsarRequestAction } from "@/features/workspaces/dsar-actions";
import {
  generateInterviewBriefAction,
  setInterviewStatus,
  summarizeInterviewNotesAction,
} from "@/features/interviews/actions";
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
import { Card, CardContent } from "@/components/ui/card";
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
  direction: "outbound" | "inbound";
  transport: "imap" | "legacy-webhook" | "provider";
  subject: string;
  body: string;
  toEmail: string;
  fromEmail: string | null;
  status: "queued" | "sent" | "failed";
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
  activity: Array<Omit<CandidateActivityItem, "createdAt"> & { createdAt: string }>;
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
  privacyRequests?: Array<Omit<CandidatePrivacyRequestItem, "createdAt" | "completedAt"> & { createdAt: string; completedAt: string | null }>;
  canFulfilErasure?: boolean;
};

const INTERVIEW_MODE_ICON = {
  video: Video,
  phone: Phone,
  onsite: MapPin,
} as const;

const INTERVIEW_STATUS_META = {
  scheduled: { label: "Scheduled", variant: "neutral" as const },
  completed: { label: "Completed", variant: "secondary" as const },
  canceled: { label: "Canceled", variant: "danger" as const },
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
  strong: { label: "Strong", icon: ThumbsUp, className: "text-primary" },
  mixed: { label: "Mixed", icon: Minus, className: "text-clay" },
  weak: { label: "Weak", icon: ThumbsDown, className: "text-destructive" },
} as const;

const MESSAGE_STATUS_LABEL: Record<CandidateMessage["status"], string> = {
  sent: "Sent",
  queued: "Queued",
  failed: "Failed",
};

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
  const [tab, setTab] = useState("profile");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList
        variant="line"
        className="w-full justify-start gap-3 overflow-x-auto border-b border-border/60 text-sm [&>button]:flex-none [&>button]:px-0.5"
      >
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="interviews">
          Interviews
          <TabCount value={interviews.length} />
        </TabsTrigger>
        <TabsTrigger value="communication">
          Communication
          <TabCount value={messages.length} />
        </TabsTrigger>
        <TabsTrigger value="evaluation">
          Evaluation
          <TabCount value={scorecards.length} />
        </TabsTrigger>
        <TabsTrigger value="offers">
          Offers
          <TabCount value={offers.length} />
        </TabsTrigger>
        <TabsTrigger value="activity">
          Activity
          <TabCount value={activity.length + notes.length} />
        </TabsTrigger>
        {privacyRequests.length > 0 ? (
          <TabsTrigger value="privacy">
            Privacy
            <TabCount value={privacyRequests.length} />
          </TabsTrigger>
        ) : null}
      </TabsList>

      {/* ── Profile , AI match leads, single "Details" panel follows ── */}
      <TabsContent value="profile" className="mt-5 space-y-4">
        <AiScoreCard
          applications={applications.map((application) => ({
            id: application.id,
            jobTitle: application.jobTitle,
          }))}
          evaluations={aiEvaluations}
          aiConfigured={aiConfigured}
          variant="condensed"
          onViewDetailsAction={() => setTab("evaluation")}
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
      <TabsContent value="interviews" className="mt-4 space-y-3">
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
          <EmptyTab
            icon={CalendarClock}
            text="No interviews scheduled yet."
          />
        ) : (
          interviews.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              candidateId={candidateId}
              workspaceId={workspaceId}
              members={scheduleMembers}
              currentUserId={currentUserId}
              aiConfigured={aiConfigured}
            />
          ))
        )}
      </TabsContent>

      {/* ── Activity (merged History + Comments) ── */}
      <TabsContent value="activity" className="mt-4 space-y-4">
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

      <TabsContent value="privacy" className="mt-4 space-y-3">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <p className="text-sm font-medium">Privacy requests</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the candidate’s applications, communication, notes, and activity before recording a decision.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setTab("activity")}>
            View activity
          </Button>
        </div>
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
      </TabsContent>

      {/* ── Communication ── */}
      <TabsContent value="communication" className="mt-4 space-y-3">
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
          messages.map((message) => (
            <Card
              key={message.id}
              className={cn(
                message.direction === "inbound" && "border-l-4 border-l-slate-info",
              )}
            >
              <CardContent className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {message.direction === "inbound" ? (
                      <Badge variant="secondary" className="gap-1">
                        <ArrowDownLeft className="size-3" />
                        Reply
                      </Badge>
                    ) : null}
                    <p className="font-medium">{message.subject}</p>
                  </div>
                  <Badge variant={message.status === "failed" ? "danger" : "neutral"}>
                    {MESSAGE_STATUS_LABEL[message.status]}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {message.body}
                </p>
                <p className="text-xs text-muted-foreground">
                  {message.direction === "inbound"
                    ? `From ${message.fromEmail ?? "candidate"}`
                    : `To ${message.toEmail}`}
                  {message.authorName ? ` · ${message.authorName}` : ""} ·{" "}
                  <RelativeTime value={message.createdAt} />
                </p>
                {message.attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {message.attachments.map((attachment, index) => (
                      <a
                        key={`${attachment.storageKey}-${index}`}
                        href={`/api/inbound-email/attachments/${message.id}/${index}`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Paperclip className="size-3" />
                        {attachment.filename}
                      </a>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>

      {/* ── Evaluation: AI score + scorecards ── */}
      <TabsContent value="evaluation" className="mt-4 space-y-4">
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
          <EvaluationDrawer
            candidateId={candidateId}
            workspaceId={workspaceId}
            stageName={stageName}
            trigger={
              <Button size="sm">
                <ClipboardCheck className="size-4" />
                Add evaluation
              </Button>
            }
          />
        </div>
        {scorecards.map((scorecard) => {
          const meta = RATING_META[scorecard.rating];
          return (
            <Card key={scorecard.id}>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("flex items-center gap-1.5 text-sm font-semibold", meta.className)}>
                    <meta.icon className="size-4" strokeWidth={2} />
                    {meta.label}
                  </span>
                  {scorecard.stageName ? (
                    <Badge variant="neutral">{scorecard.stageName}</Badge>
                  ) : null}
                </div>
                {scorecard.comment ? (
                  <p className="whitespace-pre-line text-sm">{scorecard.comment}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {scorecard.authorName ?? "Someone"} · <RelativeTime value={scorecard.createdAt} />
                </p>
              </CardContent>
            </Card>
          );
        })}
      </TabsContent>

      {/* ── Offers ── */}
      <TabsContent value="offers" className="mt-4">
        <OffersPanel
          offers={offers}
          applications={applications.map((application) => ({
            id: application.id,
            jobTitle: application.jobTitle,
          }))}
        />
      </TabsContent>

    </Tabs>
  );
}

type PrivacyRequest = NonNullable<CandidateProfileTabsProps["privacyRequests"]>[number];

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
      toast.success(decision === "approve" ? "Request approved for fulfilment." : "Request denied.");
      router.refresh();
    });
  }

  function fulfilErasure() {
    startTransition(async () => {
      const result = await fulfilDsarErasureAction({ requestId: request.id, candidateId });
      if (!result.ok) {
        toast.error(result.error ?? "Could not fulfil the erasure request.");
        return;
      }
      toast.success("Candidate data erased and request fulfilled.");
      router.replace("/dashboard/candidates");
    });
  }

  const statusLabel = request.status === "processing"
    ? "In progress"
    : request.status[0].toUpperCase() + request.status.slice(1);

  const statusBadge = {
    pending: "warning",
    processing: "info",
    completed: "success",
    denied: "danger",
  }[request.status] as "warning" | "info" | "success" | "danger";

  const dueDate = new Date(new Date(request.createdAt).getTime() + DSAR_DUE_DAYS * 86_400_000);
  const isOpen = request.status === "pending" || request.status === "processing";
  const isErasure = request.type === "erasure";
  const scoped = INVENTORY_ROWS.filter((row) => inventory[row.key] > 0);
  const emailConfirmed = confirmEmail.trim().toLowerCase() === candidateEmail.trim().toLowerCase();

  const source = request.requestedBy ? "candidate portal" : null;

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-5 py-5">
        {/* Heading , title + status on one line, timing floated right */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-medium">
              {isErasure ? "Erasure request" : "Data export request"}
            </h3>
            <Badge variant={statusBadge}>
              {statusLabel}
            </Badge>
          </div>
          <span className="shrink-0 text-[13px] text-muted-foreground">
            <RelativeTime value={request.createdAt} />
          </span>
        </div>

        {/* One-line context , who, how, deadline */}
        <p className="text-sm text-muted-foreground">
          Requested by{" "}
          <span className="text-foreground">{request.requestedBy ?? "the candidate"}</span>
          {source ? ` via ${source}` : ""}
          {isOpen ? (
            <> · respond by <ShortDate value={dueDate} /></>
          ) : null}
          {request.processedBy ? <> · reviewed by {request.processedBy}</> : null}
        </p>

        {/* Data in scope , scannable number grid, not a label-value list */}
        {isErasure ? (
          <div className="rounded-xl bg-muted/40 p-5">
            <p className="text-[13px] text-muted-foreground">
              {scoped.length > 0
                ? "Approving permanently destroys the following"
                : "No linked records — only the candidate profile remains"}
            </p>
            {scoped.length > 0 ? (
              <dl className="mt-4 grid grid-cols-[repeat(3,auto)] justify-start gap-x-12 gap-y-5">
                {scoped.map((row) => (
                  <div key={row.key}>
                    <dd className="text-xl font-medium tabular-nums leading-none">
                      {inventory[row.key]}
                    </dd>
                    <dt className="mt-1.5 text-[13px] text-muted-foreground">{row.label}</dt>
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
                    <DialogDescription>This records the decision and its review note in the audit log.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline" disabled={isPending}>Cancel</Button></DialogClose>
                    <DialogClose asChild><Button variant="destructive" disabled={isPending} onClick={() => review("deny")}>Deny request</Button></DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={isPending}>Approve</Button>
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
                    <DialogClose asChild><Button variant="outline" disabled={isPending}>Cancel</Button></DialogClose>
                    <DialogClose asChild><Button disabled={isPending} onClick={() => review("approve")}>Approve request</Button></DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : null}

        {/* Fulfilment , processing erasure: irreversible confirm */}
        {request.status === "processing" && isErasure ? (
          canFulfilErasure ? (
            <Dialog onOpenChange={(open) => { if (!open) setConfirmEmail(""); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={isPending}>
                  Erase candidate data
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Permanently erase candidate data?</DialogTitle>
                  <DialogDescription>
                    This fulfils the approved request. The candidate profile and every linked record above are permanently removed, then you return to Candidates.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <label htmlFor={`erase-confirm-${request.id}`} className="text-sm text-muted-foreground">
                    Type <span className="font-medium text-foreground">{candidateEmail}</span> to confirm.
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
                  <DialogClose asChild><Button variant="outline" disabled={isPending}>Cancel</Button></DialogClose>
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
              Approved and awaiting fulfilment — a role with candidate deletion access must complete the erasure.
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
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
      toast.success(status === "completed" ? "Marked complete" : "Interview canceled");
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  return (
    <Card className={cn(isPast && "opacity-80")}>
      <CardContent className="space-y-3">
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
                  <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-foreground">
                    <Pencil className="size-4" />
                  </Button>
                }
              />
            ) : null}
            <Badge variant={statusMeta.variant}>
              {statusMeta.label}
            </Badge>
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
            <MapPin className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
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
            <span className="text-sm font-medium">{interview.interviewerName}</span>
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
                        This will mark the interview with {interview.interviewerName ?? "the interviewer"} as completed.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" disabled={isPending}>Cancel</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button disabled={isPending} onClick={() => update("completed")}>
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
                        The candidate will be notified. This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" disabled={isPending}>Go back</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button variant="destructive" disabled={isPending} onClick={() => update("canceled")}>
                          {isPending ? "Canceling…" : "Yes, cancel interview"}
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            ) : null}
            {interview.gcalEventId ? (
              <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
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
                stageName={interview.title ?? interviewTypeLabel(interview.type)}
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
      </CardContent>
    </Card>
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
    <Sheet open={open} onOpenChange={setOpen} mobilePresentation="bottom-on-mobile">
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
              <p className="mb-1.5 font-medium text-foreground">Candidate summary</p>
              <p className="text-muted-foreground leading-relaxed">{brief.candidateSummary}</p>
            </div>

            {brief.keyAreasToProbe.length > 0 ? (
              <div>
                <p className="mb-1.5 font-medium text-foreground">Key areas to probe</p>
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
                <p className="mb-1.5 font-medium text-foreground">Suggested questions</p>
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
                  <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} />
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
              Generate a brief to get candidate context, suggested questions, and areas to probe.
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
    <Sheet open={open} onOpenChange={setOpen} mobilePresentation="bottom-on-mobile">
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
                <p className="text-muted-foreground leading-relaxed">{summary.executiveSummary}</p>
              </div>

              {summary.positiveSignals.length > 0 ? (
                <div>
                  <p className="mb-1.5 font-medium text-foreground">Positive signals</p>
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
                <p className="font-medium text-foreground">Suggested decision</p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    DECISION_META[summary.suggestedDecision]?.className,
                  )}
                >
                  {DECISION_META[summary.suggestedDecision]?.label ?? summary.suggestedDecision}
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
function EmptyTab({ icon: Icon, text }: { icon: typeof MessageSquare; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
