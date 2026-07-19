import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateValues: null as Record<string, unknown> | null,
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@harly/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        mocks.updateValues = values;
        return {
          where: () => ({ returning: async () => mocks.rows }),
        };
      }),
    })),
  },
  jobStages: {},
}));

import { ApiError } from "@harly/api";
import { serializeJobStage, updateJobStageForApi } from "./service";

describe("job stage API service", () => {
  it("serializes only public fields and normalizes invalid email config", () => {
    const result = serializeJobStage({
      id: "stage-1",
      workspaceId: "workspace-secret",
      jobId: "job-1",
      name: "Interview",
      color: null,
      order: 3,
      emailConfig: {},
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    } as Parameters<typeof serializeJobStage>[0]);

    expect(result).toEqual({
      id: "stage-1",
      jobId: "job-1",
      name: "Interview",
      color: null,
      order: 3,
      emailConfig: { candidateUpdatesEnabled: true },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("rejects empty patches before touching DB", async () => {
    await expect(
      updateJobStageForApi({
        workspaceId: "workspace-1",
        jobId: "job-1",
        stageId: "stage-1",
        patch: {},
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(mocks.updateValues).toBeNull();
  });
});
