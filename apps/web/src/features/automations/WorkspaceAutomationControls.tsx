"use client";

import { useState } from "react";
import { PauseCircle, PlayCircle, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ShortDate } from "@/lib/date-hydration";
import { toast } from "@/lib/notification-island/toast";
import { cn } from "@/lib/utils";
import { setWorkspaceAutomationEnabledAction } from "./actions";
import type { WorkspaceAutomationPolicySnapshot } from "./data";

/**
 * The workspace-wide automation switch. Quiet while automations run (one row
 * with the limits and a "Pause all" control), loud while they're paused. The
 * audit reason is asked for in the confirm step, not kept on screen.
 */
export function WorkspaceAutomationControls({
  initialPolicy,
  pausedByName,
}: {
  initialPolicy: WorkspaceAutomationPolicySnapshot;
  /** Display name of whoever paused, resolved on the server. */
  pausedByName: string | null;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pausedBy, setPausedBy] = useState(pausedByName);
  const enabled = policy.enabled;

  async function confirmChange() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Add a short reason so the team knows why.");
      throw new Error("reason required");
    }
    const result = await setWorkspaceAutomationEnabledAction({ enabled: !enabled, reason: trimmed });
    if (!result.ok || !result.policy) {
      toast.error(result.error ?? "Could not update workspace automations.");
      throw new Error(result.error ?? "update failed");
    }
    setPolicy(result.policy);
    setPausedBy(enabled ? "you" : null);
    setReason("");
    toast.success(enabled ? "All automations paused." : "Automations resumed.");
  }

  const limits = `Up to ${policy.maxRunsPerMinute} runs and ${policy.maxExternalActionsPerMinute} external actions per minute, ${policy.maxConcurrentRuns} at a time.`;

  return (
    <>
      <section
        aria-labelledby="workspace-automation-policy-title"
        className={cn(
          "mb-6 flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--radius-card)] px-5 py-4",
          enabled ? "bg-card shadow-[var(--shadow-card)]" : "border border-warning-clay/30 bg-warning-clay/10",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            enabled ? "bg-lime-wash text-near-ink" : "bg-warning-clay/15 text-warning-clay",
          )}
        >
          {enabled ? <Zap className="size-4" /> : <PauseCircle className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="workspace-automation-policy-title"
            role="status"
            aria-live="polite"
            className="text-[14px] font-semibold text-near-ink"
          >
            {enabled ? "Automations are running" : "All automations are paused"}
          </h2>
          <p className="mt-0.5 text-[13px] leading-5 text-soft-ink">
            {enabled ? (
              limits
            ) : (
              <>
                No workflow runs until someone resumes them
                {policy.pausedAt ? (
                  <>
                    {" "}
                    · paused <ShortDate value={policy.pausedAt} />
                  </>
                ) : null}
                {pausedBy ? ` by ${pausedBy}` : ""}
                {policy.pauseReason ? `: “${policy.pauseReason}”` : "."}
              </>
            )}
          </p>
        </div>
        <Button size="sm" variant={enabled ? "ghost" : "default"} onClick={() => setOpen(true)}>
          {enabled ? <PauseCircle /> : <PlayCircle />}
          {enabled ? "Pause all" : "Resume automations"}
        </Button>
      </section>

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setReason("");
        }}
        tone={enabled ? "warning" : "default"}
        title={enabled ? "Pause every automation in this workspace?" : "Resume automations?"}
        description={
          enabled
            ? "Running workflows stop at their next step and no new runs start until someone resumes them. Nothing is lost."
            : "Workflows start running again for new events. Events that happened while paused are not replayed."
        }
        confirmLabel={enabled ? "Pause all automations" : "Resume automations"}
        onConfirm={confirmChange}
      >
        <label htmlFor="workspace-automation-reason" className="block text-[13px] font-medium text-near-ink">
          Reason <span className="font-normal text-soft-ink">(saved to the audit log)</span>
        </label>
        <textarea
          id="workspace-automation-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={2}
          autoFocus
          placeholder={enabled ? "e.g. Fixing a template before more emails go out" : "e.g. Template fixed"}
          className="mt-1.5 w-full rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 py-2 text-sm text-near-ink placeholder:text-quiet-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink/30"
        />
      </ConfirmDialog>
    </>
  );
}
