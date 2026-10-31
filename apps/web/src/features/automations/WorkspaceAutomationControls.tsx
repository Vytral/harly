"use client";

import { useState, useTransition } from "react";
import { toast } from "@/lib/notification-island/toast";
import {
  setWorkspaceAutomationEnabledAction,
} from "./actions";
import type { WorkspaceAutomationPolicySnapshot } from "./data";

export function WorkspaceAutomationControls({
  initialPolicy,
}: {
  initialPolicy: WorkspaceAutomationPolicySnapshot;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const enabled = policy.enabled;

  function updateEnabled(nextEnabled: boolean) {
    const trimmed = reason.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await setWorkspaceAutomationEnabledAction({
        enabled: nextEnabled,
        reason: trimmed,
      });
      if (!result.ok || !result.policy) {
        toast.error(result.error ?? "Could not update workspace automations.");
        return;
      }
      setPolicy(result.policy);
      setReason("");
      toast.success(
        nextEnabled ? "Workspace automations resumed." : "Workspace automations paused.",
      );
    });
  }

  return (
    <section
      aria-labelledby="workspace-automation-policy-title"
      className="mb-6 w-full rounded-[var(--radius-card)] bg-card p-5 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="workspace-automation-policy-title" className="text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
            Workspace automation controls
          </h2>
          <p className="mt-1 text-sm text-soft-ink">
            Workspace limits: {policy.maxRunsPerMinute} new runs and {policy.maxExternalActionsPerMinute} external actions per minute, with up to {policy.maxConcurrentRuns} active runs.
          </p>
          <p role="status" aria-live="polite" className="mt-2 text-sm font-medium">
            Automations are {enabled ? "enabled" : "paused"} for this workspace.
          </p>
          {!enabled && policy.pausedAt && (
            <p className="mt-1 text-sm text-soft-ink">
              Paused {new Date(policy.pausedAt).toLocaleString()}
              {policy.pausedById ? ` by ${policy.pausedById}` : ""}.
              {policy.pauseReason ? ` Reason: ${policy.pauseReason}` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => updateEnabled(!enabled)}
          disabled={pending || !reason.trim()}
          className="rounded-[var(--radius-btn)] bg-soft-kraft px-4 py-2 text-sm font-medium text-near-ink transition-colors hover:bg-row-wash disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : enabled ? "Pause workspace automations" : "Resume workspace automations"}
        </button>
      </div>
      <div className="mt-4 max-w-2xl">
        <label
          htmlFor="workspace-automation-reason"
          className="mb-1 block text-sm font-medium text-near-ink"
        >
          Reason for this change
        </label>
        <textarea
          id="workspace-automation-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          required
          rows={2}
          aria-describedby="workspace-automation-reason-help"
          className="w-full rounded-[var(--radius-btn)] border border-mist-border bg-pure-snow px-3 py-2 text-sm text-near-ink"
        />
        <p id="workspace-automation-reason-help" className="mt-1 text-xs text-soft-ink">
          Required for pause and resume; up to 500 characters.
        </p>
      </div>
    </section>
  );
}
