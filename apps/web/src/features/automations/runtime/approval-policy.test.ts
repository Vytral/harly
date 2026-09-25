import { describe, expect, it } from "vitest";

import { effectiveApprovalPolicy } from "./approval-policy";

const node = {
  id: "approval",
  type: "approval" as const,
  eligibleActorIds: ["graph-owner"],
  rule: "any" as const,
};

describe("effective approval policy", () => {
  it("uses the durable snapshot over a later graph value", () => {
    expect(effectiveApprovalPolicy(node, {
      eligibleActorIds: ["snapshotted-owner", "backup"],
      rule: "all",
    })).toEqual({
      eligibleActorIds: ["snapshotted-owner", "backup"],
      rule: "all",
    });
  });

  it("falls back safely for legacy or malformed snapshots", () => {
    expect(effectiveApprovalPolicy(node, { eligibleActorIds: [], rule: "all" })).toEqual({
      eligibleActorIds: ["graph-owner"],
      rule: "any",
    });
    expect(effectiveApprovalPolicy(node, null)).toEqual({
      eligibleActorIds: ["graph-owner"],
      rule: "any",
    });
  });
});

