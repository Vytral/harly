import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  return {
    selectQueue,
    createMeeting: vi.fn(),
    deleteMeeting: vi.fn(),
    update: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (left: unknown, right: unknown) => [left, right],
  exists: (value: unknown) => ({ exists: value }),
  isNull: (value: unknown) => ({ isNull: value }),
}));

vi.mock("@harly/db", () => {
  const makeQuery = () => {
    const query: Record<string, unknown> = {};
    query.from = () => query;
    query.where = () => query;
    query.limit = async () => mocks.selectQueue.shift() ?? [];
    return query;
  };
  return {
    db: {
      select: vi.fn(makeQuery),
      update: mocks.update,
    },
    candidates: { id: "candidate.id", workspaceId: "candidate.workspaceId", deletedAt: "candidate.deletedAt" },
    interviews: { id: "interview.id", workspaceId: "interview.workspaceId", candidateId: "interview.candidateId" },
  };
});

vi.mock("./client", () => ({
  createMeeting: mocks.createMeeting,
  deleteMeeting: mocks.deleteMeeting,
}));

import { cancelInterviewZoomMeeting, syncInterviewToZoom } from "./sync";

describe("Zoom interview sync isolation", () => {
  beforeEach(() => {
    mocks.selectQueue.length = 0;
    mocks.createMeeting.mockReset();
    mocks.deleteMeeting.mockReset();
    mocks.update.mockReset();
    mocks.update.mockReturnValue({
      set: () => ({ where: async () => undefined }),
    });
  });

  it("does not create a provider meeting for an inactive candidate", async () => {
    mocks.selectQueue.push([]);

    await expect(
      syncInterviewToZoom({
        workspaceId: "ws-1",
        interviewId: "interview-1",
        summary: "Screening",
        start: new Date("2030-01-01T10:00:00Z"),
        durationMins: 30,
      }),
    ).resolves.toBeNull();
    expect(mocks.createMeeting).not.toHaveBeenCalled();
  });

  it("does not delete a provider meeting for an inactive candidate", async () => {
    mocks.selectQueue.push([]);

    await expect(
      cancelInterviewZoomMeeting({
        workspaceId: "ws-1",
        interviewId: "interview-1",
        zoomMeetingId: "zoom-1",
      }),
    ).resolves.toBe(false);
    expect(mocks.deleteMeeting).not.toHaveBeenCalled();
  });
});
