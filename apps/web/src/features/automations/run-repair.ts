import "server-only";

import { and, eq, gt, lt } from "drizzle-orm";
import {
  automationAiProposals,
  db,
  workflowDefinitions,
  workflowDrafts,
  workflowNodeExecutions,
  workflowRuns,
} from "@harly/db";
import { requireActorPermission } from "@/features/workspaces/permissions-server";
import type { Permission } from "@/features/workspaces/permissions";
import { ApiError } from "@harly/api";
import {
  prepareAutomationProposal,
  type AutomationProposal,
} from "./ai-proposals";
import {
  applyPatchToGraph,
  type AutomationPatchV1,
} from "./definition/plan-compiler";
import { semanticGraphHash } from "./definition/hash";
import { parseGraph } from "./definition/schema-v2";
import { getWorkflow } from "./data";
import { runLifecycleStage, type AutomationLifecycleStage } from "./lifecycle-status";
import { assertNotDemo } from "@/features/demo/assert-not-demo";

export type WorkflowRunDiagnosis = {
  runId: string;
  workflowId: string;
  workflowName: string;
  triggerEvent: string;
  status: string;
  logicalStatus: string | null;
  /** Canonical UI lifecycle stage (§12.14). Never `delivered` here: node
   * executions carry no action-type evidence, so delivery cannot be confirmed. */
  lifecycleStage: AutomationLifecycleStage;
  lifecycleReason: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  failedNode: {
    nodeId: string;
    status: string;
    errorCode: string | null;
    errorDetails: unknown | null;
    resolvedPort: string | null;
  } | null;
  timeline: Array<{
    nodeId: string;
    status: string;
    resolvedPort: string | null;
    errorCode: string | null;
  }>;
};

/**
 * Reads run execution details, timeline, and error context safely (Phase 5, AI12).
 * Enforces automations:manage permission.
 */
