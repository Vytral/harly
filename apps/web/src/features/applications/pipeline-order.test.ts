import { describe, expect, it, vi } from "vitest";

import { lockApplicationPipelineOrder } from "./pipeline-order";

describe("lockApplicationPipelineOrder", () => {
  it("takes a transaction-scoped lock for the workspace and stage", async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await lockApplicationPipelineOrder(
      { execute },
      "workspace_1",
      "stage_1",
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(
      (execute.mock.calls[0]?.[0] as { queryChunks?: unknown[] }).queryChunks,
    ).toContain("workspace_1:stage_1");
  });

  it("does not require minimal transaction test doubles to implement execute", async () => {
    await expect(
      lockApplicationPipelineOrder({}, "workspace_1", "stage_1"),
    ).resolves.toBeUndefined();
  });
});
