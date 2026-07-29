import { describe, expect, it, vi } from "vitest";

const workspaceId = process.env.VPS_PIPELINE_WORKSPACE_ID;

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: workspaceId },
  })),
}));

import { getPipelineData } from "./data";

describe.skipIf(process.env.VPS_PIPELINE_LOAD !== "1")(
  "large pipeline load",
  () => {
    it("loads the complete 300-application pipeline without cross-tenant rows", async () => {
      expect(workspaceId).toBeTruthy();

      const startedAt = performance.now();
      const result = await getPipelineData(
        "30000000-0000-4000-8000-000000000001",
      );
      const durationMs = performance.now() - startedAt;

      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") return;

      expect(result.applications).toHaveLength(300);
      expect(result.applications.every((row) => row.workspaceId === workspaceId)).toBe(
        true,
      );
      expect(result.applications.map((row) => row.pipelineOrder)).toEqual(
        Array.from({ length: 300 }, (_, index) => index),
      );
      expect(durationMs).toBeLessThan(10_000);
    });
  },
);
