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
    requireApplicationPermission: vi.fn(),
    requireInterviewPermission: vi.fn(),
    sendWorkspaceEmail: vi.fn(),
    getWorkspaceEmailBranding: vi.fn(),
    getInboundReplyTo: vi.fn(),
    renderActiveEmailTemplate: vi.fn(),
    getZoomToken: vi.fn(),
    getWorkspaceOutlookConfig: vi.fn(),
    getWorkspaceGCalConfig: vi.fn(),
    getWorkspaceJitsiConfig: vi.fn(),
    syncInterviewToZoom: vi.fn(),
    cancelInterviewZoomMeeting: vi.fn(),
    replaceInterviewToZoom: vi.fn(),
    syncInterviewToJitsi: vi.fn(),
    cancelInterviewJitsiMeeting: vi.fn(),
    syncInterviewToTeams: vi.fn(),
    cancelInterviewTeamsMeeting: vi.fn(),
    replaceInterviewToTeams: vi.fn(),
    syncInterviewToGCal: vi.fn(),
    cancelInterviewGCalEvent: vi.fn(),
    updateInterviewGCalEvent: vi.fn(),
    execute: vi.fn(),
    emitWebhookEvent: vi.fn(),
    enqueueEmailOutbox: vi.fn(),
    processEmailOutbox: vi.fn(),
    updateReturn: [] as unknown[],
    updateSets: [] as Array<Record<string, unknown>>,
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
  q.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(value).then(resolve);
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
        onConflictDoNothing: () => ({
          returning: async () => [{ id: "iv-1" }],
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({ returning: async () => mocks.updateReturn }),
      }),
    })),
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transactionImpl(fn),
  },
  member: { userId: {}, organizationId: {} },
  activityEvents: {},
  applications: {},
  candidatePortalNotifications: {},
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
  requireApplicationPermission: mocks.requireApplicationPermission,
  requireInterviewPermission: mocks.requireInterviewPermission,
}));
vi.mock("@/lib/email", () => ({
  sendWorkspaceEmail: mocks.sendWorkspaceEmail,
  getWorkspaceEmailBranding: mocks.getWorkspaceEmailBranding,
}));
vi.mock("@/lib/email/inbound-token", () => ({
  getInboundReplyTo: mocks.getInboundReplyTo,
}));
vi.mock("@/features/email-templates/data", () => ({
  renderActiveEmailTemplate: mocks.renderActiveEmailTemplate,
}));
vi.mock("@/lib/zoom/config", () => ({ getZoomToken: mocks.getZoomToken }));
vi.mock("@/lib/zoom/sync", () => ({
  syncInterviewToZoom: mocks.syncInterviewToZoom,
  cancelInterviewZoomMeeting: mocks.cancelInterviewZoomMeeting,
  replaceInterviewToZoom: mocks.replaceInterviewToZoom,
}));
vi.mock("@/lib/outlook/config", () => ({
  getWorkspaceOutlookConfig: mocks.getWorkspaceOutlookConfig,
}));
vi.mock("@/lib/outlook/teams-sync", () => ({
  syncInterviewToTeams: mocks.syncInterviewToTeams,
  cancelInterviewTeamsMeeting: mocks.cancelInterviewTeamsMeeting,
  replaceInterviewToTeams: mocks.replaceInterviewToTeams,
}));
vi.mock("@/lib/gcal/config", () => ({
  getWorkspaceGCalConfig: mocks.getWorkspaceGCalConfig,
}));
vi.mock("@/lib/jitsi/config", () => ({
  getWorkspaceJitsiConfig: mocks.getWorkspaceJitsiConfig,
}));
vi.mock("@/lib/jitsi/sync", () => ({
  syncInterviewToJitsi: mocks.syncInterviewToJitsi,
  cancelInterviewJitsiMeeting: mocks.cancelInterviewJitsiMeeting,
}));
vi.mock("@/lib/interviews/sync-ledger", () => ({
  trackInterviewSync: async ({ run }: { run: () => Promise<unknown> }) => run(),
}));
vi.mock("@/lib/gcal/sync", () => ({
  syncInterviewToGCal: mocks.syncInterviewToGCal,
  cancelInterviewGCalEvent: mocks.cancelInterviewGCalEvent,
  updateInterviewGCalEvent: mocks.updateInterviewGCalEvent,
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getServerLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: mocks.enqueueEmailOutbox,
  processEmailOutbox: mocks.processEmailOutbox,
}));

