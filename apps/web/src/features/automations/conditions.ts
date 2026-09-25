import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db, aiEvaluations, applications, candidates, jobs } from "@harly/db";

import type {
  ConditionNode,
  Conditions,
  FieldRef,
  LeafCondition,
  Operator,
} from "./schema";

/**
 * The condition evaluator (§2.4). Pure and deterministic: given a condition
 * tree and a context, returns { matched, evaluated }. No I/O, no LLM. The
 * engine loads the context once (loadConditionContext) and calls
 * evaluateConditions; tests construct contexts directly.
 *
 * Field paths map to properties of the context objects. Unknown fields and
 * type mismatches evaluate to `false` (fail-safe) rather than throwing — a
 * misconfigured workflow should skip, not crash the hiring flow.
 */

// ---------------------------------------------------------------------------
// Context — what the evaluator reads from
// ---------------------------------------------------------------------------

export type ConditionContext = {
  workspaceId: string;
  candidate: Record<string, unknown> | null;
  application: Record<string, unknown> | null;
  job: Record<string, unknown> | null;
  ai: Record<string, unknown> | null;
  /** Raw trigger payload — the `data` of the emitted event. */
  trigger: Record<string, unknown>;
};

/**
 * Load the context for a run in a single join: candidate + application + job +
 * latest AI evaluation for that application. Any entity that can't be resolved
 * (e.g. a `candidate.created` event with no application yet) is null — the
 * evaluator treats null entities as missing fields.
 *
 * The trigger payload is passed in by the caller (the engine).
 */
export async function loadConditionContext(input: {
  workspaceId: string;
  applicationId: string | null;
  candidateId: string | null;
  jobId?: string | null;
  trigger: Record<string, unknown>;
  /** Keep runtime reads on the same tenant/database boundary as the run. */
  database?: typeof db;
}): Promise<ConditionContext> {
  const database = input.database ?? db;
  let candidate: Record<string, unknown> | null = null;
  let application: Record<string, unknown> | null = null;
  let job: Record<string, unknown> | null = null;
  let ai: Record<string, unknown> | null = null;

  if (input.applicationId) {
    const [row] = await database
      .select({
        application: applications,
        candidate: candidates,
        job: jobs,
      })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.workspaceId, input.workspaceId),
          eq(candidates.id, applications.candidateId),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.workspaceId, input.workspaceId),
          eq(jobs.id, applications.jobId),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.id, input.applicationId),
        ),
      )
      .limit(1);

    if (row) {
      application = row.application as unknown as Record<string, unknown>;
      candidate = row.candidate as unknown as Record<string, unknown>;
      job = row.job as unknown as Record<string, unknown>;

      const [aiRow] = await database
        .select()
        .from(aiEvaluations)
        .where(
          and(
            eq(aiEvaluations.workspaceId, input.workspaceId),
            eq(aiEvaluations.applicationId, input.applicationId),
          ),
        )
        .orderBy(desc(aiEvaluations.createdAt))
        .limit(1);
      if (aiRow) ai = aiRow as unknown as Record<string, unknown>;
    }
  } else if (input.candidateId) {
    const [row] = await database
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, input.workspaceId),
          eq(candidates.id, input.candidateId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (row) candidate = row as unknown as Record<string, unknown>;
  }

  // A job-published event has no application; resolve the job directly.
  if (!job && input.jobId) {
    const [row] = await database
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, input.workspaceId),
          eq(jobs.id, input.jobId),
          isNull(jobs.deletedAt),
        ),
      )
      .limit(1);
    if (row) job = row as unknown as Record<string, unknown>;
  }

  return {
    workspaceId: input.workspaceId,
    candidate,
    application,
    job,
    ai,
    trigger: input.trigger,
  };
}

// ---------------------------------------------------------------------------
// Field resolution
// ---------------------------------------------------------------------------

