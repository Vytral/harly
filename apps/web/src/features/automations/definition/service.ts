import "server-only";

import { and, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";

import { ApiError } from "@harly/api";
import {
  db,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowDrafts,
  automationAiProposals,
  workspaceSettings,
  type WorkflowDefinition,
  type WorkflowDraft,
} from "@harly/db";

import {
  conditionsSchema,
  draftActionsSchema,
  triggerSchema,
  UNTITLED_WORKFLOW_NAME,
  workflowInputSchema,
  type Action,
  type Conditions,
  type Trigger,
  type WorkflowDefinitionInput,
} from "../schema";
import { compileGraph } from "./compile";
import { COMPILER_VERSION, GRAPH_SCHEMA_VERSION } from "./limits";
import { semanticGraphHash } from "./hash";
import { graphToLegacy, legacyToGraph } from "./legacy-adapter";
import type { EditorLayout, LegacyRecipe, WorkflowGraphV2 } from "./schema-v2";
import { emptyCanvasGraph, emptyLayout, parseGraph } from "./schema-v2";
import { validateGraph } from "./validate";
import { validateGraphForPublish } from "../publish-validation";
import { listAutomaticEraseNodeIds } from "../erase-policy";

export type HydratedWorkflow = WorkflowDefinition & {
  draftRevision: number;
  contentHash: string;
  reviewHash: string | null;
  hasUnpublishedChanges: boolean;
  graph: WorkflowGraphV2;
  layout: EditorLayout;
  /** Ephemeral result metadata; never persisted or serialized to the client. */
  operationalPolicyRelaxed?: boolean;
};

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function recipeFromInput(values: WorkflowDefinitionInput): LegacyRecipe {
  return {
    trigger: triggerSchema.parse(values.trigger),
    conditions: conditionsSchema.parse(values.conditions ?? []),
    actions: draftActionsSchema.parse(values.actions),
  };
}

function recipeFromDefinition(def: WorkflowDefinition): LegacyRecipe {
  return {
    trigger: def.trigger as Trigger,
    conditions: def.conditions as Conditions,
    actions: def.actions as Action[],
  };
}

function parseStoredGraph(raw: unknown): WorkflowGraphV2 {
  try {
    return parseGraph(raw);
  } catch {
    return legacyToGraph({
      trigger: { event: "application.created" },
      conditions: [],
      actions: [],
    });
  }
}

function hasDraftChanges(
  def: WorkflowDefinition,
  draft: WorkflowDraft,
  publishedContentHash?: string | null,
): boolean {
  if (!def.publishedAt) return false;
  if (publishedContentHash) return draft.contentHash !== publishedContentHash;
  const liveHash = semanticGraphHash(legacyToGraph(recipeFromDefinition(def)));
  return draft.contentHash !== liveHash;
}

async function publishIssues(
  name: string,
  graph: WorkflowGraphV2,
  workspaceId: string,
  database: DbTx | typeof db = db,
) {
  const { getAutomationTool } = await import("../registry");
  const issues = validateGraphForPublish({ name, graph }, getAutomationTool);
  const automaticEraseIds = listAutomaticEraseNodeIds(graph);
  if (automaticEraseIds.length === 0) return issues;

  const [settings] = await database
    .select({
      dataRetentionEnabled: workspaceSettings.dataRetentionEnabled,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (!settings?.dataRetentionEnabled) {
    for (const nodeId of automaticEraseIds) {
      issues.push({
        nodeId,
        fieldPath: "input.executionMode",
        message:
          "Automatic erase candidate data requires workspace data retention to be enabled in settings. Turn retention on, or use require_approval with an approval step on every path.",
      });
    }
  }
  return issues;
}

/**
 * AI-authored drafts have a stricter publish contract than ordinary manual
 * drafts: once a proposal has been applied to this exact revision, publishing
 * is only allowed after a verified simulation for the exact semantic graph.
 * The check lives in the transactional definition service so server actions,
 * API routes and future workers cannot bypass it by calling publish directly.
 */
async function assertAiProposalPublishGate(
  tx: DbTx,
  input: { workspaceId: string; workflowId: string; revision: number; contentHash: string },
): Promise<void> {
  const [proposal] = await tx
    .select({ simulation: automationAiProposals.simulation })
    .from(automationAiProposals)
    .where(
      and(
        eq(automationAiProposals.workspaceId, input.workspaceId),
        eq(automationAiProposals.workflowId, input.workflowId),
        eq(automationAiProposals.status, "applied"),
        eq(automationAiProposals.appliedRevision, input.revision),
      ),
    )
    .orderBy(desc(automationAiProposals.createdAt))
    .limit(1);
  if (!proposal) return;

  const simulation = proposal.simulation;
  const verified =
    typeof simulation === "object" &&
    simulation !== null &&
    (simulation as { status?: unknown }).status === "verified" &&
    (simulation as { graphHash?: unknown }).graphHash === input.contentHash &&
    (simulation as { coveragePercent?: unknown }).coveragePercent === 100;
  if (!verified) {
    throw ApiError.conflict(
      "This AI-authored draft cannot be published until its current graph has a verified simulation.",
    );
  }
}

function overlayDraft(
  def: WorkflowDefinition,
  draft: WorkflowDraft | null,
  publishedContentHash?: string | null,
): HydratedWorkflow {
  if (!draft) {
    const graph = emptyCanvasGraph();
    return {
      ...def,
      draftRevision: 0,
      contentHash: "",
      reviewHash: null,
      hasUnpublishedChanges: false,
      graph,
      layout: emptyLayout(),
    };
  }
  const graph = parseStoredGraph(draft.graph);
  const legacy = graphToLegacy(graph);
  return {
    ...def,
    trigger: legacy.trigger,
    conditions: legacy.conditions,
    actions: legacy.actions,
    triggerEvent: legacy.trigger.event,
    draftRevision: draft.revision,
    contentHash: draft.contentHash,
    reviewHash: draft.reviewHash,
    hasUnpublishedChanges: hasDraftChanges(def, draft, publishedContentHash),
    graph,
    layout: (draft.layout as EditorLayout) ?? emptyLayout(),
  };
}

async function loadPublishedContentHash(
  tx: DbTx | typeof db,
  workspaceId: string,
  versionId: string | null,
): Promise<string | null> {
  if (!versionId) return null;
  const [row] = await tx
    .select({ contentHash: workflowDefinitionVersions.contentHash })
    .from(workflowDefinitionVersions)
    .where(
      and(
        eq(workflowDefinitionVersions.id, versionId),
        eq(workflowDefinitionVersions.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row?.contentHash ?? null;
}

async function loadDefinition(
  tx: DbTx | typeof db,
  workspaceId: string,
  id: string,
): Promise<WorkflowDefinition> {
  const [row] = await tx
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.id, id),
        eq(workflowDefinitions.workspaceId, workspaceId),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw ApiError.notFound("Workflow not found.");
  return row;
}

async function loadDraft(
  tx: DbTx | typeof db,
  workspaceId: string,
  workflowId: string,
): Promise<WorkflowDraft | null> {
  const [row] = await tx
    .select()
    .from(workflowDrafts)
    .where(
      and(
        eq(workflowDrafts.workflowId, workflowId),
        eq(workflowDrafts.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function ensureDraftRow(
  tx: DbTx,
  def: WorkflowDefinition,
  actorId?: string | null,
): Promise<WorkflowDraft> {
  const existing = await loadDraft(tx, def.workspaceId, def.id);
  if (existing) return existing;
  const graph = legacyToGraph(recipeFromDefinition(def));
  const contentHash = semanticGraphHash(graph);
  const [created] = await tx
    .insert(workflowDrafts)
    .values({
      workspaceId: def.workspaceId,
      workflowId: def.id,
      revision: 1,
      graph,
      layout: emptyLayout(),
      updatedById: actorId ?? def.createdById,
      contentHash,
      validationIssues: validateGraph(graph),
    })
    .returning();
  if (!created) throw ApiError.internal("Workflow draft could not be created.");
  return created;
}

export async function createWorkflowWithDraft(input: {
  workspaceId: string;
  values: WorkflowDefinitionInput;
  createdById: string;
  graph?: WorkflowGraphV2;
  layout?: EditorLayout;
  database?: typeof db;
}): Promise<HydratedWorkflow> {
  const parsed = workflowInputSchema.parse(input.values);
  const recipe = recipeFromInput(parsed);
  const graph = input.graph ? parseGraph(input.graph) : legacyToGraph(recipe);
  const contentHash = semanticGraphHash(graph);
  const name = parsed.name.trim() || UNTITLED_WORKFLOW_NAME;

  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(workflowDefinitions)
      .values({
        workspaceId: input.workspaceId,
        name,
        description: parsed.description ?? null,
        enabled: false,
        status: "draft",
        // New definitions are v2 from birth. The draft is already a graph,
        // so there is no reason to create a definition that advertises the
        // retired linear runtime and only switches engines at publish time.
        // Historical v1 definitions remain readable through the compatibility
        // paths, but the builder never creates another one.
        engineVersion: 2,
        triggerEvent: recipe.trigger.event,
        trigger: recipe.trigger,
        conditions: recipe.conditions,
        actions: recipe.actions,
        createdById: input.createdById,
        ...(parsed.maxRunsPerMinute !== undefined
          ? { maxRunsPerMinute: parsed.maxRunsPerMinute }
          : {}),
        ...(parsed.maxExternalActionsPerMinute !== undefined
          ? { maxExternalActionsPerMinute: parsed.maxExternalActionsPerMinute }
          : {}),
        ...(parsed.circuitBreakerThreshold !== undefined
          ? { circuitBreakerThreshold: parsed.circuitBreakerThreshold }
          : {}),
        ...(parsed.circuitBreakerCooldownSeconds !== undefined
          ? {
              circuitBreakerCooldownSeconds:
                parsed.circuitBreakerCooldownSeconds,
            }
          : {}),
      })
      .returning();
    if (!row) throw ApiError.internal("Workflow could not be created.");

    const [draft] = await tx
      .insert(workflowDrafts)
      .values({
        workspaceId: row.workspaceId,
        workflowId: row.id,
        revision: 1,
        graph,
        layout: input.layout ?? emptyLayout(),
        updatedById: input.createdById,
        contentHash,
        validationIssues: validateGraph(graph),
      })
      .returning();
    if (!draft) throw ApiError.internal("Workflow draft could not be created.");
    return overlayDraft(row, draft);
  });
}

export async function saveWorkflowDraft(input: {
  workspaceId: string;
  id: string;
  patch: Partial<WorkflowDefinitionInput>;
  expectedRevision?: number;
  actorId?: string | null;
  graph?: WorkflowGraphV2;
  layout?: EditorLayout;
  database?: typeof db;
}): Promise<HydratedWorkflow> {
  const patch = workflowInputSchema.partial().parse(input.patch);
  const database = input.database ?? db;

  return database.transaction(async (tx) => {
    const def = await loadDefinition(tx, input.workspaceId, input.id);
    const draft = await ensureDraftRow(tx, def, input.actorId);
    const expected = input.expectedRevision ?? draft.revision;
    if (draft.revision !== expected) {
      throw ApiError.conflict(
        "This draft was saved elsewhere. Reload and copy your changes.",
      );
    }

    const currentGraph = parseStoredGraph(draft.graph);
    const currentRecipe = graphToLegacy(currentGraph);
    const semanticPatchRequested =
      patch.trigger !== undefined ||
      patch.conditions !== undefined ||
      patch.actions !== undefined;
    if (def.engineVersion === 2 && !input.graph && semanticPatchRequested) {
      throw ApiError.conflict(
        "This v2 workflow must be saved with its graph. Reload the builder and try again.",
      );
    }
    const nextRecipe: LegacyRecipe = {
      trigger: patch.trigger
        ? triggerSchema.parse(patch.trigger)
        : currentRecipe.trigger,
      conditions:
        patch.conditions !== undefined
          ? conditionsSchema.parse(patch.conditions ?? [])
          : currentRecipe.conditions,
      actions:
        patch.actions !== undefined
          ? draftActionsSchema.parse(patch.actions)
          : currentRecipe.actions,
    };
    // v2 graphs are authoritative. Metadata-only saves must never pass through
    // graphToLegacy/legacyToGraph because that projection intentionally cannot
    // represent branches, waits, approvals, or parallel paths.
    const graph = input.graph
      ? parseGraph(input.graph)
      : def.engineVersion === 2
        ? currentGraph
        : legacyToGraph(nextRecipe);
    const contentHash = semanticGraphHash(graph);
    const layout =
      input.layout ?? (draft.layout as EditorLayout) ?? emptyLayout();
    const hashChanged = contentHash !== draft.contentHash;

    const [updatedDraft] = await tx
      .update(workflowDrafts)
      .set({
        revision: sql`${workflowDrafts.revision} + 1`,
        graph,
        layout,
        contentHash,
        updatedById: input.actorId ?? draft.updatedById,
        validationIssues: validateGraph(graph),
        updatedAt: new Date(),
        ...(hashChanged ? { reviewHash: null } : {}),
      })
      .where(
        and(
          eq(workflowDrafts.id, draft.id),
          eq(workflowDrafts.workspaceId, input.workspaceId),
          eq(workflowDrafts.revision, expected),
        ),
      )
      .returning();
    if (!updatedDraft) {
      throw ApiError.conflict(
        "This draft was saved elsewhere. Reload and copy your changes.",
      );
    }

    const definitionPatch: Partial<typeof workflowDefinitions.$inferInsert> = {
      updatedAt: new Date(),
    };
    const now = new Date();
    const requestedCircuitOpenUntil = patch.circuitOpenUntil === undefined
      ? undefined
      : patch.circuitOpenUntil === null
        ? null
        : new Date(patch.circuitOpenUntil);
    if (requestedCircuitOpenUntil && requestedCircuitOpenUntil <= now) {
      throw ApiError.unprocessable(
        "The circuit open-until time must be in the future.",
      );
    }
    const currentCircuitOpenUntil = def.circuitOpenUntil;
    const relaxesCircuit = requestedCircuitOpenUntil !== undefined &&
      currentCircuitOpenUntil !== null &&
      currentCircuitOpenUntil > now &&
      (requestedCircuitOpenUntil === null ||
        requestedCircuitOpenUntil.getTime() < currentCircuitOpenUntil.getTime());
    const relaxesOperationalPolicy =
      (patch.maxRunsPerMinute !== undefined &&
        patch.maxRunsPerMinute > def.maxRunsPerMinute) ||
      (patch.maxExternalActionsPerMinute !== undefined &&
        patch.maxExternalActionsPerMinute >
          def.maxExternalActionsPerMinute) ||
      (patch.circuitBreakerThreshold !== undefined &&
        patch.circuitBreakerThreshold > def.circuitBreakerThreshold) ||
      (patch.circuitBreakerCooldownSeconds !== undefined &&
        patch.circuitBreakerCooldownSeconds <
          def.circuitBreakerCooldownSeconds) ||
      relaxesCircuit;
    if (patch.name !== undefined) {
      definitionPatch.name = patch.name.trim() || UNTITLED_WORKFLOW_NAME;
    }
    if (patch.description !== undefined) {
      definitionPatch.description = patch.description ?? null;
    }
    // These are control-plane settings, not graph content: a stricter value
    // must take effect for newly dispatched runs immediately. Persist every
    // accepted field here; accepting a value without writing it would make the
    // editor and the runtime disagree about the active safety policy.
    if (patch.maxRunsPerMinute !== undefined) {
      definitionPatch.maxRunsPerMinute = patch.maxRunsPerMinute;
    }
    if (patch.maxExternalActionsPerMinute !== undefined) {
      definitionPatch.maxExternalActionsPerMinute =
        patch.maxExternalActionsPerMinute;
    }
    if (patch.circuitBreakerThreshold !== undefined) {
      definitionPatch.circuitBreakerThreshold = patch.circuitBreakerThreshold;
    }
    if (patch.circuitBreakerCooldownSeconds !== undefined) {
      definitionPatch.circuitBreakerCooldownSeconds =
        patch.circuitBreakerCooldownSeconds;
    }
    if (requestedCircuitOpenUntil !== undefined) {
      definitionPatch.circuitOpenUntil = requestedCircuitOpenUntil;
    }
    // Tightening a live guard is safe to apply immediately. Relaxing one is a
    // material increase in blast radius, so remove the definition from
    // dispatch and route it through the ordinary draft/review/publish path.
    // The new values are still persisted and will be snapshotted on publish.
    if (relaxesOperationalPolicy && def.status !== "draft") {
      definitionPatch.status = "draft";
      definitionPatch.enabled = false;
      definitionPatch.approvalRequestedAt = null;
      definitionPatch.approvalRequestedById = null;
      definitionPatch.approvedById = null;
      definitionPatch.approvedAt = null;
    }
    if (hashChanged) {
      definitionPatch.approvalRequestedAt = null;
      definitionPatch.approvalRequestedById = null;
      definitionPatch.approvedById = null;
      definitionPatch.approvedAt = null;
    }

    const [updatedDef] = await tx
      .update(workflowDefinitions)
      .set(definitionPatch)
      .where(
        and(
          eq(workflowDefinitions.id, def.id),
          eq(workflowDefinitions.workspaceId, input.workspaceId),
          isNull(workflowDefinitions.deletedAt),
        ),
      )
      .returning();
    if (!updatedDef) throw ApiError.notFound("Workflow not found.");
    const publishedContentHash = await loadPublishedContentHash(
      tx,
      updatedDef.workspaceId,
      updatedDef.publishedVersionId,
    );
    return {
      ...overlayDraft(updatedDef, updatedDraft, publishedContentHash),
      operationalPolicyRelaxed: relaxesOperationalPolicy,
    };
  });
}

export async function requestDraftApproval(input: {
  workspaceId: string;
  id: string;
  requesterId: string;
  expectedRevision: number;
  database?: typeof db;
}): Promise<HydratedWorkflow> {
  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    const def = await loadDefinition(tx, input.workspaceId, input.id);
    const draft = await ensureDraftRow(tx, def);
    if (draft.revision !== input.expectedRevision) {
      throw ApiError.conflict(
        "This draft changed before approval was requested. Save the latest revision and try again.",
      );
    }
    const compiled = compileGraph(draft.graph);
    if (!compiled.ok) {
      throw ApiError.unprocessable(
        "This recipe isn't ready to publish.",
        compiled.issues,
      );
    }
    const graph = parseStoredGraph(draft.graph);
    const issues = await publishIssues(def.name, graph, def.workspaceId, tx);
    if (issues.length > 0) {
      throw ApiError.unprocessable(
        "This recipe isn't ready to publish.",
        issues,
      );
    }
    const [updatedDraft] = await tx
      .update(workflowDrafts)
      .set({ reviewHash: draft.contentHash, updatedAt: new Date() })
      .where(
        and(
          eq(workflowDrafts.id, draft.id),
          eq(workflowDrafts.workspaceId, input.workspaceId),
          eq(workflowDrafts.revision, input.expectedRevision),
        ),
      )
      .returning();
    if (!updatedDraft) {
      throw ApiError.conflict(
        "This draft changed before approval was requested. Save the latest revision and try again.",
      );
    }
    const [updatedDef] = await tx
      .update(workflowDefinitions)
      .set({
        approvalRequestedAt: new Date(),
        approvalRequestedById: input.requesterId,
        approvedAt: null,
        approvedById: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowDefinitions.id, def.id))
      .returning();
    if (!updatedDef)
      throw ApiError.notFound("Workflow not found.");
    const publishedContentHash = await loadPublishedContentHash(
      tx,
      updatedDef.workspaceId,
      updatedDef.publishedVersionId,
    );
    return overlayDraft(updatedDef, updatedDraft, publishedContentHash);
  });
}

export async function approveDraft(input: {
  workspaceId: string;
  id: string;
  approverId: string;
  expectedRevision: number;
  database?: typeof db;
}): Promise<HydratedWorkflow> {
  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    const def = await loadDefinition(tx, input.workspaceId, input.id);
    const draft = await ensureDraftRow(tx, def);
    if (draft.revision !== input.expectedRevision) {
      throw ApiError.conflict(
        "This draft changed before approval. Review the latest saved revision and try again.",
      );
    }
    if (!def.approvalRequestedAt || !draft.reviewHash) {
      throw ApiError.conflict("This workflow has no approval request.");
    }
    if (!def.approvalRequestedById) {
      throw ApiError.conflict("This approval request has no reviewer identity.");
    }
    if (def.approvalRequestedById === input.approverId) {
      throw ApiError.conflict(
        "The person who requested this review cannot approve it.",
      );
    }
    if (draft.reviewHash !== draft.contentHash) {
      throw ApiError.conflict(
        "The draft changed after approval was requested.",
      );
    }
    const [lockedDraft] = await tx
      .update(workflowDrafts)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(workflowDrafts.id, draft.id),
          eq(workflowDrafts.workspaceId, input.workspaceId),
          eq(workflowDrafts.revision, input.expectedRevision),
          eq(workflowDrafts.contentHash, draft.contentHash),
          eq(workflowDrafts.reviewHash, draft.contentHash),
        ),
      )
      .returning({ id: workflowDrafts.id });
    if (!lockedDraft) {
      throw ApiError.conflict(
        "This draft changed before approval. Review the latest saved revision and try again.",
      );
    }
    const [updatedDef] = await tx
      .update(workflowDefinitions)
      .set({
        approvedById: input.approverId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowDefinitions.id, def.id))
      .returning();
    if (!updatedDef) throw ApiError.notFound("Workflow not found.");
    const publishedContentHash = await loadPublishedContentHash(
      tx,
      updatedDef.workspaceId,
      updatedDef.publishedVersionId,
    );
    return overlayDraft(updatedDef, draft, publishedContentHash);
  });
}

export async function publishDraft(input: {
  workspaceId: string;
  id: string;
  publisherId: string;
  expectedRevision: number;
  database?: typeof db;
}): Promise<HydratedWorkflow> {
  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    const def = await loadDefinition(tx, input.workspaceId, input.id);
    const draft = await ensureDraftRow(tx, def);
    if (draft.revision !== input.expectedRevision) {
      throw ApiError.conflict(
        "This draft changed before publishing. Save the latest revision and try again.",
      );
    }
    if (!def.approvedAt || !def.approvedById) {
      throw ApiError.conflict(
        "Workflow needs approval from another member before publishing.",
      );
    }
    if (
      !def.approvalRequestedById ||
      def.approvedById === def.approvalRequestedById
    ) {
      throw ApiError.conflict(
        "Workflow needs independent approval from another member before publishing.",
      );
    }
    if (!draft.reviewHash || draft.reviewHash !== draft.contentHash) {
      throw ApiError.conflict(
        "Approval applies to a previous revision. Request approval again.",
      );
    }

    const [lockedDraft] = await tx
      .update(workflowDrafts)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(workflowDrafts.id, draft.id),
          eq(workflowDrafts.workspaceId, input.workspaceId),
          eq(workflowDrafts.revision, input.expectedRevision),
          eq(workflowDrafts.contentHash, draft.contentHash),
          eq(workflowDrafts.reviewHash, draft.contentHash),
        ),
      )
      .returning({ id: workflowDrafts.id });
    if (!lockedDraft) {
      throw ApiError.conflict(
        "This draft changed before publishing. Request approval for the latest revision.",
      );
    }

    const compiled = compileGraph(draft.graph);
    if (!compiled.ok) {
      throw ApiError.unprocessable(
        "This recipe isn't ready to publish.",
        compiled.issues,
      );
    }
    const graph = parseStoredGraph(draft.graph);
    const issues = await publishIssues(def.name, graph, def.workspaceId, tx);
    if (issues.length > 0) {
      throw ApiError.unprocessable(
        "This recipe isn't ready to publish.",
        issues,
      );
    }
    await assertAiProposalPublishGate(tx, {
      workspaceId: input.workspaceId,
      workflowId: def.id,
      revision: draft.revision,
      contentHash: draft.contentHash,
    });
    const legacy = graphToLegacy(graph);
    const publishedAt = new Date();
    const triggerChanged =
      JSON.stringify(def.trigger) !== JSON.stringify(legacy.trigger) ||
      def.triggerEvent !== legacy.trigger.event;
    const [agg] = await tx
      .select({ latest: max(workflowDefinitionVersions.version) })
      .from(workflowDefinitionVersions)
      .where(eq(workflowDefinitionVersions.workflowId, def.id));
    const nextVersion = (agg?.latest ?? 0) + 1;

    const [versionRow] = await tx
      .insert(workflowDefinitionVersions)
      .values({
        workspaceId: def.workspaceId,
        workflowId: def.id,
        version: nextVersion,
        name: def.name,
        description: def.description,
        triggerEvent: legacy.trigger.event,
        trigger: legacy.trigger,
        conditions: legacy.conditions,
        actions: legacy.actions,
        createdById: def.createdById,
        approvedById: def.approvedById,
        approvedAt: def.approvedAt,
        publishedById: input.publisherId,
        publishedAt,
        maxRunsPerMinute: def.maxRunsPerMinute,
        maxExternalActionsPerMinute: def.maxExternalActionsPerMinute,
        circuitBreakerThreshold: def.circuitBreakerThreshold,
        circuitBreakerCooldownSeconds: def.circuitBreakerCooldownSeconds,
        schemaVersion: GRAPH_SCHEMA_VERSION,
        graph: draft.graph,
        compilerVersion: compiled.plan.compilerVersion,
        contentHash: compiled.plan.contentHash,
        layoutSnapshot: draft.layout,
      })
      .returning();
    if (!versionRow)
      throw ApiError.internal("Published version could not be stored.");

    const nextStatus = def.status === "paused" ? "paused" : "published";
    const nextEnabled = def.status === "paused" ? false : true;

    const [updatedDef] = await tx
      .update(workflowDefinitions)
      .set({
        status: nextStatus,
        enabled: nextEnabled,
        triggerEvent: legacy.trigger.event,
        trigger: legacy.trigger,
        conditions: legacy.conditions,
        actions: legacy.actions,
        definitionVersion: versionRow.version,
        publishedVersionId: versionRow.id,
        publishedById: input.publisherId,
        publishedAt,
        // Every publish stores an immutable graph version consumed by worker v2.
        engineVersion: 2,
        triggerGeneration: triggerChanged
          ? def.triggerGeneration + 1
          : def.triggerGeneration,
        updatedAt: publishedAt,
      })
      .where(eq(workflowDefinitions.id, def.id))
      .returning();
    if (!updatedDef) throw ApiError.notFound("Workflow not found.");
    return overlayDraft(updatedDef, draft, versionRow.contentHash);
  });
}