export async function getWorkflowRunDiagnosis(input: {
  workspaceId: string;
  actorId: string;
  runId: string;
  permissions?: Permission[];
}): Promise<WorkflowRunDiagnosis> {
  if (!input.permissions?.includes("automations:manage")) {
    await requireActorPermission(
      input.workspaceId,
      input.actorId,
      "automations:manage",
    );
  }

  const [run] = await db
    .select({
      id: workflowRuns.id,
      workflowId: workflowRuns.workflowId,
      triggerEvent: workflowRuns.triggerEvent,
      status: workflowRuns.status,
      logicalStatus: workflowRuns.logicalStatus,
      startedAt: workflowRuns.startedAt,
      finishedAt: workflowRuns.finishedAt,
      durationMs: workflowRuns.durationMs,
      workflowName: workflowDefinitions.name,
    })
    .from(workflowRuns)
    .innerJoin(
      workflowDefinitions,
      eq(workflowRuns.workflowId, workflowDefinitions.id),
    )
    .where(
      and(
        eq(workflowRuns.id, input.runId),
        eq(workflowRuns.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!run) {
    throw ApiError.notFound("Workflow run not found.");
  }

  const executions = await db
    .select({
      nodeId: workflowNodeExecutions.nodeId,
      status: workflowNodeExecutions.status,
      resolvedPort: workflowNodeExecutions.resolvedPort,
      errorCode: workflowNodeExecutions.errorCode,
      errorDetails: workflowNodeExecutions.errorDetails,
    })
    .from(workflowNodeExecutions)
    .where(
      and(
        eq(workflowNodeExecutions.runId, input.runId),
        eq(workflowNodeExecutions.workspaceId, input.workspaceId),
      ),
    );

  const failedNode =
    executions.find((e) => e.status === "failed" || e.status === "uncertain") ??
    null;

  const lifecycle = runLifecycleStage({
    logicalStatus: run.logicalStatus,
    steps: executions.map((e) => ({ status: e.status })),
  });

  return {
    runId: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflowName,
    triggerEvent: run.triggerEvent,
    status: run.status,
    logicalStatus: run.logicalStatus,
    lifecycleStage: lifecycle.stage,
    lifecycleReason: lifecycle.reason,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    failedNode,
    timeline: executions.map((e) => ({
      nodeId: e.nodeId,
      status: e.status,
      resolvedPort: e.resolvedPort,
      errorCode: e.errorCode,
    })),
  };
}

/**
 * Prepares an automated repair proposal for a failed workflow without modifying historical runs (Phase 5, AI12).
 * Compiles a patch against the draft, validates, and stores as a prepared proposal.
 */
export async function prepareAutomationRepair(input: {
  workspaceId: string;
  actorId: string;
  runId: string;
  patch: AutomationPatchV1;
  explanation: string;
  permissions?: Permission[];
}): Promise<AutomationProposal> {
  if (!input.permissions?.includes("automations:manage")) {
    await requireActorPermission(
      input.workspaceId,
      input.actorId,
      "automations:manage",
    );
  }

  const diagnosis = await getWorkflowRunDiagnosis({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    runId: input.runId,
    permissions: input.permissions,
  });

  const workflow = await getWorkflow({
    workspaceId: input.workspaceId,
    id: diagnosis.workflowId,
  });

  const applied = applyPatchToGraph({
    graph: workflow.graph,
    patch: input.patch,
    name: workflow.name,
    description: workflow.description,
  });

  return prepareAutomationProposal({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    workflowId: workflow.id,
    expectedRevision: workflow.draftRevision,
    expectedContentHash: workflow.contentHash,
    name: applied.name ?? workflow.name,
    description: applied.description ?? workflow.description,
    graph: applied.graph,
    layout: applied.layout,
    operationalPolicy: applied.operationalPolicy,
    permissions: input.permissions,
  });
}

/**
 * Reconciles proposals stuck in "applying" status for more than 5 minutes (Phase 5, AI11).
 * Reverts them to "prepared" if not applied or expired.
 */
export async function reconcileOrphanApplyingProposals(
  olderThanMinutes = 5,
): Promise<number> {
  assertNotDemo();
  const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const now = new Date();
  const stale = await db
    .select({
      id: automationAiProposals.id,
      workspaceId: automationAiProposals.workspaceId,
      workflowId: automationAiProposals.workflowId,
      baseRevision: automationAiProposals.baseRevision,
      name: automationAiProposals.name,
      graph: automationAiProposals.graph,
      updatedAt: automationAiProposals.updatedAt,
    })
    .from(automationAiProposals)
    .where(
      and(
        eq(automationAiProposals.status, "applying"),
        lt(automationAiProposals.updatedAt, threshold),
        gt(automationAiProposals.expiresAt, now),
      ),
    )
    .limit(100);

  let reconciled = 0;
  for (const proposal of stale) {
    let graphHash: string | null = null;
    try {
      graphHash = semanticGraphHash(parseGraph(proposal.graph));
    } catch {
      // A malformed historical proposal cannot prove a successful apply;
      // return it to the reviewable state instead of guessing.
    }

    let recoveredWorkflowId: string | null = null;
    let recoveredRevision: number | null = null;

    if (graphHash && proposal.workflowId) {
      const [draft] = await db
        .select({
          workflowId: workflowDrafts.workflowId,
          revision: workflowDrafts.revision,
          contentHash: workflowDrafts.contentHash,
        })
        .from(workflowDrafts)
        .where(
          and(
            eq(workflowDrafts.workspaceId, proposal.workspaceId),
            eq(workflowDrafts.workflowId, proposal.workflowId),
            eq(workflowDrafts.contentHash, graphHash),
          ),
        )
        .limit(1);
      if (
        draft &&
        (proposal.baseRevision === null ||
          draft.revision > proposal.baseRevision)
      ) {
        recoveredWorkflowId = draft.workflowId;
        recoveredRevision = draft.revision;
      }
    } else if (graphHash) {
      // New-workflow apply has no workflowId on the proposal until its final
      // journal update. A unique, newer draft with the same name/hash is
      // sufficient evidence; ambiguity fails closed and resets for review.
      const candidates = await db
        .select({
          workflowId: workflowDrafts.workflowId,
          revision: workflowDrafts.revision,
          contentHash: workflowDrafts.contentHash,
        })
        .from(workflowDrafts)
        .innerJoin(
          workflowDefinitions,
          eq(workflowDefinitions.id, workflowDrafts.workflowId),
        )
        .where(
          and(
            eq(workflowDrafts.workspaceId, proposal.workspaceId),
            eq(workflowDefinitions.workspaceId, proposal.workspaceId),
            eq(workflowDefinitions.name, proposal.name),
            eq(workflowDrafts.contentHash, graphHash),
            gt(workflowDrafts.updatedAt, proposal.updatedAt),
          ),
        )
        .limit(2);
      if (candidates.length === 1) {
        recoveredWorkflowId = candidates[0]!.workflowId;
        recoveredRevision = candidates[0]!.revision;
      }
    }

    const [updated] = await db
      .update(automationAiProposals)
      .set(
        recoveredWorkflowId && recoveredRevision !== null
          ? {
              workflowId: recoveredWorkflowId,
              appliedRevision: recoveredRevision,
              status: "applied",
              updatedAt: now,
            }
          : {
              status: "prepared",
              applyActionId: null,
              updatedAt: now,
            },
      )
      .where(
        and(
          eq(automationAiProposals.id, proposal.id),
          eq(automationAiProposals.status, "applying"),
        ),
      )
      .returning({ id: automationAiProposals.id });
    if (updated) reconciled += 1;
  }

  return reconciled;
}
