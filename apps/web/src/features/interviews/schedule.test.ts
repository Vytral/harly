import { beforeEach, describe, expect, it, vi } from "vitest";

// F1-12: the server rejects an interview that overlaps an existing `scheduled`
// interview for the same interviewer.
// F1-10: a video interview uses exactly one provider (Zoom > Teams > Meet) and
// persists the deterministic link the candidate receives.
// F1-11: rescheduling/editing a video interview recreates the Teams/Zoom meeting
// so the provider never keeps a stale time.

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const transactionImpl = vi.fn();
  return {
    selectQueue,
    transactionImpl,
    getWorkspaceContext: vi.fn(),
    requirePermission: vi.fn(),
    sendWorkspaceEmail: vi.fn(),
    getWorkspaceEmailBranding: vi.fn(),
    getInboundReplyTo: vi.fn(),
    renderActiveEmailTemplate: vi.fn(),
    getZoomToken: vi.fn(),
    getWorkspaceOutlookConfig: vi.fn(),
    getWorkspaceGCalConfig: vi.fn(),
    syncInterviewToZoom: vi.fn(),
    cancelInterviewZoomMeeting: vi.fn(),
    syncInterviewToTeams: vi.fn(),
    cancelInterviewTeamsMeeting: vi.fn(),
    syncInterviewToGCal: vi.fn(),
    cancelInterviewGCalEvent: vi.fn(),
    updateInterviewGCalEvent: vi.fn(),
    emitWebhookEvent: vi.fn(),
    updateReturn: [] as unknown[],
  };
});

function makeQuery() {
  const q: Record<string, unknown> = {};
  q.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve);
  q.from = () => q;
  q.where = () => q;
  q.innerJoin = () => q;
  q.leftJoin = () => q;
  q.orderBy = () => q;
  q.limit = () => q;
  return q;
}

function txQuery(value: unknown) {
  const q: Record<string, unknown> = {};
  q.then = (resolve: (v: unknown) => void) => Promise.resolve(value).then(resolve);
  q.from = () => q;
  q.where = () => q;
  q.innerJoin = () => q;
  q.leftJoin = () => q;
  q.orderBy = () => q;
  q.limit = () => q;
  return q;
}

vi.mock("@harly/db", () => ({
  db: {
    select: vi.fn(makeQuery),
    insert: vi.fn(() => ({
      values: () => ({
        returning: async () => [{ id: "iv-1" }],
        onConflictDoNothing: () => ({ returning: async () => [{ id: "iv-1" }] }),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({ returning: async () => mocks.updateReturn }),
      }),
    })),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transactionImpl(fn),
  },
  activityEvents: {},
  applications: {},
  candidateFiles: {},
  candidates: {},
  interviews: {},
  jobs: {},
  organization: {},
  user: {},
  workspaceSettings: {},
}));

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/email", () => ({
  sendWorkspaceEmail: mocks.sendWorkspaceEmail,
  getWorkspaceEmailBranding: mocks.getWorkspaceEmailBranding,
}));
vi.mock("@/lib/email/inbound-token", () => ({ getInboundReplyTo: mocks.getInboundReplyTo }));
vi.mock("@/features/email-templates/data", () => ({
  renderActiveEmailTemplate: mocks.renderActiveEmailTemplate,
}));
vi.mock("@/lib/zoom/config", () => ({ getZoomToken: mocks.getZoomToken }));
vi.mock("@/lib/zoom/sync", () => ({
  syncInterviewToZoom: mocks.syncInterviewToZoom,
  cancelInterviewZoomMeeting: mocks.cancelInterviewZoomMeeting,
}));
vi.mock("@/lib/outlook/config", () => ({ getWorkspaceOutlookConfig: mocks.getWorkspaceOutlookConfig }));
vi.mock("@/lib/outlook/teams-sync", () => ({
  syncInterviewToTeams: mocks.syncInterviewToTeams,
  cancelInterviewTeamsMeeting: mocks.cancelInterviewTeamsMeeting,
}));
vi.mock("@/lib/gcal/config", () => ({ getWorkspaceGCalConfig: mocks.getWorkspaceGCalConfig }));
vi.mock("@/lib/gcal/sync", () => ({
  syncInterviewToGCal: mocks.syncInterviewToGCal,
  cancelInterviewGCalEvent: mocks.cancelInterviewGCalEvent,
  updateInterviewGCalEvent: mocks.updateInterviewGCalEvent,
}));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: mocks.emitWebhookEvent }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getServerLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { scheduleInterview, rescheduleInterview } from "./actions";

