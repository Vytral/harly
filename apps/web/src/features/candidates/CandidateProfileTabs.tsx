"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  Mail,
  MapPin,
  MessageSquare,
  Minus,
  Phone,
  ThumbsDown,
  ThumbsUp,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { CandidateFileUpload } from "@/features/candidates/CandidateFileUpload";
import { EvaluationDrawer } from "@/features/candidates/EvaluationDrawer";
import { NoteForm } from "@/features/candidates/NoteForm";
import { setInterviewStatus } from "@/features/interviews/actions";
import {
  interviewModeLabel,
  interviewTypeLabel,
  type CandidateInterviewItem,
} from "@/features/interviews/shared";
import type {
  CandidateActivityItem,
  CandidateApplicationStatus,
  CandidateNoteItem,
  NoteMention,
} from "@/features/candidates/data";
import { ApplicationStatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelative, formatShort } from "@/lib/date";
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
  stageName: string | null;
  applications: CandidateProfileApplication[];
  notes: CandidateNoteItem[];
  files: CandidateFile[];
  activity: Array<Omit<CandidateActivityItem, "createdAt"> & { createdAt: string }>;
  scorecards: Scorecard[];
  messages: CandidateMessage[];
  interviews: CandidateInterviewItem[];
  members: NoteMention[];
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
  stageName,
  applications,
  notes,
  files,
  activity,
  scorecards,
  messages,
  interviews,
  members,
}: CandidateProfileTabsProps) {
  return (
    <Tabs defaultValue="perfil">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="perfil">Profile</TabsTrigger>
        <TabsTrigger value="entrevistas">
          Interviews
          <TabCount value={interviews.length} />
        </TabsTrigger>
        <TabsTrigger value="historial">History</TabsTrigger>
        <TabsTrigger value="comunicacion">
          Communication
          <TabCount value={messages.length} />
        </TabsTrigger>
        <TabsTrigger value="evaluacion">
          Evaluation
          <TabCount value={scorecards.length} />
        </TabsTrigger>
        <TabsTrigger value="comentarios">
          Comments
          <TabCount value={notes.length} />
        </TabsTrigger>
      </TabsList>

      {/* ── Profile ── */}
      <TabsContent value="perfil" className="mt-4 space-y-4">
        {applications.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No applications yet.
          </p>
        ) : (
          applications.map((application) => (
            <Card key={application.id}>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold">{application.jobTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {application.currentStageName ?? "No stage"} · Applied{" "}
                      {formatShort(application.appliedAt)}
                    </p>
                  </div>
                  <ApplicationStatusBadge status={application.status} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="outline">{application.source ?? "unknown"}</Badge>
                  <Button asChild variant="link" size="sm" className="text-primary">
                    <Link href={`/dashboard/pipeline?job=${application.jobId}` as Route}>
                      View in pipeline
                      <ArrowRight className="size-4" />
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
              </CardContent>
            </Card>
          ))
        )}

        <div>
          <h3 className="mb-3 text-sm font-semibold">Résumé &amp; files</h3>
          <CandidateFileUpload
            candidateId={candidateId}
            workspaceId={workspaceId}
            initialFiles={files}
          />
        </div>
      </TabsContent>

      {/* ── Interviews ── */}
      <TabsContent value="entrevistas" className="mt-4 space-y-3">
        {interviews.length === 0 ? (
          <EmptyTab
            icon={CalendarClock}
            text="No interviews scheduled. Use the Schedule action above."
          />
        ) : (
          interviews.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              candidateId={candidateId}
            />
          ))
        )}
      </TabsContent>

      {/* ── History ── */}
      <TabsContent value="historial" className="mt-4">
        {activity.length === 0 ? (
          <EmptyTab icon={MessageSquare} text="No activity yet." />
        ) : (
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
                    {formatRelative(event.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Communication ── */}
      <TabsContent value="comunicacion" className="mt-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Mail className="size-5" strokeWidth={1.6} />
            </span>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Use the Email action above to message this candidate. Set
              RESEND_API_KEY to deliver; messages are saved here either way.
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
                  {formatRelative(message.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>

      {/* ── Evaluation: real scorecards ── */}
      <TabsContent value="evaluacion" className="mt-4 space-y-4">
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
                  {scorecard.authorName ?? "Someone"} · {formatRelative(scorecard.createdAt)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </TabsContent>

      {/* ── Comments ── */}
      <TabsContent value="comentarios" className="mt-4">
        <NoteForm
          candidateId={candidateId}
          workspaceId={workspaceId}
          initialNotes={notes}
          members={members}
        />
      </TabsContent>
    </Tabs>
  );
}

function InterviewCard({
  interview,
  candidateId,
}: {
  interview: CandidateInterviewItem;
  candidateId: string;
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

        {interview.status === "scheduled" ? (
          <div className="flex items-center gap-2 pt-1">
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
          </div>
        ) : null}
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
