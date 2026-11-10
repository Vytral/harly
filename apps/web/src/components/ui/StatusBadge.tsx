import type { ApplicationOutcome } from "@harly/db/stage-kind";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  isApplicationOutcome,
  outcomeLabel,
  type StageTone,
} from "@/lib/stage-visuals";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const toneVariant: Record<StageTone, BadgeVariant> = {
  neutral: "secondary",
  progress: "info",
  success: "success",
  danger: "danger",
  quiet: "neutral",
};

const applicationStatusVariant: Record<ApplicationOutcome, BadgeVariant> = {
  active: "success",
  hired: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

const jobStatusMap: Record<string, { variant: BadgeVariant; labelKey: "draft" | "open" | "closed" }> = {
  draft: { variant: "neutral", labelKey: "draft" },
  open: { variant: "success", labelKey: "open" },
  closed: { variant: "warning", labelKey: "closed" },
};

/** Badge variant for a tone; shared so every stage or outcome badge agrees. */
export function toneBadgeVariant(tone: StageTone): BadgeVariant {
  return toneVariant[tone];
}

export function ApplicationStatusBadge({ status }: { status: string }) {
  if (!isApplicationOutcome(status)) {
    return <Badge variant="neutral">{status}</Badge>;
  }
  return (
    <Badge variant={applicationStatusVariant[status]}>{outcomeLabel(status)}</Badge>
  );
}

export function JobStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const t = useTranslations("ui.statusBadge");
  const entry = jobStatusMap[status];
  return (
    <Badge variant={entry?.variant ?? "neutral"} className={className}>
      {entry ? t(entry.labelKey) : status}
    </Badge>
  );
}
