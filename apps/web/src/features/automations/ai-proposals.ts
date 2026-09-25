import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, ilike, isNull, sql } from "drizzle-orm";

import { ApiError } from "@harly/api";
import { automationAiProposals, db, workflowDefinitions } from "@harly/db";
import { requireActorPermission } from "@/features/workspaces/permissions-server";
import type { Permission } from "@/features/workspaces/permissions";

import {
  getAutomationTool,
  listAutomationToolManifests,
  listAutomationToolManifestsV2,
} from "./registry";
import {
  validateGraphForPublish,
  deduplicateValidationIssues,
} from "./publish-validation";
import { getWorkflow, createWorkflow, updateWorkflow } from "./data";
import { graphToLegacy } from "./definition/legacy-adapter";
import {
  editorLayoutSchema,
  emptyLayout,
  jsonValueSchema,
  parseGraph,
  type EditorLayout,
  type WorkflowGraphV2,
} from "./definition/schema-v2";
import {
  operationalPolicyPatchSchema,
  type OperationalPolicyPatch,
} from "./definition/plan-compiler";
import { canonicalJson, semanticGraphHash } from "./definition/hash";
import { selectAutomationSubgraph } from "./definition/subgraph";
import {
  runBranchCoverageSimulation,
  type BranchCoverageReport,
  type SimulationScenario,
} from "./simulation-coverage";
import type { ConditionContext } from "./conditions";
import { assertNotDemo } from "@/features/demo/assert-not-demo";

const PROPOSAL_TTL_MS = 30 * 60 * 1000;
const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000;

function automationPreviewSecret(): string {
  const secret =
    process.env.AUTOMATION_PREVIEW_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "test") {
    return "harly-test-only-automation-preview-secret";
  }
  if (!secret) {
    throw new Error("Automation preview signing secret is not configured.");
  }
  return secret;
}