import {
  generateInterviewBriefAction,
  scheduleInterview,
  rescheduleInterview,
  summarizeInterviewNotesAction,
  updateInterview,
} from "./actions";

beforeEach(() => {
  mocks.selectQueue.length = 0;
  mocks.transactionImpl.mockReset();
  mocks.requireInterviewPermission.mockReset();
  mocks.syncInterviewToZoom.mockReset();
  mocks.syncInterviewToTeams.mockReset();
  mocks.syncInterviewToGCal.mockReset();
  mocks.cancelInterviewTeamsMeeting.mockReset();
  mocks.cancelInterviewZoomMeeting.mockReset();
  mocks.replaceInterviewToTeams.mockReset();
  mocks.replaceInterviewToTeams.mockResolvedValue({
    ok: true,
    meetingId: "teams-2",
    joinUrl: "https://teams.microsoft.com/2",
  });
  mocks.replaceInterviewToZoom.mockReset();
  mocks.replaceInterviewToZoom.mockResolvedValue({
    ok: true,
    meetingId: "zoom-2",
    joinUrl: "https://zoom.us/j/2",
  });
  mocks.updateInterviewGCalEvent.mockReset();
  mocks.execute.mockReset();
  mocks.execute.mockResolvedValue([]);
  mocks.enqueueEmailOutbox.mockReset();
  mocks.enqueueEmailOutbox.mockResolvedValue("outbox-1");
  mocks.processEmailOutbox.mockReset();
  mocks.processEmailOutbox.mockResolvedValue({
    processed: 1,
    sent: 1,
    failed: 0,
  });
  mocks.updateSets.length = 0;
  mocks.sendWorkspaceEmail.mockResolvedValue(undefined);
  mocks.getWorkspaceEmailBranding.mockResolvedValue({});
  mocks.getInboundReplyTo.mockResolvedValue(null);
  mocks.renderActiveEmailTemplate.mockResolvedValue(null);
  mocks.getWorkspaceContext.mockResolvedValue({
    organization: { id: "ws-1" },
    user: { id: "user-1" },
  });
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.requireApplicationPermission.mockResolvedValue(undefined);
  mocks.getZoomToken.mockResolvedValue(null);
  mocks.getWorkspaceOutlookConfig.mockResolvedValue(null);
  mocks.getWorkspaceGCalConfig.mockResolvedValue(null);
  mocks.getWorkspaceJitsiConfig.mockResolvedValue(null);
  mocks.syncInterviewToJitsi.mockReset();
  mocks.cancelInterviewJitsiMeeting.mockReset();
});

function txMock(application: unknown[], conflict: unknown[]) {
  mocks.transactionImpl.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      let step = 0;
      const tx = {
        execute: mocks.execute,
        select: () => txQuery(step++ === 0 ? application : conflict),
        insert: () => ({
          values: () => ({
            returning: async () => [{ id: "iv-1" }],
            onConflictDoNothing: () => ({
              returning: async () => [{ id: "iv-1" }],
            }),
          }),
        }),
        update: () => ({
          set: () => ({ where: () => ({ returning: async () => [{ id: "iv-1" }] }) }),
        }),
      };
      return fn(tx);
    },
  );
}

