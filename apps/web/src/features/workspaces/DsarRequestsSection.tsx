import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { DsarRequestListItem } from "@/features/workspaces/dsar-actions";
import {
  DSAR_TYPE_META,
  DsarStatusBadge,
} from "@/features/workspaces/dsar-shared";

export function DsarRequestsSection({
  requests,
}: {
  requests: DsarRequestListItem[];
}) {
  return (
    <section aria-labelledby="dsar-requests-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="dsar-requests-heading"
            className="font-display text-lg font-semibold tracking-tight"
          >
            Requests
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Open a candidate to review their applications, activity, notes, and
            request context before deciding.
          </p>
        </div>
        <span className="shrink-0 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {requests.filter((request) => request.status === "pending").length}{" "}
          awaiting review
        </span>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          className="mt-5"
          icon={ShieldCheck}
          title="No privacy requests yet"
          description="Candidate export and deletion requests will appear here for review."
        />
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border bg-card">
          <div className="divide-y">
            {requests.map((request) => {
              const candidate =
                request.candidateName ??
                request.requestedBy ??
                "Deleted candidate";
              const typeMeta = DSAR_TYPE_META[request.type];
              const date = new Intl.DateTimeFormat(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date(request.createdAt));
              return (
                <Link
                  key={request.id}
                  href={
                    request.candidateId
                      ? `/dashboard/candidates/${request.candidateId}`
                      : "/settings/legal"
                  }
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
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <typeMeta.icon className="size-3.5" strokeWidth={1.8} />
                        {typeMeta.label}
                      </span>
                      <DsarStatusBadge status={request.status} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {request.candidateEmail ??
                        request.requestedBy ??
                        "Candidate details are no longer available"}{" "}
                      · Requested {date}
                    </p>
                    {request.notes ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        Review note: {request.notes}
                      </p>
                    ) : null}
                    {request.status === "blocked" && request.reviewDueAt ? (
                      <p className="text-xs text-muted-foreground">
                        Legal hold review due{" "}
                        {new Date(request.reviewDueAt).toLocaleDateString()}.
                      </p>
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
