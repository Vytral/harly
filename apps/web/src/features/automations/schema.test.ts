import { describe, expect, it } from "vitest";

import {
  ACTION_TYPES,
  MAX_ACTIONS_PER_WORKFLOW,
  OPERATORS,
  WORKFLOW_EVENTS,
  actionSchema,
  actionsSchema,
  conditionsSchema,
  fieldRefSchema,
  isActionType,
  isWorkflowEvent,
  triggerEventOf,
  triggerSchema,
  workflowInputSchema,
} from "./schema";

describe("automations schema — triggers", () => {
  it("accepts a trigger with just an event", () => {
    const parsed = triggerSchema.parse({ event: "application.created" });
    expect(parsed).toEqual({ event: "application.created", filter: undefined });
  });

  it("accepts a trigger with a filter", () => {
    const parsed = triggerSchema.parse({
      event: "application.created",
      filter: { jobId: "job-1", source: "LinkedIn" },
    });
    expect(parsed.filter).toEqual({ jobId: "job-1", source: "LinkedIn" });
  });

  it("accepts array filter values (in-membership)", () => {
    const parsed = triggerSchema.parse({
      event: "application.stage_changed",
      filter: { toStageId: ["stage-a", "stage-b"] },
    });
    expect(parsed.filter?.toStageId).toEqual(["stage-a", "stage-b"]);
  });

  it("rejects an unknown event", () => {
    const res = triggerSchema.safeParse({ event: "candidate.deleted" });
    expect(res.success).toBe(false);
  });

  it("rejects a non-event string", () => {
    const res = triggerSchema.safeParse({ event: "something.else" });
    expect(res.success).toBe(false);
  });

  it("rejects a filter with nested objects", () => {
    const res = triggerSchema.safeParse({
      event: "application.created",
      filter: { nested: { oops: true } },
    });
    expect(res.success).toBe(false);
  });

  it("exports the full event catalog", () => {
    expect(WORKFLOW_EVENTS).toContain("application.created");
    expect(WORKFLOW_EVENTS).toContain("job.published");
    expect(isWorkflowEvent("application.created")).toBe(true);
    expect(isWorkflowEvent("nope")).toBe(false);
  });

  it("triggerEventOf returns the event", () => {
    expect(
      triggerEventOf({ event: "interview.completed", filter: undefined }),
    ).toBe("interview.completed");
  });
});