describe("F1-12 interviewer overlap", () => {
  it("rejects an interview that overlaps an existing scheduled interview", async () => {
    mocks.selectQueue.push([{ userId: "interviewer-1" }]);
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
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});

describe("F1-10 single video provider", () => {
  it("uses Zoom when available and does not create Meet/Teams", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.getZoomToken.mockResolvedValue({ accessToken: "z" });
    // recipient + synced meetLink
    mocks.selectQueue.push(
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
        },
      ],
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

  it("falls back to Jitsi when no other provider is configured", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.getWorkspaceJitsiConfig.mockResolvedValue({
      baseUrl: "https://meet.jit.si",
    });
    mocks.selectQueue.push(
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
        },
      ],
      [{ meetLink: "https://meet.jit.si/abc-defg-hij" }],
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
    expect(mocks.syncInterviewToJitsi).toHaveBeenCalledTimes(1);
    expect(mocks.syncInterviewToZoom).not.toHaveBeenCalled();
    expect(mocks.syncInterviewToTeams).not.toHaveBeenCalled();
    expect(mocks.syncInterviewToGCal).not.toHaveBeenCalled();
  });

  it("Zoom still wins over Jitsi when both are configured", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.getZoomToken.mockResolvedValue({ accessToken: "z" });
    mocks.getWorkspaceJitsiConfig.mockResolvedValue({
      baseUrl: "https://meet.jit.si",
    });
    mocks.selectQueue.push(
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
        },
      ],
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
    expect(mocks.syncInterviewToJitsi).not.toHaveBeenCalled();
  });

  it("reports a Teams creation failure instead of hiding it", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.getWorkspaceOutlookConfig.mockResolvedValue({
      accessToken: "outlook",
    });
    mocks.syncInterviewToTeams.mockResolvedValue(null);
    mocks.selectQueue.push(
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
        },
      ],
      [{ meetLink: null }],
    );

    const result = await scheduleInterview({
      workspaceId: "ws-1",
      candidateId: "candidate-1",
      applicationId: "app-1",
      type: "screening",
      mode: "video",
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMins: 45,
      meetingProvider: "teams",
    });

    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/Teams could not create/i);
  });

  it("reports a Jitsi creation failure instead of hiding it", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.getWorkspaceJitsiConfig.mockResolvedValue({
      baseUrl: "https://meet.jit.si",
    });
    mocks.syncInterviewToJitsi.mockResolvedValue(null);
    mocks.selectQueue.push(
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
        },
      ],
      [{ meetLink: null }],
    );

    const result = await scheduleInterview({
      workspaceId: "ws-1",
      candidateId: "candidate-1",
      applicationId: "app-1",
      type: "screening",
      mode: "video",
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMins: 45,
      meetingProvider: "jitsi",
    });

    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/Jitsi could not create/i);
  });
});

describe("interview invitation delivery", () => {
  it("reports a failed invitation instead of hiding it behind a generic success", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.processEmailOutbox.mockResolvedValue({
      processed: 1,
      sent: 0,
      failed: 1,
    });
    mocks.selectQueue.push(
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
        },
      ],
      [{ meetLink: null }],
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
    expect(result.emailStatus).toBe("failed");
    expect(result.warning).toMatch(/invitation email could not be sent/i);
  });

  it("does not enqueue an invitation when email notification is disabled", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.selectQueue.push(
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
        },
      ],
      [{ meetLink: null }],
    );

    const result = await scheduleInterview({
      workspaceId: "ws-1",
      candidateId: "candidate-1",
      applicationId: "app-1",
      type: "screening",
      mode: "video",
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMins: 45,
      sendEmail: false,
    });

    expect(result.success).toBe(true);
    expect(result.emailStatus).toBe("skipped");
    expect(mocks.enqueueEmailOutbox).not.toHaveBeenCalled();
    expect(mocks.processEmailOutbox).not.toHaveBeenCalled();
  });
});

describe("F1-11 reschedule recreates provider meeting", () => {
  it("cancels and recreates the Teams meeting when the time changes", async () => {
    txMock([], []);
    mocks.selectQueue.push(
      [
        {
          id: "iv-1",
          status: "scheduled",
          gcalEventId: null,
          teamsMeetingId: "teams-1",
          zoomMeetingId: null,
          title: "Screening",
          type: "screening",
        },
      ],
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
          type: "screening",
          mode: "video",
          interviewerId: null,
          applicationId: "app-1",
        },
      ],
      [{ meetLink: "https://teams.microsoft.com/1" }],
    );

    const result = await rescheduleInterview({
      interviewId: "iv-1",
      candidateId: "candidate-1",
      scheduledAt: new Date(Date.now() + 7200_000).toISOString(),
      durationMins: 45,
    });


    expect(result.success).toBe(true);
    expect(mocks.replaceInterviewToTeams).toHaveBeenCalledWith(
      expect.objectContaining({ previousMeetingId: "teams-1" }),
    );
    expect(mocks.replaceInterviewToTeams).toHaveBeenCalledTimes(1);
    expect(mocks.cancelInterviewZoomMeeting).not.toHaveBeenCalled();
    expect(mocks.updateInterviewGCalEvent).not.toHaveBeenCalled();
  });
});

