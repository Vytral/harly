import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireJobPermission: vi.fn(),
  requirePermission: vi.fn(),
  select: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  max: vi.fn(),
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.select },
  evaluationCriteria: {},
  evaluationRubrics: {
    id: "id",
    jobId: "jobId",
    version: "version",
    workspaceId: "workspaceId",
    status: "status",
  },
  jobs: { id: "id", workspaceId: "workspaceId" },
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireJobPermission: mocks.requireJobPermission,
  requirePermission: mocks.requirePermission,
}));
vi.mock("./service", () => ({ hashEvaluationInput: vi.fn(() => "hash") }));

import {
  createEvaluationRubricAction,
  publishEvaluationRubricAction,
} from "./rubric-actions";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const RUBRIC_ID = "22222222-2222-4222-8222-222222222222";

const validInput = {
  jobId: JOB_ID,
  criteria: [
    {
      key: "typescript",
      label: "TypeScript",
      type: "skill",
      importance: "required",
      weight: 100,
      aliases: [],
    },
  ],
};

describe("evaluation rubric authorization", () => {
  it("requires job scope before creating a rubric", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    await expect(createEvaluationRubricAction(validInput)).rejects.toThrow(
      "You are not assigned to this job.",
    );
    expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:edit", JOB_ID);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("checks the rubric's job scope before publishing", async () => {
    mocks.requirePermission.mockResolvedValue({ organization: { id: "ws-1" } });
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );
    const builder: Record<string, unknown> = {
      from: () => builder,
      where: () => builder,
      limit: async () => [{ jobId: JOB_ID }],
    };
    mocks.select.mockReturnValue(builder);

    await expect(
      publishEvaluationRubricAction({ rubricId: RUBRIC_ID }),
    ).rejects.toThrow("You are not assigned to this job.");
    expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:edit", JOB_ID);
  });
});