describe("automations schema — field refs", () => {
  it("accepts each kind", () => {
    for (const kind of ["candidate", "application", "job", "ai", "trigger"] as const) {
      const res = fieldRefSchema.safeParse({ kind, path: "experienceYears" });
      expect(res.success).toBe(true);
    }
  });

  it("accepts a literal field ref", () => {
    const res = fieldRefSchema.safeParse({ kind: "literal", value: 42 });
    expect(res.success).toBe(true);
  });

  it("accepts a literal array", () => {
    const res = fieldRefSchema.safeParse({ kind: "literal", value: ["React", "Vue"] });
    expect(res.success).toBe(true);
  });

  it("rejects a field ref missing path", () => {
    const res = fieldRefSchema.safeParse({ kind: "candidate" });
    expect(res.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const res = fieldRefSchema.safeParse({ kind: "company", path: "x" });
    expect(res.success).toBe(false);
  });
});

describe("automations schema — conditions tree", () => {
  it("accepts a single leaf", () => {
    const cond = {
      type: "leaf",
      field: { kind: "candidate", path: "experienceYears" },
      op: "lt",
      value: 2,
    };
    const parsed = conditionsSchema.parse(cond);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: "leaf", op: "lt", value: 2 });
  });

  it("accepts an AND group with children", () => {
    const cond = {
      type: "and",
      children: [
        {
          type: "leaf",
          field: { kind: "candidate", path: "experienceYears" },
          op: "gt",
          value: 3,
        },
        {
          type: "leaf",
          field: { kind: "candidate", path: "skills" },
          op: "includes",
          value: "React",
        },
      ],
    };
    const parsed = conditionsSchema.parse(cond);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].type).toBe("and");
  });

  it("accepts nested AND/OR/NOT", () => {
    const cond = {
      type: "or",
      children: [
        { type: "not", child: { type: "leaf", field: { kind: "ai", path: "recommendation" }, op: "eq", value: "no" } },
        {
          type: "and",
          children: [
            { type: "leaf", field: { kind: "candidate", path: "location" }, op: "contains", value: "Berlin" },
            { type: "leaf", field: { kind: "application", path: "source" }, op: "eq", value: "LinkedIn" },
          ],
        },
      ],
    };
    const parsed = conditionsSchema.parse(cond);
    expect(parsed[0].type).toBe("or");
  });

  it("normalizes a single node into a one-element array", () => {
    const cond = { type: "leaf", field: { kind: "candidate", path: "experienceYears" }, op: "is_set", value: null };
    const parsed = conditionsSchema.parse(cond);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it("normalizes undefined to an empty array (always match)", () => {
    const parsed = conditionsSchema.parse(undefined);
    expect(parsed).toEqual([]);
  });

  it("accepts an array of roots (implicit AND)", () => {
    const cond = [
      { type: "leaf", field: { kind: "candidate", path: "experienceYears" }, op: "lt", value: 2 },
      { type: "leaf", field: { kind: "application", path: "source" }, op: "eq", value: "LinkedIn" },
    ];
    const parsed = conditionsSchema.parse(cond);
    expect(parsed).toHaveLength(2);
  });

  it("rejects an unknown operator", () => {
    const res = conditionsSchema.safeParse({
      type: "leaf",
      field: { kind: "candidate", path: "experienceYears" },
      op: "greater_than", // not in OPERATORS
      value: 2,
    });
    expect(res.success).toBe(false);
  });

  it("rejects a leaf missing the field", () => {
    const res = conditionsSchema.safeParse({ type: "leaf", op: "eq", value: 1 });
    expect(res.success).toBe(false);
  });

  it("rejects a `not` with multiple children", () => {
    const res = conditionsSchema.safeParse({
      type: "not",
      children: [{ type: "leaf", field: { kind: "candidate", path: "x" }, op: "eq", value: 1 }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects an and group with > 50 children", () => {
    const child = { type: "leaf", field: { kind: "candidate", path: "x" }, op: "eq", value: 1 };
    const res = conditionsSchema.safeParse({ type: "and", children: Array(51).fill(child) });
    expect(res.success).toBe(false);
  });

  it("exports the operator catalog", () => {
    expect(OPERATORS).toContain("eq");
    expect(OPERATORS).toContain("match_any");
    expect(OPERATORS).toContain("regex");
  });
});

describe("automations schema — actions", () => {
  it("accepts a move_stage action", () => {
    const res = actionSchema.safeParse({ type: "move_stage", config: { toStageId: "stage-1" } });
    expect(res.success).toBe(true);
  });

  it("defaults continueOnError to false", () => {
    const parsed = actionSchema.parse({ type: "add_note", config: { body: "hi" } });
    expect(parsed.continueOnError).toBe(false);
  });

  it("accepts continueOnError true", () => {
    const parsed = actionSchema.parse({ type: "send_slack", config: {}, continueOnError: true });
    expect(parsed.continueOnError).toBe(true);
  });

  it("rejects an unknown action type", () => {
    const res = actionSchema.safeParse({ type: "delete_candidate", config: {} });
    expect(res.success).toBe(false);
  });

  it("rejects a non-object config", () => {
    const res = actionSchema.safeParse({ type: "move_stage", config: "stage-1" });
    expect(res.success).toBe(false);
  });

  it("enforces the v1 cap of 10 actions", () => {
    const actions = Array(MAX_ACTIONS_PER_WORKFLOW).fill({
      type: "add_note",
      config: { body: "hi" },
    });
    expect(actionsSchema.safeParse(actions).success).toBe(true);

    const tooMany = Array(MAX_ACTIONS_PER_WORKFLOW + 1).fill({
      type: "add_note",
      config: { body: "hi" },
    });
    expect(actionsSchema.safeParse(tooMany).success).toBe(false);
  });

  it("exports the action type catalog", () => {
    expect(ACTION_TYPES).toContain("move_stage");
    expect(ACTION_TYPES).toContain("http_request");
    expect(ACTION_TYPES).toContain("ai_score");
    expect(isActionType("move_stage")).toBe(true);
    expect(isActionType("bogus")).toBe(false);
  });
});

describe("automations schema — workflow input", () => {
  const validInput = {
    name: "Auto-reject < 2 years",
    trigger: { event: "application.created" },
    actions: [{ type: "set_status", config: { status: "rejected" } }],
  };

  it("accepts a minimal valid workflow", () => {
    const parsed = workflowInputSchema.parse(validInput);
    expect(parsed.name).toBe("Auto-reject < 2 years");
    expect(parsed.enabled).toBe(true);
    // `conditions` is optional on input; the data layer normalizes to [].
    expect(parsed.conditions).toBeUndefined();
  });

  it("accepts a full workflow with conditions and filter", () => {
    const parsed = workflowInputSchema.parse({
      ...validInput,
      description: "Reject juniors automatically",
      enabled: false,
      trigger: { event: "application.created", filter: { jobId: "job-1" } },
      conditions: [
        {
          type: "leaf",
          field: { kind: "candidate", path: "experienceYears" },
          op: "lt",
          value: 2,
        },
      ],
    });
    expect(parsed.enabled).toBe(false);
    expect(parsed.conditions).toHaveLength(1);
  });

  it("accepts bounded operational guardrails", () => {
    const parsed = workflowInputSchema.parse({
      ...validInput,
      maxRunsPerMinute: 120,
      maxExternalActionsPerMinute: 40,
      circuitBreakerThreshold: 6,
      circuitBreakerCooldownSeconds: 600,
    });
    expect(parsed.maxRunsPerMinute).toBe(120);
    expect(parsed.circuitBreakerCooldownSeconds).toBe(600);
  });

  it("rejects unsafe operational guardrail values", () => {
    const res = workflowInputSchema.safeParse({
      ...validInput,
      maxRunsPerMinute: 0,
      circuitBreakerCooldownSeconds: 1,
    });
    expect(res.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const res = workflowInputSchema.safeParse({ ...validInput, name: "" });
    expect(res.success).toBe(false);
  });

  it("rejects an empty actions array (a workflow must do something)", () => {
    const res = workflowInputSchema.safeParse({ ...validInput, actions: [] });
    expect(res.success).toBe(false);
  });

  it("rejects more than 10 actions at the workflow level", () => {
    const res = workflowInputSchema.safeParse({
      ...validInput,
      actions: Array(11).fill({ type: "add_note", config: { body: "hi" } }),
    });
    expect(res.success).toBe(false);
  });

  it("rejects a workflow without a trigger", () => {
    const res = workflowInputSchema.safeParse({ name: "x", actions: validInput.actions });
    expect(res.success).toBe(false);
  });
});