export function createAutomationProposalPreviewToken(input: {
  proposalId: string;
  graphHash: string;
  expiresAt?: number;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      proposalId: input.proposalId,
      graphHash: input.graphHash,
      expiresAt: input.expiresAt ?? Date.now() + PREVIEW_TOKEN_TTL_MS,
    }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", automationPreviewSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAutomationProposalPreviewToken(input: {
  token: string | undefined;
  proposalId: string;
  graphHash: string;
}): boolean {
  if (!input.token) return false;
  const [payload, signature] = input.token.split(".");
  if (!payload || !signature) return false;
  try {
    const expected = createHmac("sha256", automationPreviewSecret())
      .update(payload)
      .digest("base64url");
    const expectedBytes = Buffer.from(expected, "utf8");
    const signatureBytes = Buffer.from(signature, "utf8");
    if (
      expectedBytes.length !== signatureBytes.length ||
      !timingSafeEqual(expectedBytes, signatureBytes)
    ) {
      return false;
    }
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { proposalId?: unknown; graphHash?: unknown; expiresAt?: unknown };
    return (
      parsed.proposalId === input.proposalId &&
      parsed.graphHash === input.graphHash &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}

/** Reuse the route's already-authorized snapshot when tools run outside Next. */
async function assertAutomationPermission(input: {
  workspaceId: string;
  actorId: string;
  permissions?: Permission[];
}): Promise<void> {
  if (input.permissions?.includes("automations:manage")) return;
  await requireActorPermission(
    input.workspaceId,
    input.actorId,
    "automations:manage",
  );
}

/**
 * Fail with an actionable application error before a model can retry a write
 * tool against a partially migrated database. The proposal table is a
 * prerequisite for prepare/simulate/apply; allowing the raw relation error to
 * escape makes Harly treat an infrastructure problem like a recoverable tool
 * failure and repeatedly re-plan the same request.
 */
async function assertAutomationProposalStoreAvailable(): Promise<void> {
  const result = await db.execute(
    sql`
      select
        to_regclass('public.automation_ai_proposals') as relation,
        array(
          select column_name
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'automation_ai_proposals'
            and column_name in (
              'diff',
              'validation_issues',
              'simulation',
              'redaction_metadata',
              'operational_policy',
              'local_snapshot_hash',
              'status',
              'apply_action_id',
              'applied_revision',
              'expires_at'
            )
        ) as columns
    `,
  );
  const row = result[0] as
    | { relation?: string | null; columns?: string[] | null }
    | undefined;
  const relation = row?.relation;
  const columns = new Set(row?.columns ?? []);
  const requiredColumns = [
    "diff",
    "validation_issues",
    "simulation",
    "redaction_metadata",
    "operational_policy",
    "local_snapshot_hash",
    "status",
    "apply_action_id",
    "applied_revision",
    "expires_at",
  ];
  const missingColumns = requiredColumns.filter(
    (column) => !columns.has(column),
  );
  if (relation !== "automation_ai_proposals" || missingColumns.length > 0) {
    throw ApiError.internal(
      `Harly AI automation proposals are unavailable because the database migration is missing or incomplete${missingColumns.length > 0 ? ` (missing columns: ${missingColumns.join(", ")})` : ""}. Apply the current migrations before retrying.`,
    );
  }
}

type ProposalIssue = {
  nodeId: string;
  fieldPath: string;
  message: string;
};

export type AutomationProposalDiff = Array<{
  kind:
    | "node_added"
    | "node_removed"
    | "node_changed"
    | "edge_added"
    | "edge_removed"
    | "edge_changed"
    | "metadata_changed";
  id: string;
  before?: unknown;
  after?: unknown;
}>;

export type AutomationProposal = {
  id: string;
  workflowId: string | null;
  baseRevision: number | null;
  baseContentHash: string | null;
  /** Alias of baseContentHash for older prompts/docs. */
  baseGraphHash?: string | null;
  /** Declared subgraph anchor for formal patch rebasing (not journaled). */
  baseSubgraphHash?: string | null;
  localSnapshotHash: string | null;
  name: string;
  description: string | null;
  graph: WorkflowGraphV2;
  layout: EditorLayout;
  operationalPolicy?: OperationalPolicyPatch;
  diff: AutomationProposalDiff;
  issues: ProposalIssue[];
  simulation: AutomationProposalSimulation | null;
  redactionMetadata: { version: number; secretsRedacted: boolean };
  status: "prepared" | "applying" | "applied" | "expired" | "rejected";
  expiresAt: string;
  appliedRevision: number | null;
};

function proposalView(
  row: typeof automationAiProposals.$inferSelect,
): AutomationProposal {
  return {
    id: row.id,
    workflowId: row.workflowId,
    baseRevision: row.baseRevision,
    baseContentHash: row.baseContentHash,
    baseGraphHash: row.baseContentHash,
    // Not journaled (no column): the subgraph anchor is recomputed on demand
    // via selectAutomationSubgraph from the journaled base graph + baseNodeIds
    // carried on the patch. Null here means "no declared subgraph anchor".
    baseSubgraphHash: null,
    localSnapshotHash: row.localSnapshotHash,
    name: row.name,
    description: row.description,
    graph: parseGraph(row.graph),
    layout: editorLayoutSchema.parse(row.layout ?? emptyLayout()),
    operationalPolicy:
      row.operationalPolicy == null
        ? undefined
        : operationalPolicyPatchSchema.parse(row.operationalPolicy),
    diff: (row.diff as AutomationProposalDiff) ?? [],
    issues: (row.validationIssues as ProposalIssue[]) ?? [],
    simulation: isProposalSimulation(row.simulation) ? row.simulation : null,
    redactionMetadata:
      row.redactionMetadata && typeof row.redactionMetadata === "object"
        ? (row.redactionMetadata as { version: number; secretsRedacted: boolean })
        : { version: 1, secretsRedacted: true },
    status: row.status as AutomationProposal["status"],
    expiresAt: row.expiresAt.toISOString(),
    appliedRevision: row.appliedRevision,
  };
}

function workflowOperationalPolicy(workflow: {
  maxRunsPerMinute: number;
  maxExternalActionsPerMinute: number;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownSeconds: number;
  circuitOpenUntil: Date | null;
}): OperationalPolicyPatch {
  return {
    maxRunsPerMinute: workflow.maxRunsPerMinute,
    maxExternalActionsPerMinute: workflow.maxExternalActionsPerMinute,
    circuitBreakerThreshold: workflow.circuitBreakerThreshold,
    circuitBreakerCooldownSeconds: workflow.circuitBreakerCooldownSeconds,
    circuitOpenUntil: workflow.circuitOpenUntil?.toISOString() ?? null,
  };
}

/** Read-only, safe context for the editor panel and global chat. */
export async function getAutomationAiContext(input: {
  workspaceId: string;
  actorId: string;
  workflowId: string;
  permissions?: Permission[];
  /** Optional subgraph slice for large graphs; full graph is still returned. */
  nodeIds?: string[];
  depth?: number;
  cursor?: string;
  limit?: number;
}) {
  await assertAutomationPermission(input);
  const workflow = await getWorkflow({
    workspaceId: input.workspaceId,
    id: input.workflowId,
  });
  const graph = parseGraph(workflow.graph);
  const subgraph =
    input.nodeIds?.length || input.cursor || input.limit !== undefined || input.depth !== undefined
      ? selectAutomationSubgraph({
          graph,
          nodeIds: input.nodeIds,
          depth: input.depth,
          cursor: input.cursor,
          limit: input.limit,
        })
      : null;
  return {
    workflowId: workflow.id,
    name: workflow.name,
    description: workflow.description,
    draftRevision: workflow.draftRevision,
    contentHash: workflow.contentHash,
    /** Alias of contentHash for older prompts/docs. */
    baseGraphHash: workflow.contentHash,
    status: workflow.status,
    graph: workflow.graph,
    layout: workflow.layout,
    ...(subgraph ? { subgraph } : {}),
    validationIssues: deduplicateValidationIssues(
      validateGraphForPublish(
        { name: workflow.name, graph: workflow.graph },
        getAutomationTool,
      ),
    ),
    tools: listAutomationToolManifests(),
    toolsV2: listAutomationToolManifestsV2(),
  };
}

/** Compact, workspace-scoped discovery for global chat. */
export async function searchAutomationAiWorkflows(input: {
  workspaceId: string;
  actorId?: string;
  query?: string;
  limit?: number;
  permissions?: Permission[];
}) {
  if (input.actorId) {
    await assertAutomationPermission({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      permissions: input.permissions,
    });
  }
  const query = input.query?.trim();
  return db
    .select({
      id: workflowDefinitions.id,
      name: workflowDefinitions.name,
      description: workflowDefinitions.description,
      status: workflowDefinitions.status,
      updatedAt: workflowDefinitions.updatedAt,
    })
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.workspaceId, input.workspaceId),
        isNull(workflowDefinitions.deletedAt),
        query
          ? ilike(
              workflowDefinitions.name,
              `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(workflowDefinitions.updatedAt))
    .limit(Math.min(Math.max(input.limit ?? 10, 1), 25));
}

/**
 * Persist an un-applied graph proposal. The model may suggest a graph, but it
 * cannot choose a workspace/actor or mutate the draft through this operation.
 */
export async function prepareAutomationProposal(input: {
  workspaceId: string;
  actorId: string;
  workflowId?: string;
  expectedRevision?: number;
  expectedContentHash?: string;
  localSnapshotHash?: string;
  name: string;
  description?: string | null;
  graph: unknown;
  layout?: unknown;
  operationalPolicy?: OperationalPolicyPatch;
  permissions?: Permission[];
}): Promise<AutomationProposal> {
  assertNotDemo();
  await assertAutomationPermission(input);
  await assertAutomationProposalStoreAvailable();
  const graph = parseGraph(input.graph);
  const layout = editorLayoutSchema.parse(input.layout ?? emptyLayout());
  if (
    input.localSnapshotHash !== undefined &&
    !/^[0-9a-f]{64}$/i.test(input.localSnapshotHash)
  ) {
    throw ApiError.unprocessable("localSnapshotHash must be a SHA-256 hex digest.");
  }
  // validateGraphForPublish already performs validateGraph(graph) internally;
  // deduplicateValidationIssues guarantees stable unique issues (AI08).
  const issues = deduplicateValidationIssues(
    validateGraphForPublish({ name: input.name, graph }, getAutomationTool),
  );

  let baseRevision: number | null = null;
  let baseContentHash: string | null = null;
  let baseGraph: WorkflowGraphV2 | null = null;
  let baseName: string | null = null;
  let baseDescription: string | null = null;
  let baseOperationalPolicy: OperationalPolicyPatch | null = null;
  if (input.workflowId) {
    const workflow = await getWorkflow({
      workspaceId: input.workspaceId,
      id: input.workflowId,
    });
    if (
      input.expectedRevision === undefined ||
      input.expectedContentHash === undefined
    ) {
      throw ApiError.unprocessable(
        "An existing automation proposal requires its current revision and content hash.",
      );
    }
    if (
      workflow.draftRevision !== input.expectedRevision ||
      workflow.contentHash !== input.expectedContentHash
    ) {
      throw ApiError.conflict(
        "This automation changed before the proposal was prepared. Reload its draft and prepare a new proposal.",
      );
    }
    baseRevision = workflow.draftRevision;
    baseContentHash = workflow.contentHash;
    baseGraph = workflow.graph;
    baseName = workflow.name;
    baseDescription = workflow.description;
    baseOperationalPolicy = workflowOperationalPolicy(workflow);
  }
  const name = input.name.trim().slice(0, 120) || "Untitled automation";
  const description = input.description?.slice(0, 2000) ?? null;
  const diff = diffAutomationProposal({
    before: baseGraph,
    after: graph,
    beforeName: baseName,
    afterName: name,
    beforeDescription: baseDescription,
    afterDescription: description,
    beforeOperationalPolicy: baseOperationalPolicy,
    afterOperationalPolicy: input.operationalPolicy ?? null,
  });

  const [row] = await db
    .insert(automationAiProposals)
    .values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      workflowId: input.workflowId ?? null,
      baseRevision,
      baseContentHash,
      localSnapshotHash: input.localSnapshotHash ?? null,
      name,
      description,
      graph,
      layout,
      operationalPolicy: input.operationalPolicy ?? null,
      diff,
      validationIssues: issues,
      redactionMetadata: { version: 1, secretsRedacted: true },
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    })
    .returning();
  if (!row) throw ApiError.internal("Automation proposal could not be saved.");
  return proposalView(row);
}

/** Return a bounded, hashable graph slice for formal AI patch rebasing. */
export async function getAutomationSubgraph(input: {
  workspaceId: string;
  actorId: string;
  workflowId: string;
  nodeIds?: string[];
  depth?: number;
  cursor?: string;
  limit?: number;
  permissions?: Permission[];
}) {
  await assertAutomationPermission(input);
  const workflow = await getWorkflow({
    workspaceId: input.workspaceId,
    id: input.workflowId,
  });
  return {
    workflowId: workflow.id,
    revision: workflow.draftRevision,
    serverContentHash: workflow.contentHash,
    baseGraphHash: workflow.contentHash,
    subgraph: selectAutomationSubgraph({
      graph: workflow.graph,
      nodeIds: input.nodeIds,
      depth: input.depth,
      cursor: input.cursor,
      limit: input.limit,
    }),
  };
}

export async function getAutomationProposal(input: {
  workspaceId: string;
  actorId: string;
  proposalId: string;
  permissions?: Permission[];
}): Promise<AutomationProposal> {
  await assertAutomationPermission(input);
  await assertAutomationProposalStoreAvailable();
  const [row] = await db
    .select()
    .from(automationAiProposals)
    .where(
      and(
        eq(automationAiProposals.id, input.proposalId),
        eq(automationAiProposals.workspaceId, input.workspaceId),
        eq(automationAiProposals.actorId, input.actorId),
      ),
    )
    .limit(1);
  if (!row) throw ApiError.notFound("Automation proposal not found.");
  if (row.expiresAt <= new Date() && row.status === "prepared") {
    await db
      .update(automationAiProposals)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(automationAiProposals.id, row.id));
    row.status = "expired";
  }
  return proposalView(row);
}

/** Persisted shape of `proposal.simulation`. Ties a coverage report to the
 * exact graph it was computed against, so a later, different graph on the
 * same proposal row can never be treated as already verified. */
export type AutomationProposalSimulation = BranchCoverageReport & {
  /** Semantic hash of the graph this report was computed against. */
  graphHash: string;
  simulatedAt: string;
};

function isProposalSimulation(
  value: unknown,
): value is AutomationProposalSimulation {
  return (
    typeof value === "object" &&
    value !== null &&
    "graphHash" in value &&
    "status" in value &&
    "coveragePercent" in value
  );
}

/**
 * Whether an existing coverage report can satisfy a new simulate /
 * runBranchCoverage request without re-running the simulator.
 *
 * A second simulation in the same turn burns request budget and is the
 * documented way to strand a chat turn with no apply card
 * (system-prompt: "After ONE successful simulation … call
 * applyAutomationProposal immediately"). Reuse only when:
 * - the caller did not explicitly ask to re-run (`force`);
 * - the report was computed against the exact graph now being simulated;
 * - the report did not fail (a failed run must be re-attempted after fixes).
 */
export function shouldReuseProposalSimulation(
  existing: AutomationProposalSimulation | null,
  currentGraphHash: string,
  force: boolean,
): existing is AutomationProposalSimulation {
  if (force) return false;
  if (!existing) return false;
  if (existing.graphHash !== currentGraphHash) return false;
  return existing.status !== "failed";
}

/** Model-facing next step after a simulate / runBranchCoverage tool result. */
export function nextStepAfterAutomationSimulation(result: {
  status: BranchCoverageReport["status"];
  reused?: boolean;
}): string {
  if (result.status === "failed") {
    return "Fix the reported branch failures, then call simulateAutomationProposal again with force: true. Never call applyAutomationProposal on a failed simulation.";
  }
  if (result.reused) {
    return "A passing simulation already exists for this proposal. Call applyAutomationProposal now so the user receives the confirmation card. Do not simulate again or call runBranchCoverage.";
  }
  return "Simulation passed (fixture-only; providers never ran). Call applyAutomationProposal now so the user receives the confirmation card. Do not run another simulation or runBranchCoverage.";
}

/**
 * Simulate an already prepared graph across true/false branches, action
 * failure, approval rejection and wait expiry. This uses only synthetic
 * outcomes and the supplied trigger envelope; it neither invokes providers
 * nor touches workflow state. Unlike the previous single-path simulator,
 * every condition node is exercised on at least one scenario (AI05): no
 * scenario evaluates every condition to `false` only, so a proposal can no
 * longer be reported as "tested" without ever having taken its true branch.
 * The report is persisted keyed by the graph's semantic hash, so
 * `applyAutomationProposal` can verify it still matches the graph being
 * applied.
 *
 * When a non-failed report already covers the same graph, the existing
 * report is returned with `reused: true` unless `force` is set — duplicate
 * simulations are how chat turns run out of budget before apply.
 */
export async function simulateAutomationProposal(input: {
  workspaceId: string;
  actorId: string;
  proposalId: string;
  trigger: unknown;
  conditionContext?: Partial<Omit<ConditionContext, "trigger">>;
  scenarios?: SimulationScenario[];
  permissions?: Permission[];
  /** Re-run even when a passing report already covers this graph. */
  force?: boolean;
}): Promise<AutomationProposalSimulation & { reused: boolean }> {
  assertNotDemo();
  const proposal = await getAutomationProposal(input);
  if (proposal.status !== "prepared") {
    throw ApiError.conflict("Only a prepared proposal can be simulated.");
  }
  const graphHash = semanticGraphHash(proposal.graph);
  if (
    shouldReuseProposalSimulation(
      proposal.simulation,
      graphHash,
      input.force === true,
    )
  ) {
    return { ...proposal.simulation, reused: true };
  }
  const trigger = jsonValueSchema.parse(input.trigger);
  if (!trigger || typeof trigger !== "object" || Array.isArray(trigger)) {
    throw ApiError.unprocessable("A simulation trigger must be a JSON object.");
  }
  const report = runBranchCoverageSimulation({
    graph: proposal.graph,
    trigger: trigger as Record<string, unknown>,
    conditionContext: input.conditionContext,
    preflightIssues: proposal.issues,
    scenarios: input.scenarios,
  });
  const simulation: AutomationProposalSimulation = {
    ...report,
    graphHash,
    simulatedAt: new Date().toISOString(),
  };
  await db
    .update(automationAiProposals)
    .set({ simulation, updatedAt: new Date() })
    .where(
      and(
        eq(automationAiProposals.id, proposal.id),
        eq(automationAiProposals.workspaceId, input.workspaceId),
        eq(automationAiProposals.actorId, input.actorId),
        eq(automationAiProposals.status, "prepared"),
      ),
    );
  return { ...simulation, reused: false };
}

/**
 * Guards apply against a proposal that was never actually exercised on its
 * live branches (AI05/AI06). A proposal must carry a branch-coverage report
 * that (a) exists, (b) was computed against the exact graph now being
 * applied — not a stale graph from before an edit — and (c) did not fail.
 * Partial coverage is allowed through with a warning surfaced by the caller;
 * "not tested" and "stale" are not.
 */
function assertSimulationCoversProposal(proposal: AutomationProposal): void {
  const simulation = proposal.simulation;
  if (!isProposalSimulation(simulation)) {
    throw ApiError.unprocessable(
      "Simulate this automation proposal before applying it. Run simulateAutomationProposal with a representative trigger first.",
    );
  }
  const currentGraphHash = semanticGraphHash(proposal.graph);
  if (simulation.graphHash !== currentGraphHash) {
    throw ApiError.conflict(
      "This proposal's graph changed since it was last simulated. Simulate it again before applying.",
    );
  }
  if (simulation.status === "failed") {
    throw ApiError.unprocessable(
      "The automation proposal's simulation failed. Fix the reported branch failures and simulate again before applying.",
    );
  }
}

/**
 * Apply only a prepared, valid proposal to a draft. This intentionally never
 * calls publishWorkflow and never invokes an automation action handler.
 */
export async function applyAutomationProposal(input: {
  workspaceId: string;
  actorId: string;
  proposalId: string;
  actionId: string;
  previewToken?: string;
  permissions?: Permission[];
}): Promise<{
  proposal: AutomationProposal;
  workflowId: string;
  draftRevision: number;
  replayed: boolean;
}> {
  assertNotDemo();
  await assertAutomationPermission(input);
  const proposal = await getAutomationProposal(input);
  if (
    !proposal.simulation ||
    !verifyAutomationProposalPreviewToken({
      token: input.previewToken,
      proposalId: proposal.id,
      graphHash: proposal.simulation.graphHash,
    })
  ) {
    throw ApiError.unprocessable(
      "A fresh server preview is required before applying this automation proposal.",
    );
  }
  if (proposal.status === "applied") {
    if (proposal.workflowId && proposal.appliedRevision !== null) {
      return {
        proposal,
        workflowId: proposal.workflowId,
        draftRevision: proposal.appliedRevision,
        replayed: true,
      };
    }
    throw ApiError.conflict("This proposal has already been applied.");
  }
  if (proposal.status !== "prepared") {
    throw ApiError.conflict("This proposal is no longer available to apply.");
  }
  if (proposal.issues.length > 0) {
    throw ApiError.unprocessable(
      "Fix the proposal validation issues before applying it.",
      proposal.issues,
    );
  }
  assertSimulationCoversProposal(proposal);

  const [claimed] = await db
    .update(automationAiProposals)
    .set({
      applyActionId: input.actionId,
      status: "applying",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(automationAiProposals.id, input.proposalId),
        eq(automationAiProposals.workspaceId, input.workspaceId),
        eq(automationAiProposals.actorId, input.actorId),
        eq(automationAiProposals.status, "prepared"),
        gt(automationAiProposals.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!claimed) {
    const replay = await getAutomationProposal(input);
    if (
      replay.status === "applied" &&
      replay.workflowId &&
      replay.appliedRevision !== null
    ) {
      return {
        proposal: replay,
        workflowId: replay.workflowId,
        draftRevision: replay.appliedRevision,
        replayed: true,
      };
    }
    throw ApiError.conflict(
      "Another confirmation is already applying this proposal.",
    );
  }

  try {
    let workflowId: string;
    let draftRevision: number;
    if (proposal.workflowId) {
      const workflow = await updateWorkflow({
        workspaceId: input.workspaceId,
        id: proposal.workflowId,
        expectedRevision: proposal.baseRevision ?? undefined,
        actorId: input.actorId,
        graph: proposal.graph,
        layout: proposal.layout,
        patch: {
          name: proposal.name,
          description: proposal.description ?? undefined,
          ...(proposal.operationalPolicy ?? {}),
        },
      });
      workflowId = workflow.id;
      draftRevision = workflow.draftRevision;
    } else {
      const legacy = graphToLegacy(proposal.graph);
      const workflow = await createWorkflow({
        workspaceId: input.workspaceId,
        createdById: input.actorId,
        graph: proposal.graph,
        layout: proposal.layout,
        values: {
          name: proposal.name,
          description: proposal.description ?? undefined,
          enabled: false,
          trigger: legacy.trigger,
          conditions: legacy.conditions,
          actions: legacy.actions.map((action) => ({
            ...action,
            continueOnError: action.continueOnError ?? false,
          })),
          ...(proposal.operationalPolicy ?? {}),
        },
      });
      workflowId = workflow.id;
      draftRevision = workflow.draftRevision;
    }
    const [applied] = await db
      .update(automationAiProposals)
      .set({
        workflowId,
        appliedRevision: draftRevision,
        status: "applied",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(automationAiProposals.id, proposal.id),
          eq(automationAiProposals.status, "applying"),
          eq(automationAiProposals.applyActionId, input.actionId),
        ),
      )
      .returning();
    if (!applied)
      throw ApiError.conflict("Proposal apply receipt could not be finalized.");
    return {
      proposal: proposalView(applied),
      workflowId,
      draftRevision,
      replayed: false,
    };
  } catch (error) {
    // Keep the journal in `applying` until the reconciler can prove whether a
    // draft mutation happened. Marking it rejected here can strand a saved
    // draft behind a proposal that can no longer be replayed after a crash.
    throw error;
  }
}

export function proposalGraphHash(proposal: AutomationProposal): string {
  return semanticGraphHash(proposal.graph);
}

/**
 * Produce a deterministic, reviewable diff without using the live draft. The
 * `before` graph was captured only after its revision/hash passed CAS, so the
 * UI and confirmation card can explain exactly what the proposal intends to
 * change even if the live draft is edited later (which then rejects apply).
 */
export function diffAutomationProposal(input: {
  before: WorkflowGraphV2 | null;
  after: WorkflowGraphV2;
  beforeName: string | null;
  afterName: string;
  beforeDescription: string | null;
  afterDescription: string | null;
  beforeOperationalPolicy?: OperationalPolicyPatch | null;
  afterOperationalPolicy?: OperationalPolicyPatch | null;
}): AutomationProposalDiff {
  const changes: AutomationProposalDiff = [];
  if (input.beforeName !== input.afterName) {
    changes.push({
      kind: "metadata_changed",
      id: "name",
      before: input.beforeName,
      after: input.afterName,
    });
  }
  if (input.beforeDescription !== input.afterDescription) {
    changes.push({
      kind: "metadata_changed",
      id: "description",
      before: input.beforeDescription,
      after: input.afterDescription,
    });
  }
  if (
    canonicalJson(input.beforeOperationalPolicy ?? null) !==
    canonicalJson(input.afterOperationalPolicy ?? null)
  ) {
    changes.push({
      kind: "metadata_changed",
      id: "operationalPolicy",
      before: input.beforeOperationalPolicy ?? null,
      after: input.afterOperationalPolicy ?? null,
    });
  }
  const before = input.before;
  const compare = <T extends { id: string }>(
    kind: "node" | "edge",
    previous: readonly T[],
    next: readonly T[],
  ) => {
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const nextById = new Map(next.map((item) => [item.id, item]));
    for (const id of [...nextById.keys()].sort()) {
      const nextItem = nextById.get(id)!;
      const previousItem = previousById.get(id);
      if (!previousItem) {
        changes.push({
          kind: `${kind}_added` as "node_added" | "edge_added",
          id,
          after: nextItem,
        });
      } else if (canonicalJson(previousItem) !== canonicalJson(nextItem)) {
        changes.push({
          kind: `${kind}_changed` as "node_changed" | "edge_changed",
          id,
          before: previousItem,
          after: nextItem,
        });
      }
    }
    for (const id of [...previousById.keys()].sort()) {
      if (!nextById.has(id)) {
        changes.push({
          kind: `${kind}_removed` as "node_removed" | "edge_removed",
          id,
          before: previousById.get(id)!,
        });
      }
    }
  };
  compare("node", before?.nodes ?? [], input.after.nodes);
  compare("edge", before?.edges ?? [], input.after.edges);
  return changes;
}
