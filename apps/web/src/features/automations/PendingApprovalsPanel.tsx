"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@/components/ui/icons/phosphor";
import { RelativeTime } from "@/lib/date-hydration";
import { toast } from "@/lib/notification-island/toast";
import { cn } from "@/lib/utils";

import { resolveRunApprovalAction } from "./actions";
import type { PendingWorkflowApproval } from "./data";

export function PendingApprovalsPanel({
  initialApprovals,
}: {
  initialApprovals: PendingWorkflowApproval[];
}) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const activeApprovals = approvals.filter((approval) => approval.status === "pending");
  const expiredApprovals = approvals.filter((approval) => approval.status === "expired");

  if (approvals.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-warning/30 bg-warning/5 p-5 shadow-xs" aria-labelledby="pending-approvals-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClockIcon className="size-4 text-warning" />
            <h2 id="pending-approvals-heading" className="font-display text-base font-semibold text-near-ink">
              {activeApprovals.length > 0 ? "Needs your approval" : "Approval updates"}
            </h2>
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
              {activeApprovals.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-soft-ink">
            {activeApprovals.length > 0
              ? "These workflows are paused until an eligible teammate makes a decision."
              : "These approval requests are no longer actionable."}
          </p>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-warning">
          {activeApprovals.length > 0 ? "Action required" : "Expired"}
        </span>
      </div>

      {activeApprovals.length > 0 && (
        <div className="mt-4 divide-y divide-warning/20 overflow-hidden rounded-xl border border-warning/20 bg-pure-snow">
          {activeApprovals.map((approval) => (
          <ApprovalRow
            key={`${approval.runId}:${approval.nodeId}`}
            approval={approval}
            onResolved={() => setApprovals((current) => current.filter((item) => item.runId !== approval.runId || item.nodeId !== approval.nodeId))}
          />
          ))}
        </div>
      )}

      {expiredApprovals.length > 0 && (
        <div className={cn("divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-pure-snow", activeApprovals.length > 0 && "mt-3")}>
          {activeApprovals.length > 0 && (
            <div className="bg-kraft/20 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-soft-ink">
              Expired requests
            </div>
          )}
          {expiredApprovals.map((approval) => (
            <ApprovalRow
              key={`${approval.runId}:${approval.nodeId}`}
              approval={approval}
              expired
              onResolved={() => setApprovals((current) => current.filter((item) => item.runId !== approval.runId || item.nodeId !== approval.nodeId))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ApprovalRow({
  approval,
  expired = false,
  onResolved,
}: {
  approval: PendingWorkflowApproval;
  expired?: boolean;
  onResolved: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    if (expired) return;
    startTransition(async () => {
      const result = await resolveRunApprovalAction({
        runId: approval.runId,
        nodeId: approval.nodeId,
        decision,
      });
      if (result.ok) {
        onResolved();
        toast.success(decision === "approved" ? "Approval recorded." : "Workflow rejected.");
      } else {
        toast.error(result.error ?? "Could not resolve this approval.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/dashboard/automations/${approval.workflowId}`} className="truncate text-sm font-semibold text-near-ink hover:underline">
          {approval.workflowName}
        </Link>
        <p className="mt-0.5 text-xs text-soft-ink">
          {approval.candidateName ? `${approval.candidateName} · ` : ""}
          {approval.triggerEvent} · requested <RelativeTime value={approval.createdAt} />
        </p>
      </div>
      <div className="flex items-center gap-2">
        {approval.deadlineAt && (
          <span className={cn("hidden text-[11px] md:inline", expired ? "font-medium text-rust" : "text-soft-ink")}>
            {expired ? "Expired" : "Due"} <RelativeTime value={approval.deadlineAt} />
          </span>
        )}
        {!expired && <button
          type="button"
          disabled={pending}
          onClick={() => decide("rejected")}
          className={cn("inline-flex items-center gap-1 rounded-lg border border-rust/25 px-2.5 py-1.5 text-xs font-medium text-rust hover:bg-rust/10 disabled:opacity-50")}
        >
          <XCircleIcon className="size-3.5" /> Reject
        </button>}
        {!expired && <button
          type="button"
          disabled={pending}
          onClick={() => decide("approved")}
          className="inline-flex items-center gap-1 rounded-lg bg-near-ink px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-near-ink/90 disabled:opacity-50"
        >
          <CheckCircleIcon className="size-3.5" /> Approve
        </button>}
      </div>
    </div>
  );
}
