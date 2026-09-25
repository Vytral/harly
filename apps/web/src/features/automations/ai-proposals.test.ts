import { beforeAll, describe, expect, it } from "vitest";

import type { WorkflowGraphV2 } from "./definition/schema-v2";

let diffAutomationProposal: typeof import("./ai-proposals").diffAutomationProposal;

beforeAll(async () => {
  process.env.HARLY_URL ??= "http://localhost:3000";
  ({ diffAutomationProposal } = await import("./ai-proposals"));
}, 30_000);

const before: WorkflowGraphV2 = {
  schemaVersion: 2,
  entryNodeId: "trigger",
  nodes: [
    { id: "trigger", type: "trigger", event: "application.created" },
    { id: "end", type: "end", result: "completed" },
  ],
  edges: [{ id: "e1", source: "trigger", port: "next", target: "end" }],
};

describe("automation proposal diff", () => {
  it("captures metadata and graph changes against the verified base snapshot", () => {
    const after: WorkflowGraphV2 = {
      ...before,
      nodes: [
        before.nodes[0]!,
        {
          id: "tag",
          type: "action",
          actionType: "add_tag",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { label: { kind: "literal", value: "vip" } },
        },
        before.nodes[1]!,
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "tag" },
        { id: "e2", source: "tag", port: "success", target: "end" },
      ],
    };
    expect(diffAutomationProposal({
      before,
      after,
      beforeName: "Original",
      afterName: "Tag VIP applicants",
      beforeDescription: null,
      afterDescription: "Apply a VIP tag on entry.",
      beforeOperationalPolicy: { maxRunsPerMinute: 60 },
      afterOperationalPolicy: {
        maxRunsPerMinute: 120,
        maxExternalActionsPerMinute: 30,
      },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "metadata_changed", id: "name", before: "Original", after: "Tag VIP applicants" }),
      expect.objectContaining({ kind: "metadata_changed", id: "description" }),
      expect.objectContaining({ kind: "metadata_changed", id: "operationalPolicy" }),
      expect.objectContaining({ kind: "node_added", id: "tag" }),
      expect.objectContaining({ kind: "edge_changed", id: "e1" }),
      expect.objectContaining({ kind: "edge_added", id: "e2" }),
    ]));
  });
});
