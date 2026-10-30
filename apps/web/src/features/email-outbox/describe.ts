import { formatInterviewWhen } from "@/lib/email/interview-time";

/**
 * Presentation rules for the delivery log. Pure: reads the stored payload and
 * returns short, human text. Never returns the raw payload.
 */

export const OUTBOX_FILTERS = ["all", "failed", "pending", "sent"] as const;
export type OutboxFilter = (typeof OUTBOX_FILTERS)[number];

export const KIND_LABELS: Record<string, string> = {
  "pipeline.stage": "Stage update",
  "pipeline.rejected": "Rejection",
  "interview.scheduled": "Interview invitation",
  "interview.rescheduled": "Interview rescheduled",
  "interview.canceled": "Interview canceled",
  "offer.extended": "Offer",
  "offer.withdrawn": "Offer withdrawn",
  "application.received.candidate": "Application confirmation",
  "application.received.recruiter": "Recruiter notification",
  "native.signature.invitation": "Signature request",
  "native.signature.otp": "Signature code",
  "report.scheduled": "Scheduled report",
  "automation.email": "Automation email",
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
export function summaryOf(kind: string, payload: Record<string, unknown>): string {
  const job = text(payload, "jobTitle");
  switch (kind) {
    case "pipeline.stage": {
      const stage = text(payload, "stageName");
      return `${job ?? "Application"} — moved to ${stage ?? "a new stage"}`;
    }
    case "pipeline.rejected":
      return `${job ?? "Application"} — not moving forward`;
    case "interview.scheduled":
    case "interview.rescheduled":
    case "interview.canceled": {
      const scheduledAt = text(payload, "scheduledAt");
      const when = scheduledAt && !Number.isNaN(new Date(scheduledAt).getTime())
        ? formatInterviewWhen(new Date(scheduledAt), text(payload, "timeZone"))
        : null;
      return `${job ?? "Interview"}${when ? ` — ${when}` : ""}`;
    }
    case "offer.extended":
      return `Offer for ${job ?? "the role"}`;
    case "offer.withdrawn":
      return `Offer withdrawn for ${job ?? "the role"}`;
    case "application.received.candidate":
    case "application.received.recruiter":
      return `Application for ${job ?? "the role"}`;
    case "report.scheduled":
      return text(payload, "subject") ?? "Scheduled report";
    case "automation.email":
      return text(payload, "subject") ?? "Automation email";
    case "native.signature.invitation":
      return text(payload, "documentName") ?? "Document to sign";
    case "native.signature.otp":
      return "One-time signing code";
    default:
      return KIND_LABELS[kind] ?? kind;
  }
}

export function kindLabelOf(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
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
