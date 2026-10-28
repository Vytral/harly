import { Download, Trash2 } from "lucide-react";

import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";

/**
 * Single source of truth for DSAR (Data Subject Access Request) status and
 * type presentation. Reused by the candidate-profile privacy card, the
 * workspace-wide DSAR inbox, and the candidate portal — those three used to
 * each hand-roll their own status colors independently.
 */
export type DsarStatus =
  | "pending"
  | "processing"
  | "blocked"
  | "completed"
  | "denied";
export type DsarType = "export" | "erasure";

export const DSAR_STATUS_META: Record<
  DsarStatus,
  { label: string; tone: StatusPillTone; accentClassName: string }
> = {
  pending: {
    label: "Pending",
    tone: "warning",
    accentClassName: "bg-clay",
  },
  processing: {
    label: "In progress",
    tone: "info",
    accentClassName: "bg-slate-info",
  },
  blocked: {
    label: "Blocked by legal hold",
    tone: "warning",
    accentClassName: "bg-clay",
  },
  completed: {
    label: "Completed",
    tone: "success",
    accentClassName: "bg-lime",
  },
  denied: {
    label: "Denied",
    tone: "danger",
    accentClassName: "bg-destructive",
  },
};

export const DSAR_TYPE_META: Record<
  DsarType,
  { label: string; icon: typeof Download; className: string }
> = {
  export: {
    label: "Data export request",
    icon: Download,
    className: "bg-slate-info/10 text-slate-info",
  },
  erasure: {
    label: "Erasure request",
    icon: Trash2,
    className: "bg-destructive/10 text-destructive",
  },
};

export function DsarStatusBadge({
  status,
  className,
}: {
  status: DsarStatus;
  className?: string;
}) {
  const meta = DSAR_STATUS_META[status];
  return (
    <StatusPill tone={meta.tone} className={className}>
      {meta.label}
    </StatusPill>
  );
}

export function isOpenDsarStatus(status: DsarStatus) {
  return (
    status === "pending" || status === "processing" || status === "blocked"
  );
}
