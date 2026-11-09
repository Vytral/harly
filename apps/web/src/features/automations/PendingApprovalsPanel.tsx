"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("features.automations.PendingApprovalsPanel");
  const [approvals, setApprovals] = useState(initialApprovals);
  const activeApprovals = approvals.filter((approval) => approval.status === "pending");
  const expiredApprovals = approvals.filter((approval) => approval.status === "expired");

  if (approvals.length === 0) return null;

  return (
    <section className="mt-6 rounded-[var(--radius-card)] bg-warning-clay/5 p-5 shadow-[var(--shadow-card)]" aria-labelledby="pending-approvals-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClockIcon className="size-4 text-warning-clay" />
            <h2 id="pending-approvals-heading" className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
              {activeApprovals.length > 0 ? t("needsApproval") : t("approvalUpdates")}
            </h2>
            <span className="rounded-full bg-warning-clay/15 px-2 py-0.5 text-[11px] font-semibold text-warning-clay">
              {activeApprovals.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-soft-ink">
            {activeApprovals.length > 0
              ? t("pausedUntilDecision")
              : t("noLongerActionable")}
          </p>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-warning-clay">
          {activeApprovals.length > 0 ? t("actionRequired") : t("expired")}
        </span>
      </div>

      {activeApprovals.length > 0 && (
        <div className="mt-4 divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] bg-pure-snow">
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
        <div className={cn("divide-y divide-hairline overflow-hidden rounded-[var(--radius-inner)] bg-pure-snow", activeApprovals.length > 0 && "mt-3")}>
          {activeApprovals.length > 0 && (
            <div className="bg-card-inset px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-soft-ink">
              {t("expiredRequests")}
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
  const t = useTranslations("features.automations.PendingApprovalsPanel");
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
        toast.success(decision === "approved" ? t("approvalRecorded") : t("workflowRejected"));
      } else {
        toast.error(result.error ?? t("resolveError"));
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
          {approval.candidateName
            ? t.rich("rowMetaWithCandidate", {
                candidate: approval.candidateName,
                trigger: approval.triggerEvent,
                when: (chunks) => (
                  <>
                    {chunks} <RelativeTime value={approval.createdAt} />
                  </>
                ),
              })
            : t.rich("rowMeta", {
                trigger: approval.triggerEvent,
                when: (chunks) => (
                  <>
                    {chunks} <RelativeTime value={approval.createdAt} />
                  </>
                ),
              })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {approval.deadlineAt && (
          <span className={cn("hidden text-[11px] md:inline", expired ? "font-medium text-danger-rust" : "text-soft-ink")}>
            {t.rich(expired ? "expiredDeadline" : "dueDeadline", {
              when: (chunks) => (
                <>
                  {chunks} <RelativeTime value={approval.deadlineAt ?? ""} />
                </>
              ),
            })}
          </span>
        )}
        {!expired && <button
          type="button"
          disabled={pending}
          onClick={() => decide("rejected")}
          className={cn("inline-flex items-center gap-1 rounded-[var(--radius-btn)] bg-danger-rust/10 px-2.5 py-1.5 text-xs font-medium text-danger-rust hover:bg-danger-rust/15 disabled:opacity-50")}
        >
          <XCircleIcon className="size-3.5" /> {t("reject")}
        </button>}
        {!expired && <button
          type="button"
          disabled={pending}
          onClick={() => decide("approved")}
          className="inline-flex items-center gap-1 rounded-[var(--radius-btn)] bg-near-ink px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-near-ink/90 disabled:opacity-50"
        >
          <CheckCircleIcon className="size-3.5" /> {t("approve")}
        </button>}
      </div>
    </div>
  );
}
