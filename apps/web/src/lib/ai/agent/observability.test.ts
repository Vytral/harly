import { describe, expect, it } from "vitest";

import {
  getRecentHarlyAgentTraces,
  recordHarlyAgentTrace,
} from "./observability";

describe("Harly agent observability", () => {
  it("records deduplicated, bounded tool telemetry without message content", () => {
    recordHarlyAgentTrace({
      workspaceId: "workspace-test",
      userId: "user-test",
      toolCalls: ["resolveJob", "resolveJob", "jobContext"],
      outcome: "completed",
      durationMs: 42,
      hadWorkspaceEvidence: true,
    });

    const trace = getRecentHarlyAgentTraces(1)[0];
    expect(trace?.toolCalls).toEqual(["resolveJob", "jobContext"]);
    expect(trace).not.toHaveProperty("prompt");
    expect(trace).not.toHaveProperty("response");
  });
});
