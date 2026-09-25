import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceOutlookConfig: vi.fn(),
  createTeamsMeeting: vi.fn(),
  deleteTeamsMeeting: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
  interviews: {
    id: "interview.id",
    workspaceId: "interview.workspaceId",
    teamsMeetingId: "interview.teamsMeetingId",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (left: unknown, right: unknown) => [left, right],
}));
vi.mock("./config", () => ({
  getWorkspaceOutlookConfig: mocks.getWorkspaceOutlookConfig,
}));
vi.mock("./client", () => ({
  createTeamsMeeting: mocks.createTeamsMeeting,
  deleteTeamsMeeting: mocks.deleteTeamsMeeting,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { replaceInterviewToTeams } from "./teams-sync";

function activeInterviewQuery() {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => [{ id: "interview-1" }];
  return chain;
}

describe("Teams interview replacement", () => {
  beforeEach(() => {
    mocks.getWorkspaceOutlookConfig.mockResolvedValue({ accessToken: "token" });
    mocks.createTeamsMeeting.mockReset();
    mocks.deleteTeamsMeeting.mockReset();
    mocks.select.mockReset();
    mocks.update.mockReset();
    mocks.select.mockReturnValue(activeInterviewQuery());
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({ returning: async () => [{ id: "interview-1" }] }),
      }),
    });
  });

  it("persists the new meeting before deleting the old one", async () => {
    mocks.createTeamsMeeting.mockResolvedValue({
      id: "teams-2",
      joinUrl: "https://teams.microsoft.com/2",
    });

    const result = await replaceInterviewToTeams({
      workspaceId: "ws-1",
      interviewId: "interview-1",
      previousMeetingId: "teams-1",
      previousMeetLink: "https://teams.microsoft.com/1",
      summary: "Screening",
      start: new Date("2030-01-01T11:00:00Z"),
      durationMins: 30,
    });

    expect(result).toEqual({
      ok: true,
      meetingId: "teams-2",
      joinUrl: "https://teams.microsoft.com/2",
    });
    expect(mocks.createTeamsMeeting.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteTeamsMeeting.mock.invocationCallOrder[0]!,
    );
  });

  it("does not delete the old meeting when replacement creation fails", async () => {
    mocks.createTeamsMeeting.mockRejectedValue(new Error("provider down"));

    const result = await replaceInterviewToTeams({
      workspaceId: "ws-1",
      interviewId: "interview-1",
      previousMeetingId: "teams-1",
      previousMeetLink: "https://teams.microsoft.com/1",
      summary: "Screening",
      start: new Date("2030-01-01T11:00:00Z"),
      durationMins: 30,
    });

    expect(result.ok).toBe(false);
    expect(mocks.deleteTeamsMeeting).not.toHaveBeenCalled();
  });
});
