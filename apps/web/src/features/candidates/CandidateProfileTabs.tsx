"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  Check,
  ClipboardCheck,
  ExternalLink,
  Mail,
  MapPin,
  MessageSquare,
  Minus,
  Phone,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AiScoreCard } from "@/features/candidates/AiScoreCard";
import { CandidateFileUpload } from "@/features/candidates/CandidateFileUpload";
import { EvaluationDrawer } from "@/features/candidates/EvaluationDrawer";
import {
  ScheduleDrawer,
  type ScheduleApplicationOption,
  type ScheduleCalConfig,
  type ScheduleMemberOption,
} from "@/features/candidates/ScheduleDrawer";
import { OffersPanel } from "@/features/offers/OffersPanel";
import type { CandidateOfferItem } from "@/features/offers/shared";
import { NoteForm } from "@/features/candidates/NoteForm";
import { RescheduleDrawer } from "@/features/candidates/RescheduleDrawer";
import { EmailDrawer, type EmailTemplateOption } from "@/features/candidates/EmailDrawer";
import type { TemplateValues } from "@/features/email-templates/interpolate";
import { setInterviewStatus } from "@/features/interviews/actions";
import {
  interviewModeLabel,
  interviewTypeLabel,
  type CandidateInterviewItem,
} from "@/features/interviews/shared";
import type {
  CandidateActivityItem,
  CandidateAiEvaluationItem,
  CandidateApplicationStatus,
  CandidateNoteItem,
  NoteMention,
} from "@/features/candidates/data";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShortDate, RelativeTime } from "@/lib/date-hydration";
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
  subject: string;
  body: string;
  toEmail: string;
  status: "queued" | "sent" | "failed";
  authorName: string | null;
  createdAt: string;
};

type CandidateProfileTabsProps = {
  candidateId: string;
  workspaceId: string;
  candidateEmail: string;
  candidateName: string;
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

const APPLICATION_SOURCE_LABEL: Record<string, string> = {
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
}: CandidateProfileTabsProps) {
  return (
    <Tabs defaultValue="profile">
      <TabsList className="w-full justify-start overflow-x-auto">
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
      </TabsList>

      {/* ── Profile ── */}
      <TabsContent value="profile" className="mt-4 space-y-4">
        {applications.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No applications yet.
          </p>
        ) : (
          <Card className="gap-0 py-0">
            <CardContent className="p-0">
              <div className="border-b px-4 py-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Applications
                </p>
              </div>
              {applications.map((application, idx) => (
                <div
                  key={application.id}
                  className={cn(
                    "space-y-3 px-4 py-2.5",
                    idx < applications.length - 1 && "border-b border-border/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-foreground">{application.jobTitle}</h2>
                        <ApplicationStatusBadge status={application.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-foreground/70">
                        <span className="font-medium">{application.currentStageName ?? "No stage"}</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3" />
                          <ShortDate value={application.appliedAt} />
                        </span>
                        {application.source ? (
                          <span>{APPLICATION_SOURCE_LABEL[application.source] ?? application.source}</span>
                        ) : null}
                      </div>
                    </div>
                    <Button asChild variant="link" size="sm" className="h-auto shrink-0 p-0 text-xs text-primary">
                      <Link href={`/dashboard/pipeline?job=${application.jobId}` as Route}>
                        View in pipeline
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                  {application.answers.length > 0 ? (
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Application answers
                      </p>
                      <dl className="mt-3 space-y-3">
                        {application.answers.map((answer) => (
                          <div key={answer.id}>
                            <dt className="text-xs font-semibold text-muted-foreground">
                              {answer.label}
                            </dt>
                            <dd className="mt-1 whitespace-pre-line text-sm">{answer.answer}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <CandidateFileUpload
          candidateId={candidateId}
          workspaceId={workspaceId}
          initialFiles={files}
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
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Mail className="size-5" strokeWidth={1.6} />
            </span>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Send your first message using the button above.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <Card key={message.id}>
              <CardContent className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{message.subject}</p>
                  <Badge variant={message.status === "failed" ? "danger" : "neutral"}>
                    {MESSAGE_STATUS_LABEL[message.status]}
                  </Badge>
                </div>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {message.body}
                </p>
                <p className="text-xs text-muted-foreground">
                  To {message.toEmail}
                  {message.authorName ? ` · ${message.authorName}` : ""} ·{" "}
                  <RelativeTime value={message.createdAt} />
                </p>
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

function InterviewCard({
  interview,
  candidateId,
  workspaceId,
}: {
  interview: CandidateInterviewItem;
  candidateId: string;
  workspaceId: string;
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
      router.refresh();
    });
  }

  return (
    <Card className={cn(isPast && "opacity-80")}>
      <CardContent className="space-y-2.5">
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
          <Badge variant={statusMeta.variant} className="shrink-0">
            {statusMeta.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
            <ModeIcon className="size-3.5" strokeWidth={1.8} />
            {interviewModeLabel(interview.mode)}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1">
            {interviewTypeLabel(interview.type)}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1">{interview.jobTitle}</span>
          {interview.interviewerName ? (
            <span className="rounded-full bg-muted px-2.5 py-1">
              {interview.interviewerName}
            </span>
          ) : null}
        </div>

        {interview.location ? (
          <p className="truncate text-sm text-foreground/90">{interview.location}</p>
        ) : null}
        {interview.notes ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {interview.notes}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {interview.status === "scheduled" ? (
            <>
              <RescheduleDrawer
                interviewId={interview.id}
                candidateId={candidateId}
                currentScheduledAt={interview.scheduledAt}
                currentDurationMins={interview.durationMins}
                currentLocation={interview.location}
                trigger={
                  <Button size="sm" variant="outline" disabled={isPending}>
                    <CalendarClock className="size-4" />
                    Reschedule
                  </Button>
                }
              />
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => update("completed")}
              >
                <Check className="size-4" />
                Mark complete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={isPending}
                onClick={() => update("canceled")}
              >
                <X className="size-4" />
                Cancel
              </Button>
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
                View in Google Calendar
              </a>
            </Button>
          ) : interview.status === "scheduled" ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-amber-400" />
              Not synced to GCal
            </span>
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
      </CardContent>
    </Card>
  );
}

function EmptyTab({ icon: Icon, text }: { icon: typeof MessageSquare; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
