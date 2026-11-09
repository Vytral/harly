import { formatInterviewWhen } from "@/lib/email/interview-time";

/**
 * Presentation rules for the delivery log. Pure: reads the stored payload and
 * returns short, human text. Never returns the raw payload.
 */

export const OUTBOX_FILTERS = ["all", "failed", "pending", "sent"] as const;
export type OutboxFilter = (typeof OUTBOX_FILTERS)[number];

/** Translator bound to the `labels.emailOutbox` namespace. */
export type OutboxTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

/** Stable kind ids mapped to their message keys under `labels.emailOutbox.kinds`. */
const KIND_KEYS: Record<string, string> = {
  "pipeline.stage": "pipelineStage",
  "pipeline.rejected": "pipelineRejected",
  "interview.scheduled": "interviewScheduled",
  "interview.rescheduled": "interviewRescheduled",
  "interview.canceled": "interviewCanceled",
  "offer.extended": "offerExtended",
  "offer.withdrawn": "offerWithdrawn",
  "application.received.candidate": "applicationReceivedCandidate",
  "application.received.recruiter": "applicationReceivedRecruiter",
  "native.signature.invitation": "nativeSignatureInvitation",
  "native.signature.otp": "nativeSignatureOtp",
  "report.scheduled": "reportScheduled",
  "automation.email": "automationEmail",
};

function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Recipient address for the log. Visible only to users who can open email settings. */
export function recipientOf(payload: Record<string, unknown>): string | null {
  return (
    text(payload, "candidateEmail") ??
    text(payload, "recipientEmail") ??
    text(payload, "to") ??
    text(payload, "ownerEmail")
  );
}

/** One line describing what the email is about. */
export function summaryOf(
  kind: string,
  payload: Record<string, unknown>,
  t: OutboxTranslator,
  locale = "en-US",
): string {
  const job = text(payload, "jobTitle");
  switch (kind) {
    case "pipeline.stage": {
      const stage = text(payload, "stageName");
      return t("summary.stageMoved", {
        job: job ?? t("summary.applicationFallback"),
        stage: stage ?? t("summary.stageFallback"),
      });
    }
    case "pipeline.rejected":
      return t("summary.notMovingForward", { job: job ?? t("summary.applicationFallback") });
    case "interview.scheduled":
    case "interview.rescheduled":
    case "interview.canceled": {
      const scheduledAt = text(payload, "scheduledAt");
      const when = scheduledAt && !Number.isNaN(new Date(scheduledAt).getTime())
        ? formatInterviewWhen(new Date(scheduledAt), text(payload, "timeZone"), locale)
        : null;
      const jobName = job ?? t("summary.interviewFallback");
      return when ? t("summary.interviewWithTime", { job: jobName, when }) : jobName;
    }
    case "offer.extended":
      return t("summary.offerFor", { job: job ?? t("summary.roleFallback") });
    case "offer.withdrawn":
      return t("summary.offerWithdrawn", { job: job ?? t("summary.roleFallback") });
    case "application.received.candidate":
    case "application.received.recruiter":
      return t("summary.applicationFor", { job: job ?? t("summary.roleFallback") });
    case "report.scheduled":
      return text(payload, "subject") ?? t("kinds.reportScheduled");
    case "automation.email":
      return text(payload, "subject") ?? t("kinds.automationEmail");
    case "native.signature.invitation":
      return text(payload, "documentName") ?? t("summary.documentFallback");
    case "native.signature.otp":
      return t("summary.signingCode");
    default:
      return kindLabelOf(kind, t);
  }
}

export function kindLabelOf(kind: string, t: OutboxTranslator): string {
  const key = KIND_KEYS[kind];
  return key ? t(`kinds.${key}`) : kind;
}

/** Maps a filter to the stored statuses it shows. */
export function statusesForFilter(filter: OutboxFilter): string[] | null {
  switch (filter) {
    case "failed":
      return ["failed"];
    case "pending":
      return ["pending", "processing"];
    case "sent":
      return ["sent"];
    case "all":
      return null;
  }
}

/**
 * A retry or cancel is allowed only while the provider has not accepted the
 * email. Accepted rows can never be re-sent from the log.
 */
export function canRetryOrCancel(row: {
  status: string;
  providerMessageId: string | null;
  sentAt: Date | null;
}): boolean {
  return (
    (row.status === "failed" || row.status === "pending") &&
    !row.providerMessageId &&
    !row.sentAt
  );
}