/** Resolve a FieldRef to a value (or undefined if the field is missing). */
function resolveField(ref: FieldRef, ctx: ConditionContext): unknown {
  if (ref.kind === "literal") return ref.value;

  const bucket: Record<string, unknown> | null = (() => {
    switch (ref.kind) {
      case "candidate":
        return ctx.candidate;
      case "application":
        return ctx.application;
      case "job":
        return ctx.job;
      case "ai":
        return ctx.ai;
      case "trigger":
        return ctx.trigger;
    }
  })();

  if (!bucket) return undefined;
  return bucket[ref.path];
}

function isSet(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/**
 * Evaluate a single operator against a resolved left and the provided right.
 * `is_set`/`is_empty` ignore `right`; `regex` compiles the pattern once.
 *
 * Returns false on type mismatches instead of throwing (fail-safe).
 */
function applyOp(op: Operator, left: unknown, right: unknown): boolean {
  switch (op) {
    case "is_set":
      return isSet(left);
    case "is_empty":
      return !isSet(left);

    case "eq": {
      if (typeof left === "string" && typeof right === "string") {
        return left.trim().toLowerCase() === right.trim().toLowerCase();
      }
      return left === right;
    }
    case "ne": {
      if (left === undefined || left === null) return false;
      if (typeof left === "string" && typeof right === "string") {
        return left.trim().toLowerCase() !== right.trim().toLowerCase();
      }
      return left !== right;
    }

    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (
        typeof left !== "number" ||
        typeof right !== "number"
      )
        return false;
      switch (op) {
        case "gt": return left > right;
        case "gte": return left >= right;
        case "lt": return left < right;
        case "lte": return left <= right;
      }
      return false; // unreachable
    }

    case "in": {
      // left in right: right must be an array (or single value treated as 1-array).
      const haystack = asArray(right);
      return haystack.some((item) => {
        if (typeof item === "string" && typeof left === "string") {
          return item.trim().toLowerCase() === left.trim().toLowerCase();
        }
        return item === left;
      });
    }
    case "not_in": {
      if (left === undefined || left === null) return false;
      const haystack = asArray(right);
      return !haystack.some((item) => {
        if (typeof item === "string" && typeof left === "string") {
          return item.trim().toLowerCase() === left.trim().toLowerCase();
        }
        return item === left;
      });
    }

    case "includes": {
      // left is an array that contains right.
      if (!Array.isArray(left)) return false;
      return left.some((item) => {
        if (typeof item === "string" && typeof right === "string") {
          return item.trim().toLowerCase() === right.trim().toLowerCase();
        }
        return item === right;
      });
    }
    case "match_any": {
      // left and right are arrays; true if they intersect.
      if (!Array.isArray(left) || !Array.isArray(right)) return false;
      const set = new Set(left.map((item) => typeof item === "string" ? item.trim().toLowerCase() : item));
      return right.some((item) => set.has(typeof item === "string" ? item.trim().toLowerCase() : item));
    }

    case "starts_with":
    case "ends_with":
    case "contains": {
      const l = asString(left);
      const r = asString(right);
      if (l === undefined || r === undefined) return false;
      const lowerL = l.toLowerCase();
      const lowerR = r.toLowerCase();
      switch (op) {
        case "starts_with": return lowerL.startsWith(lowerR);
        case "ends_with": return lowerL.endsWith(lowerR);
        case "contains": return lowerL.includes(lowerR);
      }
      return false; // unreachable
    }

    case "regex": {
      const l = asString(left);
      const r = asString(right);
      if (l === undefined || r === undefined) return false;
      try {
        return new RegExp(r, "u").test(l);
      } catch {
        return false; // invalid pattern → fail-safe
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type LeafEvaluation = {
  field: FieldRef;
  op: Operator;
  left: unknown;
  right: unknown;
  matched: boolean;
};

export type ConditionEvaluation =
  | { kind: "leaf"; matched: boolean; detail: LeafEvaluation }
  | { kind: "and"; matched: boolean; children: ConditionEvaluation[] }
  | { kind: "or"; matched: boolean; children: ConditionEvaluation[] }
  | { kind: "not"; matched: boolean; child: ConditionEvaluation };

function evaluateNode(node: ConditionNode, ctx: ConditionContext): ConditionEvaluation {
  switch (node.type) {
    case "leaf":
      return evaluateLeaf(node, ctx);
    case "and": {
      const children = node.children.map((child) => evaluateNode(child, ctx));
      return { kind: "and", matched: children.every((c) => c.matched), children };
    }
    case "or": {
      const children = node.children.map((child) => evaluateNode(child, ctx));
      return { kind: "or", matched: children.some((c) => c.matched), children };
    }
    case "not": {
      const child = evaluateNode(node.child, ctx);
      return { kind: "not", matched: !child.matched, child };
    }
  }
}

function evaluateLeaf(node: LeafCondition, ctx: ConditionContext): ConditionEvaluation {
  const left = resolveField(node.field, ctx);
  const matched = applyOp(node.op, left, node.value);
  return {
    kind: "leaf",
    matched,
    detail: { field: node.field, op: node.op, left, right: node.value, matched },
  };
}

export type ConditionsResult = {
  matched: boolean;
  /** One evaluation per root condition; empty when there are no conditions. */
  evaluated: ConditionEvaluation[];
};

/**
 * Evaluate the roots of a conditions array. An empty array (no conditions)
 * always matches — that's the "WHEN X → DO Y (no IF)" case.
 */
export function evaluateConditions(
  conditions: Conditions,
  ctx: ConditionContext,
): ConditionsResult {
  const evaluated = conditions.map((node) => evaluateNode(node, ctx));
  return { matched: evaluated.every((node) => node.matched), evaluated };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalarEquals(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.trim().toLowerCase() === expected.trim().toLowerCase();
  }
  return actual === expected;
}

/**
 * Domain events nest ids (`application.jobId`, `toStageId`) while the builder
 * writes flat filter keys (`jobId`, `toStageName`). Resolve both shapes.
 */
export function readTriggerFilterValue(
  payload: Record<string, unknown>,
  key: string,
): unknown {
  if (payload[key] !== undefined) return payload[key];

  const app = isRecord(payload.application) ? payload.application : undefined;
  const candidate = isRecord(payload.candidate) ? payload.candidate : undefined;
  const job = isRecord(payload.job) ? payload.job : undefined;
  const interview = isRecord(payload.interview) ? payload.interview : undefined;
  const toStage = isRecord(payload.toStage) ? payload.toStage : undefined;

  switch (key) {
    case "jobId":
      return payload.jobId ?? app?.jobId ?? job?.id ?? interview?.jobId;
    case "toStageId":
    case "stageId":
      return (
        payload.toStageId ??
        payload.stageId ??
        app?.currentStageId ??
        toStage?.id
      );
    case "toStageName":
    case "stageName":
      return payload.toStageName ?? payload.stageName ?? toStage?.name;
    case "fromStageId":
      return payload.fromStageId;
    case "candidateId":
      return (
        payload.candidateId ??
        candidate?.id ??
        app?.candidateId ??
        interview?.candidateId
      );
    case "applicationId":
      return payload.applicationId ?? app?.id ?? interview?.applicationId;
    case "source":
      return payload.source ?? app?.source ?? candidate?.source;
    default:
      return app?.[key] ?? candidate?.[key] ?? job?.[key] ?? interview?.[key];
  }
}

/**
 * Cheap evaluation of a trigger filter against the event payload (§2.3).
 * Returns true when the workflow should fire. Each filter key must match:
 * a scalar value uses equality (strings case-insensitive), an array value
 * uses membership (`in`). Empty filter values are ignored.
 */
export function matchesTriggerFilter(
  filter: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!filter) return true;
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined || expected === null || expected === "") continue;
    const actual = readTriggerFilterValue(payload, key);
    if (Array.isArray(expected)) {
      if (!expected.some((item) => scalarEquals(actual, item))) return false;
    } else if (!scalarEquals(actual, expected)) {
      return false;
    }
  }
  return true;
}
