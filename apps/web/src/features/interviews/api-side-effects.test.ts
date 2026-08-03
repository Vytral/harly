import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trackInterviewSync: vi.fn(),
  syncInterviewToGCal: vi.fn(),
  getWorkspaceGCalConfig: vi.fn(),
  getZoomToken: vi.fn(),
  getWorkspaceOutlookConfig: vi.fn(),
  getWorkspaceJitsiConfig: vi.fn(),
  dbSelect: vi.fn(),
  getInboundReplyTo: vi.fn(),
}));

function query(value: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.leftJoin = () => chain;
  chain.where = () => chain;
  chain.limit = async () => (value ? [value] : []);
  return chain;
}

vi.mock("@harly/db", () => ({
  db: { select: mocks.dbSelect },
  candidates: { id: "candidateId", email: "candidateEmail" },
  interviews: {
    id: "interviewId",
    candidateId: "interviewCandidateId",
    jobId: "interviewJobId",
    interviewerId: "interviewerId",
    workspaceId: "interviewWorkspaceId",
  },
  jobs: { id: "jobId", workspaceId: "jobWorkspaceId", deletedAt: "jobDeletedAt" },
  organization: { id: "organizationId", name: "organizationName" },
  user: { id: "userId", email: "userEmail" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  isNull: (...values: unknown[]) => values,
}));
vi.mock("@/lib/interviews/sync-ledger", () => ({
  trackInterviewSync: mocks.trackInterviewSync,
}));
vi.mock("@/lib/gcal/sync", () => ({
  cancelInterviewGCalEvent: vi.fn(),
  syncInterviewToGCal: mocks.syncInterviewToGCal,
  updateInterviewGCalEvent: vi.fn(),
}));
vi.mock("@/lib/gcal/config", () => ({
  getWorkspaceGCalConfig: mocks.getWorkspaceGCalConfig,
}));
vi.mock("@/lib/zoom/config", () => ({ getZoomToken: mocks.getZoomToken }));
vi.mock("@/lib/zoom/sync", () => ({
  cancelInterviewZoomMeeting: vi.fn(),
  replaceInterviewToZoom: vi.fn(),
  syncInterviewToZoom: vi.fn(),
}));
vi.mock("@/lib/outlook/config", () => ({
  getWorkspaceOutlookConfig: mocks.getWorkspaceOutlookConfig,
}));
vi.mock("@/lib/outlook/teams-sync", () => ({
  cancelInterviewTeamsMeeting: vi.fn(),
  replaceInterviewToTeams: vi.fn(),
  syncInterviewToTeams: vi.fn(),
}));
vi.mock("@/lib/jitsi/config", () => ({
  getWorkspaceJitsiConfig: mocks.getWorkspaceJitsiConfig,
}));
vi.mock("@/lib/jitsi/sync", () => ({
  cancelInterviewJitsiMeeting: vi.fn(),
  syncInterviewToJitsi: vi.fn(),
}));
vi.mock("@/lib/email/inbound-token", () => ({
  getInboundReplyTo: mocks.getInboundReplyTo,
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(),
  processEmailOutbox: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { runApiInterviewSideEffects } from "./api-side-effects";

beforeEach(() => {
  mocks.dbSelect.mockReset();
  mocks.dbSelect.mockReturnValue(
    query({
      email: null,
      firstName: "Candidate",
      lastName: "One",
      companyName: "Acme",
      jobTitle: "Engineer",
      interviewerId: null,
      applicationId: "app-1",
    }),
  );
  mocks.trackInterviewSync.mockReset();
  mocks.trackInterviewSync.mockImplementation(
    async (input: { run: () => Promise<unknown> }) => input.run(),
  );
  mocks.syncInterviewToGCal.mockReset();
  mocks.syncInterviewToGCal.mockResolvedValue({ ok: false, reason: "not_connected" });
  mocks.getWorkspaceGCalConfig.mockResolvedValue(null);
  mocks.getZoomToken.mockResolvedValue(null);
  mocks.getWorkspaceOutlookConfig.mockResolvedValue(null);
  mocks.getWorkspaceJitsiConfig.mockResolvedValue(null);
});

describe("REST interview side effects", () => {
  it("uses the dashboard calendar ledger path even when GCal is not connected", async () => {
    const interview = {
      id: "iv-1",
      workspaceId: "ws-1",
      applicationId: "app-1",
      candidateId: "candidate-1",
      jobId: "job-1",
      interviewerId: null,
      title: "Screening",
      type: "screening",
      mode: "phone",
      status: "scheduled",
      scheduledAt: new Date("2099-01-01T15:00:00.000Z"),
      durationMins: 45,
      location: null,
      meetLink: null,
      notes: null,
      source: "api",
      gcalEventId: null,
      teamsMeetingId: null,
      zoomMeetingId: null,
      jitsiRoom: null,
    } as never;

    await runApiInterviewSideEffects({
      workspaceId: "ws-1",
      actorUserId: "user-1",
      interview,
      action: "scheduled",
    });

    expect(mocks.trackInterviewSync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        interviewId: "iv-1",
        provider: "google_calendar",
        operation: "upsert",
      }),
    );
    const sync = mocks.trackInterviewSync.mock.calls[0]?.[0] as {
      run: () => Promise<unknown>;
      isSuccess: (result: unknown) => boolean;
    };
    const result = await sync.run();
    expect(result).toEqual({ ok: false, reason: "not_connected" });
    expect(sync.isSuccess(result)).toBe(false);
  });
});