export async function rollbackVersionToDraft(input: {
  workspaceId: string;
  workflowId: string;
  version: number;
  actorId?: string | null;
}): Promise<HydratedWorkflow> {
  return db.transaction(async (tx) => {
    const def = await loadDefinition(tx, input.workspaceId, input.workflowId);
    const [source] = await tx
      .select()
      .from(workflowDefinitionVersions)
      .where(
        and(
          eq(workflowDefinitionVersions.workspaceId, input.workspaceId),
          eq(workflowDefinitionVersions.workflowId, input.workflowId),
          eq(workflowDefinitionVersions.version, input.version),
        ),
      )
      .limit(1);
    if (!source) throw ApiError.notFound("Workflow version not found.");

    const graph =
      source.schemaVersion === GRAPH_SCHEMA_VERSION && source.graph
        ? parseStoredGraph(source.graph)
        : legacyToGraph({
            trigger: source.trigger as Trigger,
            conditions: source.conditions as Conditions,
            actions: source.actions as Action[],
          });
    const contentHash = semanticGraphHash(graph);
    const draft = await ensureDraftRow(tx, def, input.actorId);
    const [updatedDraft] = await tx
      .update(workflowDrafts)
      .set({
        revision: sql`${workflowDrafts.revision} + 1`,
        graph,
        layout: (source.layoutSnapshot as EditorLayout) ?? emptyLayout(),
        contentHash,
        reviewHash: null,
        validationIssues: validateGraph(graph),
        updatedById: input.actorId ?? draft.updatedById,
        updatedAt: new Date(),
      })
      .where(eq(workflowDrafts.id, draft.id))
      .returning();
    const [updatedDef] = await tx
      .update(workflowDefinitions)
      .set({
        approvalRequestedAt: null,
        approvalRequestedById: null,
        approvedById: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowDefinitions.id, def.id))
      .returning();
    if (!updatedDef || !updatedDraft)
      throw ApiError.notFound("Workflow not found.");
    const publishedContentHash = await loadPublishedContentHash(
      tx,
      updatedDef.workspaceId,
      updatedDef.publishedVersionId,
    );
    return overlayDraft(updatedDef, updatedDraft, publishedContentHash);
  });
}

