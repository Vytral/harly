import { Badge } from "@/components/ui/badge";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const applicationStatusMap: Record<
  string,
  { variant: BadgeVariant; label: string }
> = {
  active: { variant: "success", label: "Active" },
  hired: { variant: "success", label: "Hired" },
  rejected: { variant: "danger", label: "Rejected" },
  withdrawn: { variant: "neutral", label: "Withdrawn" },
};

const jobStatusMap: Record<string, { variant: BadgeVariant; label: string }> = {
  draft: { variant: "neutral", label: "Draft" },
  open: { variant: "success", label: "Open" },
  closed: { variant: "warning", label: "Closed" },
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  const entry = applicationStatusMap[status] ?? {
    variant: "neutral" as const,
    label: status,
  };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function JobStatusBadge({ status }: { status: string }) {
  const entry = jobStatusMap[status] ?? {
    variant: "neutral" as const,
    label: status,
  };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
