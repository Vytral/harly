import { describe, expect, it } from "vitest";
import { compileValidGraph } from "../definition/compile";
import { legacyToGraph } from "../definition/legacy-adapter";
import type { WorkflowNode } from "../definition/schema-v2";
import { advance, resolveBinding, type ExecutionSnapshot } from "./advance";

function fixture(node?: WorkflowNode) {
  const graph = legacyToGraph({ trigger: { event: "application.created" }, conditions: [], actions: [{ type: "add_note", config: { body: "Hello" } }] });
  if (node) graph.nodes[1] = { ...node, id: "action_0" };
  const plan = compileValidGraph(graph);
  const snapshot: ExecutionSnapshot = { contentHash: plan.contentHash, nodeId: "action_0", trigger: { candidate: { name: "Ada", score: 0, enabled: false, missing: null } }, outcomes: {}, warnings: [], cancelled: false };
  return { plan, snapshot };
}

describe("graph advance — shared worker/simulator decisions", () => {
  it("requests the action, then advances from its persisted result without replaying it", () => {
    const { plan, snapshot } = fixture();
    expect(advance(plan, snapshot)).toMatchObject({ type: "action", input: { body: "Hello" } });
    snapshot.outcomes.action_0 = { status: "succeeded", output: { noteId: "note_1" } };
    expect(advance(plan, snapshot)).toEqual({ type: "next", nodeId: "end_completed", warnings: [] });
  });
  it("checks version identity and cancellation before requesting an effect", () => {
    const { plan, snapshot } = fixture();
    expect(advance(plan, { ...snapshot, contentHash: "other" })).toMatchObject({ code: "VERSION_MISMATCH" });
    expect(advance(plan, { ...snapshot, cancelled: true })).toEqual({ type: "finish", status: "cancelled" });
  });
  it("uncertain results never continue or retry automatically", () => {
    const { plan, snapshot } = fixture({ id: "unused", type: "action", actionType: "add_note", input: {}, toolVersion: 1, failurePolicy: "continue" });
    snapshot.outcomes.action_0 = { status: "uncertain", code: "PROVIDER_TIMEOUT" };
    expect(advance(plan, snapshot)).toEqual({ type: "finish", status: "uncertain", code: "PROVIDER_TIMEOUT" });
  });
  it("preserves failed node evidence when continuing with warnings", () => {
    const { plan, snapshot } = fixture({ id: "unused", type: "action", actionType: "add_note", input: {}, toolVersion: 1, failurePolicy: "continue" });
    snapshot.outcomes.action_0 = { status: "failed", code: "NOT_FOUND" };
    expect(advance(plan, snapshot)).toEqual({ type: "next", nodeId: "end_completed", warnings: ["action_0"] });
    expect(advance(plan, { ...snapshot, nodeId: "end_completed", warnings: ["action_0"] })).toMatchObject({ status: "completed_with_warnings" });
    expect(snapshot.warnings).toEqual([]);
  });
  it("routes false conditions rather than traversing true unconditionally", () => {
    const { plan, snapshot } = fixture({ id: "unused", type: "condition", tree: [] });
    plan.ports.action_0 = { true: "trigger", false: "end_completed" };
    expect(advance(plan, snapshot).type).toBe("condition");
    snapshot.outcomes.action_0 = { status: "succeeded", output: { matched: false }, port: "false" };
    expect(advance(plan, snapshot)).toMatchObject({ type: "next", nodeId: "end_completed" });
  });
  it("re-enters a failed condition only when durable retry intent targets it", () => {
    const { plan, snapshot } = fixture({ id: "unused", type: "condition", tree: [] });
    snapshot.outcomes.action_0 = { status: "failed", code: "CONDITION_EVALUATION_FAILED", retryable: true };

    expect(advance(plan, snapshot)).toMatchObject({ type: "finish", status: "failed" });
    expect(advance(plan, { ...snapshot, retryNodeId: "action_0" })).toMatchObject({
      type: "condition",
      node: { id: "action_0" },
    });
  });
  it.each([
    { type: "delay", mode: "duration", durationMs: 86400000 },
    { type: "approval", rule: "all", eligibleActorIds: ["member_1"] },
    { type: "wait", kind: "event", eventName: "document.signed" },
  ])("requests durable suspension for $type", (node) => {
    const { plan, snapshot } = fixture({ id: "unused", ...node } as WorkflowNode);
    expect(advance(plan, snapshot).type).toBe("wait");
  });
  it("document waits use document ports and a resolved resource ID", () => {
    const { plan, snapshot } = fixture({ id: "unused", type: "wait", kind: "document_package", resourceId: { kind: "literal", value: "package_1" } });
    expect(advance(plan, snapshot)).toMatchObject({ type: "wait", resourceId: "package_1" });
    snapshot.outcomes.action_0 = { status: "succeeded", output: {}, port: "matched" };
    expect(advance(plan, snapshot)).toMatchObject({ code: "INVALID_RESOLUTION_PORT" });
    plan.ports.action_0 = { completed: "end_completed" };
    snapshot.outcomes.action_0 = { status: "succeeded", output: {}, port: "completed" };
    expect(advance(plan, snapshot)).toMatchObject({ type: "next", nodeId: "end_completed" });
  });
  it("fails closed on a missing connection", () => {
    const { plan, snapshot } = fixture();
    delete plan.ports.action_0;
    snapshot.outcomes.action_0 = { status: "succeeded", output: {} };
    expect(advance(plan, snapshot)).toMatchObject({ code: "MISSING_CONNECTION" });
  });
});

