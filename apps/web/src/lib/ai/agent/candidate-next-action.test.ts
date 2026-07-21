import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCandidateApplication: vi.fn(),
  getNextStage: vi.fn(),
}));

vi.mock("./application-resolution", () => ({
  resolveCandidateApplication: mocks.resolveCandidateApplication,
}));
vi.mock("@/features/pipeline/data", () => ({
  getNextStage: mocks.getNextStage,
}));

import { resolveCandidateNextAction } from "./candidate-next-action";

const application = {
  applicationId: "application-1",
  jobId: "job-1",
  currentStageId: "stage-1",
  job: "Backend Engineer (Go)",
  stage: "Screening",
  status: "active",
  isActive: true,
};

describe("candidate next action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the exact next stage when the application is actionable", async () => {
    mocks.resolveCandidateApplication.mockResolvedValue({
      status: "resolved",
      candidateId: "candidate-1",
      application,
      reason: "only_active",
    });
    mocks.getNextStage.mockResolvedValue({
      id: "stage-2",
      name: "Interview",
      order: 2,
    });

    await expect(
      resolveCandidateNextAction({
        candidateId: "candidate-1",
        jobQuery: null,
        applicationId: null,
      }),
    ).resolves.toEqual({
      status: "ready",
      candidateId: "candidate-1",
      application: {
        applicationId: "application-1",
        jobId: "job-1",
        job: "Backend Engineer (Go)",
        currentStage: "Screening",
        currentStageId: "stage-1",
        nextStage: { id: "stage-2", name: "Interview", order: 2 },
      },
    });
    expect(mocks.getNextStage).toHaveBeenCalledWith("job-1", "stage-1");
  });

  it("returns terminal when the pipeline has no valid next stage", async () => {
    mocks.resolveCandidateApplication.mockResolvedValue({
      status: "resolved",
      candidateId: "candidate-1",
      application,
      reason: "only_active",
    });
    mocks.getNextStage.mockResolvedValue(null);

    await expect(
      resolveCandidateNextAction({
        candidateId: "candidate-1",
        jobQuery: null,
        applicationId: null,
      }),
    ).resolves.toMatchObject({ status: "terminal", candidateId: "candidate-1" });
  });

  it("passes application ambiguity through without asking the pipeline", async () => {
    mocks.resolveCandidateApplication.mockResolvedValue({
      status: "ambiguous",
      candidateId: "candidate-1",
      applications: [application],
    });

    await expect(
      resolveCandidateNextAction({
        candidateId: "candidate-1",
        jobQuery: null,
        applicationId: null,
      }),
    ).resolves.toMatchObject({
      status: "ambiguous",
      reason: "application_required",
      applications: [application],
    });
    expect(mocks.getNextStage).not.toHaveBeenCalled();
  });
});