describe("F1-11 full edit preserves effective meeting details", () => {
  it("editing a title keeps the existing duration and recreates a video provider", async () => {
    txMock([], []);
    mocks.selectQueue.push(
      [
        {
          id: "iv-1",
          status: "scheduled",
          gcalEventId: null,
          teamsMeetingId: "teams-1",
          zoomMeetingId: null,
          scheduledAt: new Date("2026-08-01T10:00:00.000Z"),
          durationMins: 60,
          type: "screening",
          mode: "video",
          title: "Screening",
        },
      ],
      [
        {
          email: "c@example.com",
          firstName: "C",
          companyName: "A",
          jobTitle: "J",
          interviewerId: null,
          mode: "video",
          scheduledAt: new Date("2026-08-01T10:00:00.000Z"),
          applicationId: "app-1",
        },
      ],
    );

    const result = await updateInterview({
      interviewId: "iv-1",
      candidateId: "candidate-1",
      title: "Technical screen",
    });


    expect(result.success).toBe(true);
    expect(mocks.replaceInterviewToTeams).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMins: 60,
        summary: "Technical screen",
      }),
    );
  });
});

describe("Google Calendar failure visibility", () => {
  it("returns a warning when a rescheduled GCal event cannot be updated", async () => {
    txMock([], []);
    mocks.updateInterviewGCalEvent.mockResolvedValue(false);
    mocks.selectQueue.push(
      [
        {
          id: "iv-gcal",
          status: "scheduled",
          gcalEventId: "event-1",
          teamsMeetingId: null,
          zoomMeetingId: null,
          jitsiRoom: null,
          meetLink: null,
          location: null,
          scheduledAt: new Date("2099-08-01T10:00:00.000Z"),
          durationMins: 45,
          type: "screening",
          mode: "phone",
          title: "Screening",
        },
      ],
      [
        {
          email: null,
          firstName: "C",
          companyName: "A",
          jobTitle: "J",
          interviewerId: null,
          mode: "phone",
          scheduledAt: new Date("2099-08-01T10:00:00.000Z"),
          applicationId: "app-1",
        },
      ],
    );

    const result = await updateInterview({
      interviewId: "iv-gcal",
      scheduledAt: "2099-08-01T11:00",
      timeZone: "UTC",
    });

    expect(result).toEqual({
      success: true,
      warning: expect.stringMatching(/Google Calendar/i),
    });
  });
});

describe("AI scheduling resilience", () => {
  it("keeps an explicit meeting link and reports a calendar reconnect warning", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);
    mocks.getWorkspaceGCalConfig.mockResolvedValue({
      oauth2Client: {},
      calendarId: "primary",
    });
    mocks.syncInterviewToGCal.mockResolvedValue({
      ok: false,
      reason: "invalid_grant",
    });
    mocks.selectQueue.push(
      [
        {
          email: "c@example.com",
          firstName: "C",
          lastName: "D",
          companyName: "A",
          jobTitle: "J",
        },
      ],
      [{ meetLink: null }],
    );

    const result = await scheduleInterview({
      workspaceId: "ws-1",
      candidateId: "candidate-1",
      applicationId: "app-1",
      type: "screening",
      mode: "video",
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMins: 60,
      title: "Introduction to Syntrix",
      location: "https://meet.google.com/wdk-sfc-xck",
      meetingProvider: "external",
    });

    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/Google Calendar.*reconnect/i);
    expect(mocks.syncInterviewToGCal).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Introduction to Syntrix",
        location: "https://meet.google.com/wdk-sfc-xck",
      }),
    );
    expect(mocks.syncInterviewToZoom).not.toHaveBeenCalled();
  });
});

describe("F1-12b past time is rejected", () => {
  it("refuses to schedule an interview with a past date/time", async () => {
    txMock([{ id: "app-1", jobId: "job-1" }], []);

    const result = await scheduleInterview({
      workspaceId: "ws-1",
      candidateId: "candidate-1",
      applicationId: "app-1",
      type: "screening",
      mode: "video",
      scheduledAt: new Date(Date.now() - 3600_000).toISOString(),
      durationMins: 45,
    });

    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/future/i);
  });
});

describe("F1-12c reschedule re-validates interviewer conflict", () => {
  it("rejects a reschedule that overlaps the interviewer's existing interview", async () => {
    // rescheduleInterview select order: row, info (with interviewerId),
    // interviewer email, hasInterviewerConflict (→ conflict row), synced meetLink.
    mocks.selectQueue.push(
      [
        {
          id: "iv-1",
          status: "scheduled",
          gcalEventId: null,
          teamsMeetingId: null,
          zoomMeetingId: null,
          title: "Screening",
          type: "screening",
        },
      ],
      [
        {
          email: "c@example.com",
          firstName: "C",
          companyName: "A",
          jobTitle: "J",
          type: "screening",
          mode: "video",
          interviewerId: "interviewer-1",
          applicationId: "app-1",
        },
      ],
      [{ email: "i@example.com" }], // interviewer email
      [{ id: "other-iv" }], // conflict found
    );

    const result = await rescheduleInterview({
      interviewId: "iv-1",
      candidateId: "candidate-1",
      scheduledAt: new Date(Date.now() + 7200_000).toISOString(),
      durationMins: 45,
    });

    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/overlapping/i);
  });
});

