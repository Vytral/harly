import type { ActionType, WorkflowEvent } from "../../schema";
import type { Binding, WorkflowNode } from "../../definition/schema-v2";
import { newGraphId } from "./commands";

export type BlockKind =
  | "trigger"
  | "condition"
  | "action"
  | "delay"
  | "approval"
  | "wait"
  | "end";

export function createBlock(
  kind: BlockKind,
  options: { actionType?: ActionType; toolVersion?: number; event?: WorkflowEvent } = {},
): WorkflowNode {
  const id = kind === "trigger" ? "trigger" : newGraphId("n");
  switch (kind) {
    case "trigger":
      return { id, type: "trigger", event: options.event ?? "application.created" };
    case "condition":
      return { id, type: "condition", tree: [] };
    case "action":
      {
        const actionType = options.actionType ?? "add_note";
        const input: Record<string, Binding> = {};
        if (actionType === "request_documents") {
          input.items = { kind: "literal", value: [{ title: "", instructions: "" }] };
        } else if (actionType === "generate_document") {
          input.title = { kind: "literal", value: "Generated document" };
          input.body = { kind: "literal", value: "Dear {{candidate_full_name}},\n\n" };
        } else if (actionType === "schedule_interview") {
          input.type = { kind: "literal", value: "screening" };
          input.mode = { kind: "literal", value: "video" };
          input.meetingProvider = { kind: "literal", value: "auto" };
          input.durationMins = { kind: "literal", value: 45 };
        } else if (actionType === "reschedule_interview" || actionType === "cancel_interview") {
          input.interviewId = { kind: "trigger", path: "interview.id" };
        }
      return {
        id,
        type: "action",
        actionType,
        toolVersion: options.toolVersion ?? 1,
        failurePolicy: "stop",
        input,
      };
      }
    case "delay":
      return { id, type: "delay", mode: "duration", durationMs: 86_400_000 };
    case "approval":
      return { id, type: "approval", eligibleActorIds: [], rule: "any", deadlineHours: 48 };
    case "wait":
      return { id, type: "wait", kind: "event", resourceType: "package" };
    case "end":
      return { id, type: "end", result: "completed" };
  }
}

/** Control blocks shown in the library. Labels live in `library.blocks.<kind>`. */
export const CONTROL_BLOCKS: Array<{ kind: BlockKind }> = [
  { kind: "condition" },
  { kind: "delay" },
  { kind: "approval" },
  { kind: "wait" },
  { kind: "end" },
];
