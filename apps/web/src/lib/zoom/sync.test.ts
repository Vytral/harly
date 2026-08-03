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

import {
  cancelInterviewZoomMeeting,
  replaceInterviewToZoom,
  syncInterviewToZoom,
} from "./sync";

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

  it("creates the replacement before deleting the valid meeting", async () => {
    mocks.selectQueue.push([{ id: "interview-1" }]);
    mocks.createMeeting.mockResolvedValue({
      id: 2,
      join_url: "https://zoom.us/j/2",
    });
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({ returning: async () => [{ id: "interview-1" }] }),
      }),
    });

    const result = await replaceInterviewToZoom({
      workspaceId: "ws-1",
      interviewId: "interview-1",
      previousMeetingId: "zoom-1",
      previousMeetLink: "https://zoom.us/j/1",
      summary: "Screening",
      start: new Date("2030-01-01T11:00:00Z"),
      durationMins: 30,
    });

    expect(result).toEqual({
      ok: true,
      meetingId: "2",
      joinUrl: "https://zoom.us/j/2",
    });
    expect(mocks.createMeeting).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMeeting).toHaveBeenCalledWith("ws-1", "zoom-1");
    expect(mocks.createMeeting.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteMeeting.mock.invocationCallOrder[0]!,
    );
  });

  it("cleans up the replacement and restores the old link when deletion fails", async () => {
    mocks.selectQueue.push([{ id: "interview-1" }]);
    mocks.createMeeting.mockResolvedValue({
      id: 2,
      join_url: "https://zoom.us/j/2",
    });
    mocks.deleteMeeting
      .mockRejectedValueOnce(new Error("old meeting unavailable"))
      .mockResolvedValueOnce(undefined);
    mocks.update.mockImplementation(() => ({
      set: () => ({
        where: () => ({ returning: async () => [{ id: "interview-1" }] }),
      }),
    }));

    const result = await replaceInterviewToZoom({
      workspaceId: "ws-1",
      interviewId: "interview-1",
      previousMeetingId: "zoom-1",
      previousMeetLink: "https://zoom.us/j/1",
      summary: "Screening",
      start: new Date("2030-01-01T11:00:00Z"),
      durationMins: 30,
    });

    expect(result.ok).toBe(false);
    expect(mocks.deleteMeeting).toHaveBeenNthCalledWith(2, "ws-1", "2");
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
});