beforeEach(() => {
  mocks.selectQueue.length = 0;
  mocks.transactionImpl.mockReset();
  mocks.syncInterviewToZoom.mockReset();
  mocks.syncInterviewToTeams.mockReset();
  mocks.syncInterviewToGCal.mockReset();
  mocks.cancelInterviewTeamsMeeting.mockReset();
  mocks.cancelInterviewZoomMeeting.mockReset();
  mocks.updateInterviewGCalEvent.mockReset();
  mocks.sendWorkspaceEmail.mockResolvedValue(undefined);
  mocks.getWorkspaceEmailBranding.mockResolvedValue({});
  mocks.getInboundReplyTo.mockResolvedValue(null);
  mocks.renderActiveEmailTemplate.mockResolvedValue(null);
  mocks.getWorkspaceContext.mockResolvedValue({
    organization: { id: "ws-1" },
    user: { id: "user-1" },
  });
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.getZoomToken.mockResolvedValue(null);
  mocks.getWorkspaceOutlookConfig.mockResolvedValue(null);
  mocks.getWorkspaceGCalConfig.mockResolvedValue(null);
});

function txMock(application: unknown[], conflict: unknown[]) {
  mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    let step = 0;
    const tx = {
      select: () => txQuery(step++ === 0 ? application : conflict),
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: "iv-1" }],
          onConflictDoNothing: () => ({ returning: async () => [{ id: "iv-1" }] }),
        }),
      }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    };
    return fn(tx);
  });
}

describe("F1-12 interviewer overlap", () => {
  it("rejects an interview that overlaps an existing scheduled interview", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], [{ id: "existing" }]);

    const result = await scheduleInterview({
      workspaceId: "ws-1",
      candidateId: "candidate-1",
      applicationId: "app-1",
      type: "screening",
      mode: "video",
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMins: 45,
      interviewerId: "interviewer-1",
    });

    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/overlapping/i);
  });
});

describe("F1-10 single video provider", () => {
  it("uses Zoom when available and does not create Meet/Teams", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.getZoomToken.mockResolvedValue({ accessToken: "z" });
    // recipient + synced meetLink
    mocks.selectQueue.push(
      [{ email: "c@example.com", firstName: "C", lastName: "D", companyName: "A", jobTitle: "J" }],
      [{ meetLink: "https://zoom.us/j/1" }],
    );

    const result = await scheduleInterview({
      workspaceId: "ws-1",
      candidateId: "candidate-1",
      applicationId: "app-1",
      type: "screening",
      mode: "video",
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMins: 45,
    });

    expect(result.success).toBe(true);
    expect(mocks.syncInterviewToZoom).toHaveBeenCalledTimes(1);
    expect(mocks.syncInterviewToTeams).not.toHaveBeenCalled();
    expect(mocks.syncInterviewToGCal).not.toHaveBeenCalled();
  });
});

describe("F1-11 reschedule recreates provider meeting", () => {
  it("cancels and recreates the Teams meeting when the time changes", async () => {
    mocks.selectQueue.push(
      [{ id: "iv-1", gcalEventId: null, teamsMeetingId: "teams-1", zoomMeetingId: null, title: "Screening", type: "screening" }],
      [{ email: "c@example.com", firstName: "C", lastName: "D", companyName: "A", jobTitle: "J", type: "screening", mode: "video", interviewerId: null, applicationId: "app-1" }],
      [{ meetLink: "https://teams.microsoft.com/1" }],
    );

    const result = await rescheduleInterview({
      interviewId: "iv-1",
      candidateId: "candidate-1",
      scheduledAt: new Date(Date.now() + 7200_000).toISOString(),
      durationMins: 45,
    });

    expect(result.success).toBe(true);
    expect(mocks.cancelInterviewTeamsMeeting).toHaveBeenCalledWith(
      expect.objectContaining({ teamsMeetingId: "teams-1" }),
    );
    expect(mocks.syncInterviewToTeams).toHaveBeenCalledTimes(1);
    expect(mocks.cancelInterviewZoomMeeting).not.toHaveBeenCalled();
    expect(mocks.updateInterviewGCalEvent).not.toHaveBeenCalled();
  });
});
