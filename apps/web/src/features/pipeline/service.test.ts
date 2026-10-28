import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@harly/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@harly/db")>()),
  db: {
    transaction: mocks.transaction,
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
      kind: null,
      archivedAt: null,
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
      kind: "interview",
      archivedAt: null,
      emailConfig: { candidateUpdatesEnabled: true },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("exposes the stored kind and the archive timestamp", () => {
    const result = serializeJobStage({
      id: "stage-2",
      workspaceId: "workspace-secret",
      jobId: "job-1",
      name: "Pending review",
      color: "#FFFFFF",
      order: 7,
      kind: "custom",
      archivedAt: new Date("2026-03-04T05:06:07.000Z"),
      emailConfig: { candidateUpdatesEnabled: false },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    } as Parameters<typeof serializeJobStage>[0]);

    expect(result.kind).toBe("custom");
    expect(result.archivedAt).toBe("2026-03-04T05:06:07.000Z");
    expect(result.emailConfig).toEqual({ candidateUpdatesEnabled: false });
    expect(result).not.toHaveProperty("workspaceId");
  });

  it("rejects empty patches before touching DB", async () => {
    await expect(
      updateJobStageForApi({
        workspaceId: "workspace-1",
        jobId: "job-1",
        actorUserId: "user-1",
        stageId: "stage-1",
        patch: {},
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
