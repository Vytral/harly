import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  validateGraphForPublish,
  validateWorkflowForPublish,
} from "./publish-validation";
import { UNTITLED_WORKFLOW_NAME, type ActionType } from "./schema";
import type { WorkflowGraphV2 } from "./definition/schema-v2";

const moveStageSchema = z
  .object({
    toStageId: z.string().min(1).optional(),
    toStageName: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.toStageId || data.toStageName), {
    message: "Either toStageId or toStageName must be provided.",
  });

function getHandler(type: ActionType) {
  if (type === "move_stage") return { schema: moveStageSchema };
  if (type === "add_note")
    return { schema: z.object({ body: z.string().trim().min(1) }) };
  return undefined;
}

const trigger = { event: "application.stage_changed" as const };

const branchedGraph: WorkflowGraphV2 = {
  schemaVersion: 2,
  entryNodeId: "trigger",
  nodes: [
    { id: "trigger", type: "trigger", event: "application.stage_changed" },
    { id: "condition", type: "condition", tree: [] },
    {
      id: "yes",
      type: "action",
      actionType: "add_note",
      toolVersion: 1,
      failurePolicy: "stop",
      input: { body: { kind: "literal", value: "Review" } },
    },
    {
      id: "no",
      type: "action",
      actionType: "ai_decide",
      toolVersion: 1,
      failurePolicy: "stop",
      input: {},
    },
    { id: "done", type: "end", result: "completed" },
  ],
  edges: [
    { id: "e1", source: "trigger", port: "next", target: "condition" },
    { id: "e2", source: "condition", port: "true", target: "yes" },
    { id: "e3", source: "condition", port: "false", target: "no" },
    { id: "e4", source: "yes", port: "success", target: "done" },
    { id: "e5", source: "no", port: "success", target: "done" },
  ],
};

describe("T02 — publish validation", () => {
  it("blocks an untitled empty draft with per-node issues", () => {
    const issues = validateWorkflowForPublish(
      { name: "", trigger, actions: [] },
      getHandler,
    );
    expect(issues.map((issue) => issue.nodeId).sort()).toEqual([
      "actions",
      "name",
    ]);
  });

  it("treats the untitled placeholder as unnamed", () => {
    const issues = validateWorkflowForPublish(
      {
        name: UNTITLED_WORKFLOW_NAME,
        trigger,
        actions: [
          { type: "add_note", config: { body: "hi" }, continueOnError: false },
        ],
      },
      getHandler,
    );
    expect(issues.some((issue) => issue.nodeId === "name")).toBe(true);
  });

  it("allows saving-shaped invalid action config to be rejected only at publish", () => {
    const issues = validateWorkflowForPublish(
      {
        name: "Move to offer",
        trigger,
        actions: [{ type: "move_stage", config: {}, continueOnError: false }],
      },
      getHandler,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.nodeId).toBe("action:0");
    expect(issues[0]?.message).toMatch(/toStageId or toStageName/i);
  });

  it("rejects an action type with no handler", () => {
    const issues = validateWorkflowForPublish(
      {
        name: "AI decide",
        trigger,
        actions: [{ type: "ai_decide", config: {}, continueOnError: false }],
      },
      getHandler,
    );
    expect(issues[0]?.nodeId).toBe("action:0");
    expect(issues[0]?.message).toMatch(/not available/i);
  });

  it("accepts a complete recipe", () => {
    const issues = validateWorkflowForPublish(
      {
        name: "Move to offer",
        trigger,
        actions: [
          {
            type: "move_stage",
            config: { toStageName: "Offer" },
            continueOnError: false,
          },
        ],
      },
      getHandler,
    );
    expect(issues).toEqual([]);
  });

  it("checks every action branch without projecting the graph to legacy actions", () => {
    const issues = validateGraphForPublish(
      { name: "Branched workflow", graph: branchedGraph },
      getHandler,
    );

    expect(
      issues.some(
        (issue) =>
          issue.nodeId === "no" && /not available/i.test(issue.message),
      ),
    ).toBe(true);
  });

  it("blocks actions whose required target is not guaranteed by the trigger", () => {
    const graph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "job.published" },
        {
          id: "move",
          type: "action",
          actionType: "move_stage",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { toStageName: { kind: "literal", value: "Interview" } },
        },
        { id: "done", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "move" },
        { id: "e2", source: "move", port: "success", target: "done" },
      ],
    };

    const issues = validateGraphForPublish(
      { name: "Invalid target", graph },
      getHandler,
    );
    expect(
      issues.some(
        (issue) =>
          issue.nodeId === "move" &&
          /does not guarantee the application/i.test(issue.message),
      ),
    ).toBe(true);
  });

  it("blocks v2 actions whose required literal configuration is missing or invalid", () => {
    const graph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        {
          id: "note",
          type: "action",
          actionType: "add_note",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { body: { kind: "literal", value: "   " } },
        },
        { id: "done", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "note" },
        { id: "e2", source: "note", port: "success", target: "done" },
      ],
    };

    const issues = validateGraphForPublish(
      { name: "Add candidate note", graph },
      getHandler,
    );

    expect(issues).toEqual([
      expect.objectContaining({
        nodeId: "note",
        fieldPath: "input.body",
        message: expect.stringMatching(/character/i),
      }),
    ]);
  });

  it("allows required action fields sourced from runtime bindings", () => {
    const graph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        {
          id: "note",
          type: "action",
          actionType: "add_note",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { body: { kind: "trigger", path: "candidate.firstName" } },
        },
        { id: "done", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "note" },
        { id: "e2", source: "note", port: "success", target: "done" },
      ],
    };

    expect(
      validateGraphForPublish({ name: "Personal note", graph }, getHandler),
    ).toEqual([]);
  });
});
