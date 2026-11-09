"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  ExternalLink,
  FileText,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
  Video,
  X,
} from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

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
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EditInterviewDialog } from "@/features/candidates/EditInterviewDialog";
import { EvaluationDrawer } from "@/features/candidates/EvaluationDrawer";
import type { ScheduleMemberOption } from "@/features/candidates/ScheduleDialog";
import { setInterviewStatus } from "@/features/interviews/actions";
import { unshownEmailWarning } from "@/lib/email/delivery-warning";

import { retryInterviewSyncAction } from "@/features/interviews/sync-actions";
import {
  interviewModeLabel,
  interviewTypeLabel,
  type CandidateInterviewItem,
} from "@/features/interviews/shared";
import { cn } from "@/lib/utils";

import { InterviewBriefSheet } from "./InterviewBriefSheet";
import { SummarizeNotesSheet } from "./SummarizeNotesSheet";

const INTERVIEW_MODE_ICON = {
  video: Video,
  phone: Phone,
  onsite: MapPin,
} as const;

const INTERVIEW_STATUS_META = {
  scheduled: {
    labelKey: "scheduled",
    variant: "neutral" as const,
    accent: "bg-slate-info",
  },
  completed: {
    labelKey: "completed",
    variant: "secondary" as const,
    accent: "bg-lime",
  },
  canceled: {
    labelKey: "canceled",
    variant: "danger" as const,
    accent: "bg-destructive",
  },
};

function providerLabelFor(provider: string) {
  if (provider === "google_calendar") return "Google Calendar";
  if (provider === "microsoft_teams") return "Microsoft Teams";
  if (provider === "jitsi") return "Jitsi";
  return "Zoom";
}

export function InterviewCard({
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
  const t = useTranslations("features.candidates.interviewCard");
  const ilt = useTranslations("labels.interviews");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const interviewDateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
        toast.error(result.error ?? t("updateError"));
        return;
      }
      toast.success(
        status === "completed" ? t("markedComplete") : t("interviewCanceled"),
      );
      if (result.warning) toast.warning(result.warning);
      const emailNote = unshownEmailWarning(result);
      if (emailNote) toast.warning(emailNote);
      (router as { refresh?: () => void }).refresh?.();
    });
  }

  function retrySync(syncId: string) {
    startTransition(async () => {
      const result = await retryInterviewSyncAction({ syncId });
      if (!result.success) {
        toast.error(result.error ?? t("retrySyncError"));
        return;
      }
      toast.success(t("syncRetried"));
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
        className={cn("absolute inset-y-0 left-0 w-1", statusMeta.accent)}
      />
      <div className="space-y-3 p-6 pl-7">
        {/* Title row: title left, status + edit right */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">
              {interview.title ?? interviewTypeLabel(interview.type, ilt)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {interviewDateFmt.format(new Date(interview.scheduledAt))} ·{" "}
              {interview.durationMins} min
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
                    aria-label={t("editInterview")}
                    className="size-8 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </Button>
                }
              />
            ) : null}
            <Badge variant={statusMeta.variant}>{t(statusMeta.labelKey)}</Badge>
          </div>
        </div>

        {/* Mode pill */}
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <ModeIcon className="size-3.5" strokeWidth={1.8} />
          {interviewModeLabel(interview.mode, ilt)}
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

        {/* Meet link, one button, provider decides the wording */}
        {interview.meetLink ? (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <a href={interview.meetLink} target="_blank" rel="noopener noreferrer">
              <Video className="size-4" />
              {t(interview.teamsMeetingId ? "joinTeams" : interview.zoomMeetingId ? "joinZoom" : "joinGoogleMeet")}
            </a>
          </Button>
        ) : null}

        {/* Provider sync recovery */}
        {interview.syncs?.map((sync) => {
          if (sync.status === "synced" || sync.status === "canceled") return null;
          const providerLabel = providerLabelFor(sync.provider);
          const pending = sync.status === "pending";
          return (
            <div
              key={sync.id}
              className="flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/20"
            >
              <AlertTriangle className="size-4 shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">
                {pending
                  ? t("syncPending", { provider: providerLabel })
                  : t("syncFailed", { provider: providerLabel, error: sync.lastError ? `: ${sync.lastError}` : "." })}
              </span>
              {!pending ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => retrySync(sync.id)}
                >
                  <RotateCcw className="size-3.5" />
                  {t("retry")}
                </Button>
              ) : null}
            </div>
          );
        })}

        {/* Notes */}
        {interview.notes ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <FileText className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
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
                      {t("markComplete")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("confirmCompleteTitle")}</DialogTitle>
                      <DialogDescription>
                        {t("confirmCompleteDescription", { interviewer: interview.interviewerName ?? t("theInterviewer") })}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" disabled={isPending}>
                          {t("cancel")}
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          disabled={isPending}
                          onClick={() => update("completed")}
                        >
                          {isPending ? t("saving") : t("confirm")}
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
                      {t("cancel")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("confirmCancelTitle")}</DialogTitle>
                      <DialogDescription>
                        {t("confirmCancelDescription")}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" disabled={isPending}>
                          {t("goBack")}
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          variant="destructive"
                          disabled={isPending}
                          onClick={() => update("canceled")}
                        >
                          {isPending ? t("canceling") : t("confirmCancel")}
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
                {t("notSynced")}
              </span>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              {aiConfigured ? (
                <>
                  <InterviewBriefSheet
                    interview={interview}
                    trigger={
                      <AiButton size="sm" variant="outline">
                        {t("interviewBrief")}
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
                          {t("summarizeNotes")}
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
                stageName={interview.title ?? interviewTypeLabel(interview.type, ilt)}
                trigger={
                  <Button size="sm" variant="outline">
                    <ClipboardCheck className="size-4" />
                    {t("evaluate")}
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
