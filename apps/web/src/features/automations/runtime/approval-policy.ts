import { jsonValueSchema, type WorkflowNode } from "../definition/schema-v2";

type ApprovalNode = Extract<WorkflowNode, { type: "approval" }>;

export type EffectiveApprovalPolicy = {
  eligibleActorIds: string[];
  rule: ApprovalNode["rule"];
};

/**
 * The published graph is immutable, but the effective approval policy must
 * also survive a later graph edit and a worker restart. New waits persist this
 * snapshot in inputSnapshot; the graph remains the safe fallback for legacy
 * executions created before the snapshot was introduced.
 */
export function effectiveApprovalPolicy(
  node: ApprovalNode,
  inputSnapshot: unknown,
): EffectiveApprovalPolicy {
  const parsed = jsonValueSchema.safeParse(inputSnapshot);
  if (parsed.success && parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) {
    const ids = parsed.data.eligibleActorIds;
    const rule = parsed.data.rule;
    if (
      Array.isArray(ids) &&
      ids.length > 0 &&
      ids.every((value): value is string => typeof value === "string" && value.length > 0) &&
      (rule === "any" || rule === "all")
    ) {
      return { eligibleActorIds: [...ids], rule };
    }
  }
  return { eligibleActorIds: [...node.eligibleActorIds], rule: node.rule };
}

