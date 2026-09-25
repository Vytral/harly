import { beforeEach, describe, expect, it, vi } from "vitest";
import { asSchema } from "ai";

const mocks = vi.hoisted(() => ({
  getAutomationAiContext: vi.fn(),
  prepareAutomationProposal: vi.fn(),
}));

vi.mock("@/features/automations/ai-proposals", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/automations/ai-proposals")
    >();
  return {
    ...actual,
    getAutomationAiContext: mocks.getAutomationAiContext,
    prepareAutomationProposal: mocks.prepareAutomationProposal,
  };
});

import { buildReadTools } from "./tools";
import { semanticGraphHash } from "@/features/automations/definition/hash";
import { automationPlanV1Schema } from "@/features/automations/definition/plan-compiler";

describe("Harly AI automation tool contracts", () => {
  beforeEach(() => {
    mocks.getAutomationAiContext.mockReset();
    mocks.prepareAutomationProposal.mockReset();
  });

  it("publishes a provider-compatible object schema for batched resource resolution", async () => {
    const tools = buildReadTools({
      workspaceId: "ws-1",
      userId: "user-1",
      permissions: ["automations:manage"],
    });
    const schema = await asSchema(tools.resolveAutomationResources.inputSchema)
      .jsonSchema;

    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("requests");
    expect(schema.properties).toHaveProperty("resourceType");
    expect(schema).not.toHaveProperty("anyOf");
  });

  it("returns a JSON-safe, bounded automation registry payload", async () => {
    const tools = buildReadTools({
      workspaceId: "ws-1",
      userId: "user-1",
      permissions: ["automations:manage"],
    });
    const output = await tools.listAutomationTools.execute!({}, {
      toolCallId: "registry-1",
      messages: [],
    });
    const serialized = JSON.stringify(output);

    expect(serialized).not.toContain("[object Object]");
    expect(Buffer.byteLength(serialized)).toBeLessThan(200_000);
  });

  it("normalizes the model's shorthand literal inputs into canonical bindings", () => {
    const plan = automationPlanV1Schema.parse({
      version: 1,
      name: "Reject low scores",
      trigger: { event: "application.created" },
      branches: [
        {
          id: "low_score",
          conditions: {
            type: "leaf",
            field: { kind: "ai", path: "score" },
            op: "lt",
            value: 50,
          },
          trueSteps: [
            {
              id: "reject",
              actionType: "set_status",
              input: { status: "rejected" },
            },
          ],
        },
      ],
    });

    expect(plan.branches[0]?.trueSteps[0]?.input).toEqual({
      status: { kind: "literal", value: "rejected" },
    });
  });

  it("applies a compact patch against the active workflow and preserves its layout", async () => {
    const workflowId = "11111111-1111-4111-8111-111111111111";
    const baseGraph = {
      schemaVersion: 2 as const,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger" as const,
          event: "application.created" as const,
          filter: {},
        },
        { id: "end", type: "end" as const, result: "completed" as const },
      ],
      edges: [],
    };
    const baseLayout = {
      positions: {
        trigger: { x: 250, y: 50 },
        end: { x: 250, y: 300 },
      },
      collapsedNodeIds: [],
    };

    mocks.getAutomationAiContext.mockResolvedValueOnce({
      workflowId,
      name: "Existing workflow",
      description: null,
      draftRevision: 4,
      contentHash: "a".repeat(64),
      status: "draft",
      graph: baseGraph,
      layout: baseLayout,
      validationIssues: [],
      tools: [],
      toolsV2: [],
    });
    mocks.prepareAutomationProposal.mockResolvedValueOnce({ id: "proposal-1" });

    const tools = buildReadTools({
      workspaceId: "ws-1",
      userId: "user-1",
      permissions: ["automations:manage"],
    });

    await tools.prepareAutomationPatch.execute!(
      {
        workflowId,
        expectedRevision: 4,
        expectedContentHash: "a".repeat(64),
        name: "Existing workflow",
        description: null,
        graph: undefined,
        patch: {
          version: 1,
          operations: [
            {
              op: "addNode",
              node: {
                id: "note",
                type: "action",
                actionType: "add_note",
                toolVersion: 1,
                failurePolicy: "stop",
                input: { body: { kind: "literal", value: "Patched" } },
              },
            },
            { op: "connect", source: "trigger", port: "next", target: "note" },
            { op: "connect", source: "note", port: "success", target: "end" },
          ],
        },
        layout: null,
      },
      { toolCallId: "patch-1", messages: [] },
    );

    expect(mocks.prepareAutomationProposal).toHaveBeenCalledTimes(1);
    const proposalInput = mocks.prepareAutomationProposal.mock.calls[0]![0];
    expect(proposalInput.workflowId).toBe(workflowId);
    expect(proposalInput.expectedRevision).toBe(4);
    expect(
      proposalInput.graph.nodes.map((node: { id: string }) => node.id),
    ).toEqual(["trigger", "end", "note"]);
    expect(proposalInput.graph.edges).toEqual([
      { id: "pe_1", source: "trigger", port: "next", target: "note" },
      { id: "pe_2", source: "note", port: "success", target: "end" },
    ]);
    expect(proposalInput.layout.positions.trigger).toEqual({ x: 250, y: 50 });
    expect(proposalInput.layout.positions.end).toEqual({ x: 250, y: 300 });
    expect(proposalInput.layout.positions.note).toBeDefined();
  });

  it("applies a compact patch to an unsaved new Builder graph without a workflow id", async () => {
    const localGraph = {
      schemaVersion: 2 as const,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger" as const,
          event: "application.created" as const,
          filter: {},
        },
        { id: "existing", type: "end" as const, result: "completed" as const },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "existing" },
      ],
    };
    const tools = buildReadTools({
      workspaceId: "ws-1",
      userId: "user-1",
      permissions: ["automations:manage"],
      activeAutomation: {
        workflowId: null,
        isNew: true,
        isUnsaved: true,
        graph: localGraph,
        contentHash: semanticGraphHash(localGraph),
        layout: { positions: {}, collapsedNodeIds: [] },
      },
    });
    mocks.prepareAutomationProposal.mockResolvedValueOnce({
      id: "proposal-new",
    });

    await tools.prepareAutomationPatch.execute!(
      {
        workflowId: null,
        expectedRevision: null,
        expectedContentHash: null,
        name: "New workflow",
        description: null,
        patch: {
          version: 1,
          operations: [
            {
              op: "configureNode",
              nodeId: "existing",
              patch: { result: "stopped" },
            },
          ],
        },
        layout: null,
      },
      { toolCallId: "patch-2", messages: [] },
    );

    expect(mocks.getAutomationAiContext).not.toHaveBeenCalled();
    const proposalInput = mocks.prepareAutomationProposal.mock.calls[0]![0];
    expect(proposalInput.workflowId).toBeUndefined();
    expect(proposalInput.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "existing",
          type: "end",
          result: "stopped",
        }),
      ]),
    );
  });
});