export async function loadHydratedWorkflow(input: {
  workspaceId: string;
  id: string;
}): Promise<HydratedWorkflow> {
  return db.transaction(async (tx) => {
    const def = await loadDefinition(tx, input.workspaceId, input.id);
    const draft = await ensureDraftRow(tx, def);
    const publishedContentHash = await loadPublishedContentHash(
      tx,
      def.workspaceId,
      def.publishedVersionId,
    );
    return overlayDraft(def, draft, publishedContentHash);
  });
}

export async function listHydratedWorkflows(
  workspaceId: string,
): Promise<HydratedWorkflow[]> {
  const rows = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.workspaceId, workspaceId),
        isNull(workflowDefinitions.deletedAt),
      ),
    )
    .orderBy(desc(workflowDefinitions.updatedAt));
  if (rows.length === 0) return [];
  const drafts = await db
    .select()
    .from(workflowDrafts)
    .where(
      and(
        eq(workflowDrafts.workspaceId, workspaceId),
        inArray(
          workflowDrafts.workflowId,
          rows.map((row) => row.id),
        ),
      ),
    );
  const byId = new Map(drafts.map((draft) => [draft.workflowId, draft]));
  const versionIds = rows.flatMap((row) =>
    row.publishedVersionId ? [row.publishedVersionId] : [],
  );
  const publishedVersions = versionIds.length
    ? await db
        .select({
          id: workflowDefinitionVersions.id,
          contentHash: workflowDefinitionVersions.contentHash,
        })
        .from(workflowDefinitionVersions)
        .where(inArray(workflowDefinitionVersions.id, versionIds))
    : [];
  const publishedHashes = new Map(
    publishedVersions.map((version) => [version.id, version.contentHash]),
  );
  return rows.map((row) =>
    overlayDraft(
      row,
      byId.get(row.id) ?? null,
      row.publishedVersionId
        ? publishedHashes.get(row.publishedVersionId)
        : null,
    ),
  );
}

export { COMPILER_VERSION };
