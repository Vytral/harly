import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  requirePermission: vi.fn(),
  syncInterviewToGCal: vi.fn(),
  syncInterviewToZoom: vi.fn(),
  syncInterviewToTeams: vi.fn(),
  syncInterviewToJitsi: vi.fn(),
  trackInterviewSync: vi.fn(),
  row: null as unknown,
}));

function query() {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.leftJoin = () => chain;
  chain.where = () => chain;
  chain.limit = async () => (mocks.row ? [mocks.row] : []);
  return chain;
}

vi.mock("@harly/db", () => ({
  db: { select: () => query() },
  candidates: { email: "candidateEmail", id: "candidateId" },
  interviewSyncs: {
    id: "syncId",
    workspaceId: "syncWorkspaceId",
    interviewId: "syncInterviewId",
  },
  interviews: {
    id: "interviewId",
    workspaceId: "interviewWorkspaceId",
    candidateId: "interviewCandidateId",
    jobId: "interviewJobId",
    interviewerId: "interviewerId",
  },
  jobs: { id: "jobId" },
  organization: { id: "organizationId", name: "organizationName" },
  user: { id: "userId" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/gcal/sync", () => ({
  syncInterviewToGCal: mocks.syncInterviewToGCal,
  cancelInterviewGCalEvent: vi.fn(),
}));
vi.mock("@/lib/zoom/sync", () => ({
  syncInterviewToZoom: mocks.syncInterviewToZoom,
  cancelInterviewZoomMeeting: vi.fn(),
}));
vi.mock("@/lib/outlook/teams-sync", () => ({
  syncInterviewToTeams: mocks.syncInterviewToTeams,
  cancelInterviewTeamsMeeting: vi.fn(),
}));
vi.mock("@/lib/jitsi/sync", () => ({
  syncInterviewToJitsi: mocks.syncInterviewToJitsi,
  cancelInterviewJitsiMeeting: vi.fn(),
}));
vi.mock("@/lib/interviews/sync-ledger", () => ({
  trackInterviewSync: mocks.trackInterviewSync,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { retryInterviewSyncAction } from "./sync-actions";

beforeEach(() => {
  mocks.getWorkspaceContext.mockResolvedValue({ organization: { id: "ws-1" } });
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.syncInterviewToGCal.mockReset();
  mocks.syncInterviewToZoom.mockReset();
  mocks.syncInterviewToTeams.mockReset();
  mocks.syncInterviewToJitsi.mockReset();
  mocks.trackInterviewSync.mockImplementation(
    async ({ run }: { run: () => Promise<unknown> }) => run(),
  );
  mocks.row = {
    sync: {
      id: "sync-1",
      workspaceId: "ws-1",
      interviewId: "iv-1",
      provider: "zoom",
      operation: "upsert",
      status: "failed",
    },
    interview: {
      id: "iv-1",
      workspaceId: "ws-1",
      candidateId: "candidate-1",
      jobId: "job-1",
      interviewerId: null,
      title: "Technical screen",
      type: "technical",
      mode: "video",
      notes: "Bring examples",
      scheduledAt: new Date("2099-01-01T15:00:00.000Z"),
      durationMins: 60,
      location: null,
      gcalEventId: null,
      teamsMeetingId: null,
      zoomMeetingId: null,
      jitsiRoom: null,
    },
    candidateEmail: "candidate@example.com",
    interviewerEmail: "interviewer@example.com",
    companyName: "Syntrix",
    jobTitle: "Backend Engineer",
  };
});

describe("retryInterviewSyncAction", () => {
  it("replays a failed Zoom upsert through the provider adapter", async () => {
    mocks.syncInterviewToZoom.mockResolvedValue({
      meetingId: "zoom-2",
      joinUrl: "https://zoom.us/j/2",
    });

    const result = await retryInterviewSyncAction({ syncId: "sync-1" });

    expect(result).toEqual({ success: true });
    expect(mocks.syncInterviewToZoom).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        interviewId: "iv-1",
        summary: "Technical screen",
        durationMins: 60,
      }),
    );
    expect(mocks.trackInterviewSync).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "zoom",
        operation: "upsert",
      }),
    );
  });

  it("returns a useful failure when GCal still cannot sync", async () => {
    mocks.row = {
      ...(mocks.row as Record<string, unknown>),
      sync: {
        ...(mocks.row as { sync: Record<string, unknown> }).sync,
        provider: "google_calendar",
      },
    };
    mocks.syncInterviewToGCal.mockResolvedValue({
      ok: false,
      reason: "invalid_grant",
    });

    const result = await retryInterviewSyncAction({ syncId: "sync-1" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Google Calendar could not/i);
  });

  it("does not cross workspace boundaries", async () => {
    mocks.row = null;

    const result = await retryInterviewSyncAction({ syncId: "foreign-sync" });

    expect(result).toEqual({
      success: false,
      error: "Sync attempt not found.",
    });
    expect(mocks.syncInterviewToZoom).not.toHaveBeenCalled();
  });
});
