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

// Labels are translated at render time from `labels.workspaces.dsar`
// (status.<status>, type.<type>) so the maps stay locale-free.
export const DSAR_STATUS_META: Record<
  DsarStatus,
  { tone: StatusPillTone; accentClassName: string }
> = {
  pending: {
    tone: "warning",
    accentClassName: "bg-clay",
  },
  processing: {
    tone: "info",
    accentClassName: "bg-slate-info",
  },
  blocked: {
    tone: "warning",
    accentClassName: "bg-clay",
  },
  completed: {
    tone: "success",
    accentClassName: "bg-lime",
  },
  denied: {
    tone: "danger",
    accentClassName: "bg-destructive",
  },
};

export const DSAR_TYPE_META: Record<
  DsarType,
  { icon: typeof Download; className: string }
> = {
  export: {
    icon: Download,
    className: "bg-slate-info/10 text-slate-info",
  },
  erasure: {
    icon: Trash2,
    className: "bg-destructive/10 text-destructive",
  },
};

export function DsarStatusBadge({
  status,
  label,
  className,
}: {
  status: DsarStatus;
  label: string;
  className?: string;
}) {
  const meta = DSAR_STATUS_META[status];
  return (
    <StatusPill tone={meta.tone} className={className}>
      {label}
    </StatusPill>
  );
}

export function isOpenDsarStatus(status: DsarStatus) {
  return (
    status === "pending" || status === "processing" || status === "blocked"
  );
}
