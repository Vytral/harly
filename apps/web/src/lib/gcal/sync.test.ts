import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  getEvent: vi.fn(),
  getWorkspaceGCalConfig: vi.fn(),
  invalidateWorkspaceGCalConnection: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { update: mocks.update },
  interviews: { id: "interviews.id" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@/lib/gcal/config", () => ({
  getWorkspaceGCalConfig: mocks.getWorkspaceGCalConfig,
  invalidateWorkspaceGCalConnection: mocks.invalidateWorkspaceGCalConnection,
}));
vi.mock("@/lib/gcal/client", () => ({
  createEvent: mocks.createEvent,
  deleteEvent: vi.fn(),
  getEvent: mocks.getEvent,
  updateEvent: vi.fn(),
}));

import { gcalEventIdForInterview, syncInterviewToGCal } from "./sync";

describe("Google Calendar interview sync", () => {
  it("derives a stable provider event id", () => {
    expect(gcalEventIdForInterview("6A5346F8-D3E6-4B2E-9D12-DA950CC40274")).toBe(
      "harly-6a5346f8-d3e6-4b2e-9d12-da950cc40274",
    );
  });

  it("recovers a committed event after a create conflict", async () => {
    mocks.getWorkspaceGCalConfig.mockResolvedValue({
      oauth2Client: {},
      calendarId: "primary",
    });
    mocks.createEvent.mockRejectedValue(
      new Error("Google Calendar API 409: already exists"),
    );
    mocks.getEvent.mockResolvedValue({
      id: "harly-interview-1",
      hangoutLink: "https://meet.google.com/recovered",
    });
    mocks.update.mockReturnValue({
      set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
    });

    await expect(
      syncInterviewToGCal({
        workspaceId: "workspace-1",
        interviewId: "interview-1",
        summary: "Introduction",
        start: new Date("2026-07-21T13:00:00.000Z"),
        durationMins: 60,
        mode: "video",
      }),
    ).resolves.toEqual({
      ok: true,
      eventId: "harly-interview-1",
      meetLink: "https://meet.google.com/recovered",
    });
    expect(mocks.createEvent).toHaveBeenCalledWith(
      {},
      "primary",
      expect.objectContaining({ id: "harly-interview-1" }),
    );
    expect(mocks.getEvent).toHaveBeenCalledWith(
      {},
      "primary",
      "harly-interview-1",
    );
  });
});
