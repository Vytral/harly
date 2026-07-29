import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  jobStages,
  jobs,
  member as authMembers,
  user as authUsers,
} from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import { createLogger } from "@/lib/logger";

import { loadConditionContext, evaluateConditions, type ConditionEvaluation } from "./conditions";
import {
  conditionsSchema,
  triggerSchema,
  type Conditions,
  type Operator,
  type Trigger,
} from "./schema";
import { operatorMeta } from "./builder/catalog";

const log = createLogger("automations");

/**
 * Server-side data the builder needs that can't be derived client-side:
 *  - the workspace's members (for the create_task assignee picker), and
 *  - the distinct stage names across all jobs (for the move_stage picker,
 *    since stages are per-job but the workflow runs before we know the job).
 *
 * Both are workspace-scoped. The builder receives these as props and never
 * queries the DB itself.
 */
export async function getBuilderData() {
  const context = await getWorkspaceContext();
  const workspaceId = context.organization.id;

  const [members, stageRows] = await Promise.all([
    db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authMembers.role,
      })
      .from(authMembers)
      .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
      .where(eq(authMembers.organizationId, workspaceId))
      .orderBy(
        sql`case ${authMembers.role} when 'owner' then 0 when 'admin' then 1 when 'recruiter' then 2 else 3 end`,
        authUsers.name,
      ),
    db
      .select({ name: jobStages.name })
      .from(jobStages)
      .where(eq(jobStages.workspaceId, workspaceId))
      .orderBy(asc(jobStages.name)),
  ]);

  // Distinct stage names (a name can recur across jobs).
  const stageNames = Array.from(new Set(stageRows.map((r) => r.name))).sort();

  return {
    members: members.map((m) => ({ id: m.id, name: m.name || m.email })),
    stageNames,
  };
}

export type BuilderData = Awaited<ReturnType<typeof getBuilderData>>;

// ---------------------------------------------------------------------------
// Dry-run (T5) — evaluate a draft against a sample candidate, no side effects
// ---------------------------------------------------------------------------

/** Render a single ConditionEvaluation node as a human-readable line. */
function summarizeEval(node: ConditionEvaluation): { text: string; matched: boolean } {
  if (node.kind === "leaf") {
    const { field, op, matched } = node.detail;
    const opLabel = operatorMeta(op as Operator).label;
    const lhs =
      field.kind === "literal" ? "literal" : `${field.kind}.${field.path}`;
    const wantsValue = operatorMeta(op as Operator).wantsValue;
    const rhs = wantsValue ? ` ${formatValue(node.detail.right)}` : "";
    return { text: `${lhs} ${opLabel}${rhs}`, matched };
  }
  if (node.kind === "and" || node.kind === "or") {
    const join = node.kind === "and" ? "AND" : "OR";
    const inner = node.children
      .map((child: ConditionEvaluation) => summarizeEval(child).text)
      .join(` ${join} `);
    return { text: `(${inner})`, matched: node.matched };
  }
  // not
  const inner = summarizeEval(node.child);
  return { text: `NOT ${inner.text}`, matched: node.matched };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "string") return value.length > 24 ? `"${value.slice(0, 24)}…"` : `"${value}"`;
  if (Array.isArray(value)) return `[${value.length}]`;
  return String(value);
}

/**
 * Pick a realistic sample to dry-run against: the workspace's most recently
 * updated candidate, resolved to their latest application (so candidate +
 * application + job + ai context all populate when available). Falls back to
 * the candidate alone when they have no applications yet.
 */
async function resolveSample(workspaceId: string, candidateId?: string) {
  let candId = candidateId;
  if (!candId) {
    const [latest] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.workspaceId, workspaceId), isNull(candidates.deletedAt)))
      .orderBy(desc(candidates.updatedAt))
      .limit(1);
    if (!latest) return null;
    candId = latest.id;
  }

  // Latest application for this candidate, to load full context.
  const [app] = await db
    .select({ id: applications.id, jobId: applications.jobId })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.candidateId, candId),
      ),
    )
    .orderBy(desc(applications.updatedAt))
    .limit(1);

  return { candidateId: candId, applicationId: app?.id ?? null, jobId: app?.jobId ?? null };
}

/**
 * Evaluate a *draft* workflow's condition tree against a real sample candidate
 * without persisting a run or running any action (trade-off T5). Used by the
 * builder's "Test" button so a recruiter can see whether their IF would have
 * matched before activating.
 *
 * The draft is validated with the shared Zod schemas (never trust raw client
 * input). Returns `{ matched, evaluated }` where `evaluated` is a per-root-node
 * breakdown for the timeline UI. Errors become `{ matched: false, error }`.
 */
export async function dryRunWorkflow(input: {
  trigger: Trigger;
  conditions?: Conditions;
  candidateId?: string;
}): Promise<{
  matched: boolean;
  evaluated: Array<{ text: string; matched: boolean }>;
  error?: string;
}> {
  let context;
  try {
    context = await getWorkspaceContext();
  } catch {
    return { matched: false, evaluated: [], error: "Not authenticated." };
  }

  // Validate the draft the same way persistence will, so a dry-run reflects
  // what a real run would see (no silent acceptance of malformed input).
  let conditions: Conditions;
  try {
    triggerSchema.parse(input.trigger);
    conditions = conditionsSchema.parse(input.conditions ?? []);
  } catch (error) {
    return {
      matched: false,
      evaluated: [],
      error: error instanceof Error ? error.message : "Invalid workflow draft.",
    };
  }

  if (conditions.length === 0) {
    return {
      matched: true,
      evaluated: [{ text: "No conditions — always matches.", matched: true }],
    };
  }

  try {
    const sample = await resolveSample(context.organization.id, input.candidateId);
    if (!sample) {
      return {
        matched: false,
        evaluated: [],
        error: "No candidate found to test against. Create a candidate first.",
      };
    }

    const ctx = await loadConditionContext({
      workspaceId: context.organization.id,
      applicationId: sample.applicationId,
      candidateId: sample.candidateId,
      jobId: sample.jobId,
      // The draft's trigger.event isn't a real emission here; the trigger
      // bucket is empty so trigger.* fields read as unset (honest, not faked).
      trigger: {},
    });

    const result = evaluateConditions(conditions, ctx);
    return {
      matched: result.matched,
      evaluated: result.evaluated.map(summarizeEval),
    };
  } catch (error) {
    log.error(error, "[automations] dryRunWorkflow failed");
    return {
      matched: false,
      evaluated: [],
      error: error instanceof Error ? error.message : "Dry-run failed.",
    };
  }
}