describe("binding resolution", () => {
  it.each([["score", 0], ["enabled", false], ["missing", null]])("preserves %s without applying fallback", (path, value) => {
    const { plan, snapshot } = fixture();
    expect(resolveBinding({ kind: "trigger", path: `candidate.${path}`, fallback: "fallback" }, snapshot, plan)).toBe(value);
  });
  it("uses fallback only for absent paths", () => {
    const { plan, snapshot } = fixture();
    expect(resolveBinding({ kind: "trigger", path: "candidate.absent", fallback: "fallback" }, snapshot, plan)).toBe("fallback");
    expect(() => resolveBinding({ kind: "trigger", path: "candidate.absent" }, snapshot, plan)).toThrow("MISSING_BINDING_VALUE");
  });
  it("blocks unsafe paths and inherited values", () => {
    const { plan, snapshot } = fixture();
    expect(() => resolveBinding({ kind: "trigger", path: "constructor.name" }, snapshot, plan)).toThrow("UNSAFE_BINDING_PATH");
    expect(() => resolveBinding({ kind: "trigger", path: "toString" }, snapshot, plan)).toThrow("MISSING_BINDING_VALUE");
  });
  it("does not substitute fallback for a failed or unexecuted producer", () => {
    const { plan, snapshot } = fixture();
    snapshot.nodeId = "end_completed";
    const binding = { kind: "output", nodeId: "action_0", path: "noteId", fallback: "fake" } as const;
    expect(() => resolveBinding(binding, snapshot, plan)).toThrow("OUTPUT_NOT_SUCCESSFUL");
    snapshot.outcomes.action_0 = { status: "failed", code: "FAILED" };
    expect(() => resolveBinding(binding, snapshot, plan)).toThrow("OUTPUT_NOT_SUCCESSFUL");
    snapshot.outcomes.action_0 = { status: "succeeded", output: { noteId: "real" } };
    expect(resolveBinding(binding, snapshot, plan)).toBe("real");
  });
  it("rejects output from a different branch", () => {
    const { plan, snapshot } = fixture();
    expect(() => resolveBinding({ kind: "output", nodeId: "other", path: "result" }, snapshot, plan)).toThrow("OUTPUT_NOT_GUARANTEED");
  });
});
