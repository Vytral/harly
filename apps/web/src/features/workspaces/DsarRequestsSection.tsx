import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { UserAvatar } from "@/components/ui/UserAvatar";
import type { DsarRequestListItem } from "@/features/workspaces/dsar-actions";

const statusStyle = {
  pending: "bg-clay/10 text-clay",
  processing: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  completed: "bg-sage text-sage-ink",
  denied: "bg-destructive/10 text-destructive",
} as const;

function statusLabel(status: DsarRequestListItem["status"]) {
  return status === "processing"
    ? "In progress"
    : status[0].toUpperCase() + status.slice(1);
}

function requestLabel(type: DsarRequestListItem["type"]) {
  return type === "erasure" ? "Erasure request" : "Data export request";
}

export function DsarRequestsSection({
  requests,
}: {
  requests: DsarRequestListItem[];
}) {
  return (
    <section aria-labelledby="dsar-requests-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="dsar-requests-heading" className="font-display text-lg font-semibold tracking-tight">
            Requests
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Open a candidate to review their applications, activity, notes, and request context before deciding.
          </p>
        </div>
        <span className="shrink-0 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {requests.filter((request) => request.status === "pending").length} awaiting review
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed bg-muted/20 px-5 py-8 text-center">
          <p className="text-sm font-medium">No privacy requests yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Candidate export and deletion requests will appear here for review.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border bg-card">
          <div className="divide-y">
            {requests.map((request) => {
              const candidate = request.candidateName ?? request.requestedBy ?? "Deleted candidate";
              const date = new Intl.DateTimeFormat(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date(request.createdAt));
              return (
                <Link
                  key={request.id}
                  href={request.candidateId ? `/dashboard/candidates/${request.candidateId}` : "/settings/legal"}
                  className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <UserAvatar
                    name={candidate}
                    src={request.candidateAvatarUrl}
                    size="sm"
                    className="size-9 shrink-0 text-xs"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{candidate}</p>
                      <span className="text-xs text-muted-foreground">{requestLabel(request.type)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle[request.status]}`}>
                        {statusLabel(request.status)}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {request.candidateEmail ?? request.requestedBy ?? "Candidate details are no longer available"} · Requested {date}
                    </p>
                    {request.notes ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">Review note: {request.notes}</p>
                    ) : null}
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
