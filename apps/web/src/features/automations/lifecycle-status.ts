import { getAutomationToolManifestV2 } from "./tool-manifests-v2";

/**
 * Canonical UI lifecycle for Harly AI × Automations (audit §12.14).
 *
 * One vocabulary across proposals, durable jobs, and runs so the UI never
 * shows "OK" for a suggestion and "simulation" for a delivery:
 *
 * - suggested: an AI proposal exists but is not yet usable (has validation
 *   issues, or its slot expired and needs a fresh proposal).
 * - validated: the graph passes structural validation, but no simulation
 *   evidence exists yet.
 * - simulated: a fixture-only branch-coverage simulation covers the current
 *   graph hash. Never means providers were called.
 * - queued: work is accepted and pending — an apply in flight, a draft
 *   awaiting publish, a job/run waiting or retrying.
 * - executed: the automation ran to a terminal state (or a proposal was
 *   applied to a draft). The exact outcome stays on the run badge.
 * - delivered: a succeeded run with positive evidence that at least one
 *   external effect (external_write action) completed. Never claimed
 *   without that evidence — see runLifecycleStage.
 * - uncertain: needs human review — failed simulation, partial coverage
 *   with failures, or run steps the runtime could not confirm.
 */
export type AutomationLifecycleStage =
  | "suggested"
  | "validated"
  | "simulated"
  | "queued"
  | "executed"
  | "delivered"
  | "uncertain";

export const AUTOMATION_LIFECYCLE_STAGE_META: Record<
  AutomationLifecycleStage,
  { label: string; description: string }
> = {
  suggested: {
    label: "Suggested",
    description: "An AI suggestion exists but is not yet usable.",
  },
  validated: {
    label: "Validated",
    description: "The graph passes validation. No simulation evidence yet.",
  },
  simulated: {
    label: "Simulated",
    description:
      "Fixture-only branch coverage passed for the current graph. Providers were not called.",
  },
  queued: {
    label: "Queued",
    description: "Accepted and pending — apply, publish, job, or run in flight.",
  },
  executed: {
    label: "Executed",
    description: "Ran to a terminal state. See the run status for the outcome.",
  },
  delivered: {
    label: "Delivered",
    description: "At least one external effect completed with provider evidence.",
  },
  uncertain: {
    label: "Uncertain",
    description: "Needs human review — unconfirmed effects or failed verification.",
  },
};

export type LifecycleAssessment = {
  stage: AutomationLifecycleStage;
  reason: string;
};

/** Where an automation proposal stands. Pure; safe for client and server. */
export function proposalLifecycleStage(input: {
  status: string;
  issuesCount: number;
  simulationStatus: "verified" | "partial" | "failed" | null;
}): LifecycleAssessment {
  if (input.status === "applying") {
    return { stage: "queued", reason: "Apply to draft is in flight." };
  }
  if (input.status === "applied") {
    return { stage: "executed", reason: "Applied to a draft. Publish is a separate human step." };
  }
  if (input.status === "expired" || input.status === "rejected") {
    return { stage: "suggested", reason: "This proposal is closed; a fresh one is needed." };
  }
  if (input.issuesCount > 0) {
    return { stage: "suggested", reason: "Validation issues must be fixed first." };
  }
  if (!input.simulationStatus) {
    return { stage: "validated", reason: "Validation passed. Not simulated yet." };
  }
  if (input.simulationStatus === "failed") {
    return { stage: "uncertain", reason: "Simulation failed — review before re-simulating." };
  }
  return {
    stage: "simulated",
    reason:
      input.simulationStatus === "partial"
        ? "Simulated with partial coverage — check uncovered nodes."
        : "Branch coverage passed for the current graph.",
  };
}

export type LifecycleStep = {
  status: string;
  actionType?: string;
};

/**
 * Where a run stands. `delivered` requires positive evidence: a succeeded
 * step whose action contract declares `effect: "external_write"`. Without
 * step evidence a succeeded run is `executed`, never `delivered`.
 */
export function runLifecycleStage(input: {
  logicalStatus: string | null;
  steps?: LifecycleStep[];
}): LifecycleAssessment {
  const status = input.logicalStatus ?? "queued";
  if (["queued", "waiting", "running", "retrying"].includes(status)) {
    return { stage: "queued", reason: "The run is accepted and pending." };
  }
  const steps = input.steps ?? [];
  if (status === "uncertain" || status === "completed_with_warnings" || steps.some((step) => step.status === "uncertain")) {
    return { stage: "uncertain", reason: "Unconfirmed effects need human review." };
  }
  if (status === "succeeded") {
    const delivered = steps.some(
      (step) =>
        step.status === "succeeded" &&
        typeof step.actionType === "string" &&
        getAutomationToolManifestV2(
          step.actionType as Parameters<typeof getAutomationToolManifestV2>[0],
        )?.effect === "external_write",
    );
    return delivered
      ? { stage: "delivered", reason: "External effects completed with evidence." }
      : {
          stage: "executed",
          reason: steps.length > 0
            ? "Finished without external effects."
            : "Finished. Delivery evidence loads with the step timeline.",
        };
  }
  return { stage: "executed", reason: "The run reached a terminal state." };
}

/** Where a durable AI job stands. A succeeded simulation job feeds `simulated`. */
export function jobLifecycleStage(status: string): LifecycleAssessment {
  if (status === "queued" || status === "running") {
    return { stage: "queued", reason: "The durable job is pending." };
  }
  if (status === "succeeded") {
    return { stage: "simulated", reason: "The job finished and its result is stored." };
  }
  return { stage: "uncertain", reason: "The job did not finish — review or re-queue it." };
}