describe("F1-12d reschedule honours the recruiter timezone", () => {
  it("interprets a naive wall-clock time in the given timezone, not UTC", async () => {
    txMock([], []);
    // America/Santiago is UTC-4 in August (no DST), so 10:00 wall-clock
    // becomes 14:00 UTC. A UTC interpretation would be 10:00Z.
    mocks.selectQueue.push(
      [
        {
          id: "iv-1",
          status: "scheduled",
          gcalEventId: null,
          teamsMeetingId: null,
          zoomMeetingId: null,
          title: "Screening",
          type: "screening",
        },
      ],
      [
        {
          email: "c@example.com",
          firstName: "C",
          companyName: "A",
          jobTitle: "J",
          type: "screening",
          mode: "phone",
          interviewerId: null,
          applicationId: "app-1",
        },
      ],
      [{ meetLink: null }], // synced meetLink lookup
    );

    const result = await rescheduleInterview({
      interviewId: "iv-1",
      candidateId: "candidate-1",
      scheduledAt: "2099-08-01T10:00",
      timeZone: "America/Santiago",
      durationMins: 45,
    });


    expect(result.success).toBe(true);
    // The webhook payload carries the resolved ISO time. Assert it reflects
    // the tz-adjusted time (14:00Z), not a naive UTC parse (10:00Z).
    expect(mocks.emitWebhookEvent).toHaveBeenCalledWith(
      "ws-1",
      "interview.rescheduled",
      expect.objectContaining({
        interview: expect.objectContaining({
          scheduledAt: "2099-08-01T14:00:00.000Z",
        }),
      }),
      { actorId: "user-1", skipDomainEvent: true },
    );
  });
});

describe("interview business state guards", () => {
  it("does not reschedule an interview that was already canceled", async () => {
    mocks.selectQueue.push([
      {
        id: "iv-canceled",
        status: "canceled",
        gcalEventId: null,
        teamsMeetingId: null,
        zoomMeetingId: null,
        jitsiRoom: null,
        title: "Screening",
        type: "screening",
      },
    ]);

    const result = await rescheduleInterview({
      interviewId: "iv-canceled",
      scheduledAt: new Date(Date.now() + 7200_000).toISOString(),
      durationMins: 45,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer scheduled/i);
    expect(mocks.transactionImpl).not.toHaveBeenCalled();
  });

  it("does not edit an interview that was already completed", async () => {
    mocks.selectQueue.push([
      {
        id: "iv-completed",
        status: "completed",
        gcalEventId: null,
        teamsMeetingId: null,
        zoomMeetingId: null,
        jitsiRoom: null,
        meetLink: null,
        location: null,
        scheduledAt: new Date("2099-08-01T10:00:00.000Z"),
        durationMins: 45,
        type: "screening",
        mode: "phone",
        title: "Screening",
      },
    ]);

    const result = await updateInterview({
      interviewId: "iv-completed",
      title: "Updated title",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer scheduled/i);
    expect(mocks.transactionImpl).not.toHaveBeenCalled();
  });
});

describe("interview AI authorization", () => {
  const interviewId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    mocks.requireInterviewPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );
  });

  it("rejects an out-of-scope interview brief before reading candidate data", async () => {
    await expect(generateInterviewBriefAction({ interviewId })).resolves.toEqual({
      success: false,
      error: "You do not have permission to generate briefs.",
    });

    expect(mocks.requireInterviewPermission).toHaveBeenCalledWith(
      "collab:write",
      interviewId,
    );
    expect(mocks.selectQueue).toHaveLength(0);
  });

  it("rejects out-of-scope note summarization before reading candidate data", async () => {
    await expect(
      summarizeInterviewNotesAction({ interviewId, rawNotes: "Private notes" }),
    ).resolves.toEqual({
      success: false,
      error: "You do not have permission to summarize notes.",
    });

    expect(mocks.requireInterviewPermission).toHaveBeenCalledWith(
      "collab:write",
      interviewId,
    );
    expect(mocks.selectQueue).toHaveLength(0);
  });
});
