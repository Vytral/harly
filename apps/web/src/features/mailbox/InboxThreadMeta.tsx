"use client";

import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import type { InboxThread } from "@/features/mailbox/data";
import { isApplicationOutcome, outcomeLabel, outcomeTone } from "@/lib/stage-visuals";

const TONE_TO_PILL: Record<string, StatusPillTone> = {
  neutral: "neutral",
  progress: "info",
  success: "success",
  danger: "danger",
  quiet: "neutral",
};

/**
 * Pipeline stage for a linked application. A terminal outcome (hired, rejected)
 * wins; otherwise the stage's own display name is shown with no meaning read
 * from it. Null when the thread has no application.
 */
export function threadStage(thread: InboxThread): { label: string; tone: StatusPillTone } | null {
  if (!thread.applicationId) return null;
  const outcome = isApplicationOutcome(thread.applicationStatus) ? thread.applicationStatus : "active";
  if (outcome !== "active") return { label: outcomeLabel(outcome), tone: TONE_TO_PILL[outcomeTone(outcome)] ?? "neutral" };
  return { label: thread.applicationStageName || outcomeLabel("active"), tone: "info" };
}

/** Job + stage chips shared by the list row, the reader header and the context panel. */
export function ThreadChips({ thread, size = "sm" }: { thread: InboxThread; size?: "sm" | "md" }) {
  const stage = threadStage(thread);
  if (!thread.jobTitle && !stage) return null;
  return (
    <>
      {thread.jobTitle ? (
        <span className="max-w-[11rem] truncate rounded-full bg-card-inset px-2 py-0.5 text-[11px] font-medium text-soft-ink" title={thread.jobTitle}>
          {thread.jobTitle}
        </span>
      ) : null}
      {stage ? (
        <StatusPill tone={stage.tone} size={size} className="max-w-[10rem] truncate">
          {stage.label}
        </StatusPill>
      ) : null}
    </>
  );
}
