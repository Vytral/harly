import { Icon } from "@iconify/react";

/**
 * Mapa de tipos de notificación → iconos de distintas librerías.
 * Cada tipo tiene su propio color para máxima distinción visual.
 */
export const NOTIFICATION_TYPE_CONFIG: Record<
  string,
  { icon: string; color: string; bg: string }
> = {
  // Applications
  "application.created": {
    icon: "solar:user-plus-bold",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/50",
  },
  "application.stage_changed": {
    icon: "solar:sort-square-horizontal-bold",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/50",
  },
  "application.hired": {
    icon: "solar:check-circle-bold",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
  },
  "application.rejected": {
    icon: "solar:close-circle-bold",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/50",
  },

  // Candidates
  "candidate.created": {
    icon: "solar:user-bold",
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-950/50",
  },
  "candidate.updated": {
    icon: "solar:pen-bold",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/50",
  },

  // Notes & Mentions
  "note.mentioned": {
    icon: "solar:at-bold",
    color: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-50 dark:bg-pink-950/50",
  },

  // Interviews
  "interview.scheduled": {
    icon: "solar:calendar-date-bold",
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/50",
  },
  "interview.canceled": {
    icon: "solar:calendar-mark-minimalistic-bold",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/50",
  },
  "interview.completed": {
    icon: "solar:calendar-check-read-bold",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
  },
  "interview.rescheduled": {
    icon: "solar:calendar-restart-bold",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/50",
  },

  // Jobs
  "job.published": {
    icon: "solar:briefcase-bold",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/50",
  },

  // Tasks
  "task.assigned": {
    icon: "solar:clipboard-check-bold",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-950/50",
  },

  // Offers
  "offer.sent": {
    icon: "solar:document-send-bold",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/50",
  },
  "offer.accepted": {
    icon: "solar:document-check-bold",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
  },
  "offer.declined": {
    icon: "solar:document-close-bold",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/50",
  },
  "offer.withdrawn": {
    icon: "solar:document-delete-bold",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/50",
  },
};

const DEFAULT_CONFIG = {
  icon: "solar:bell-bold",
  color: "text-muted-foreground",
  bg: "bg-muted",
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
