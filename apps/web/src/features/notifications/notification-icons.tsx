import { Icon } from "@iconify/react";

/**
 * Mapa de tipos de notificación → iconos de distintas librerías.
 *
 * Colours come from semantic tones, not raw palette classes, so every type
 * keeps its light and dark values from globals.css. Types that share a meaning
 * share a tone: a hire and an accepted offer are both `success`, a cancelled
 * interview and a rejection are both `danger`.
 */
type NotificationTone = "info" | "success" | "warning" | "danger" | "accent" | "neutral";

const TONE_CLASSES: Record<NotificationTone, { color: string; bg: string }> = {
  info: { color: "text-status-quiet-ink", bg: "bg-status-quiet" },
  success: { color: "text-success", bg: "bg-success/10" },
  warning: { color: "text-warning", bg: "bg-warning/10" },
  danger: { color: "text-destructive", bg: "bg-destructive/10" },
  accent: { color: "text-accent-foreground", bg: "bg-accent" },
  neutral: { color: "text-muted-foreground", bg: "bg-muted" },
};

export const NOTIFICATION_TYPE_CONFIG: Record<
  string,
  { icon: string; color: string; bg: string }
> = {
  // Applications
  "application.created": { icon: "solar:user-plus-bold", ...TONE_CLASSES.info },
  "application.stage_changed": { icon: "solar:sort-square-horizontal-bold", ...TONE_CLASSES.accent },
  "application.hired": { icon: "solar:check-circle-bold", ...TONE_CLASSES.success },
  "application.rejected": { icon: "solar:close-circle-bold", ...TONE_CLASSES.danger },

  // Candidates
  "candidate.created": { icon: "solar:user-bold", ...TONE_CLASSES.info },
  "candidate.updated": { icon: "solar:pen-bold", ...TONE_CLASSES.warning },

  // Candidate email
  "email.received": { icon: "solar:letter-unread-bold", ...TONE_CLASSES.info },

  // Notes & Mentions
  "note.mentioned": { icon: "solar:at-bold", ...TONE_CLASSES.accent },

  // Interviews
  "interview.scheduled": { icon: "solar:calendar-date-bold", ...TONE_CLASSES.info },
  "interview.canceled": { icon: "solar:calendar-mark-minimalistic-bold", ...TONE_CLASSES.danger },
  "interview.completed": { icon: "solar:calendar-check-read-bold", ...TONE_CLASSES.success },
  "interview.rescheduled": { icon: "solar:calendar-restart-bold", ...TONE_CLASSES.warning },

  // Jobs
  "job.published": { icon: "solar:briefcase-bold", ...TONE_CLASSES.success },

  // Tasks
  "task.assigned": { icon: "solar:clipboard-check-bold", ...TONE_CLASSES.info },

  // Offers
  "offer.sent": { icon: "solar:document-send-bold", ...TONE_CLASSES.info },
  "offer.accepted": { icon: "solar:document-check-bold", ...TONE_CLASSES.success },
  "offer.declined": { icon: "solar:document-close-bold", ...TONE_CLASSES.danger },
  "offer.withdrawn": { icon: "solar:document-delete-bold", ...TONE_CLASSES.warning },
};

const DEFAULT_CONFIG = {
  icon: "solar:bell-bold",
  ...TONE_CLASSES.neutral,
};

export function getNotificationConfig(type: string) {
  return NOTIFICATION_TYPE_CONFIG[type] ?? DEFAULT_CONFIG;
}

export function NotificationTypeIcon({
  type,
  size = 18,
  className,
}: {
  type: string;
  size?: number;
  className?: string;
}) {
  const config = getNotificationConfig(type);
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${config.bg} ${config.color} ${className ?? ""}`}
    >
      <Icon icon={config.icon} width={size} height={size} />
    </span>
  );
}

export function NotificationTypeIconSmall({
  type,
  size = 14,
  className,
}: {
  type: string;
  size?: number;
  className?: string;
}) {
  const config = getNotificationConfig(type);
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-md ${config.bg} ${config.color} ${className ?? ""}`}
    >
      <Icon icon={config.icon} width={size} height={size} />
    </span>
  );
}
