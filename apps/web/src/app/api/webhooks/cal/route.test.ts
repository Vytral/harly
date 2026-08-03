import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  return {
    selectQueue,
    isNull: vi.fn(() => "active-candidate-filter"),
    verifyCalSignature: vi.fn(),
    syncInterviewToGCal: vi.fn(),
    cancelInterviewGCalEvent: vi.fn(),
    updateInterviewGCalEvent: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    persistDomainEvent: vi.fn(),
    publishPersistedDomainEvents: vi.fn(),
    emitWebhookEvent: vi.fn(),
    enqueueEmailOutbox: vi.fn(),
    processEmailOutbox: vi.fn(),
    getInboundReplyTo: vi.fn(),
    trackInterviewSync: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  desc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => [left, right],
  exists: (value: unknown) => ({ exists: value }),
  isNull: mocks.isNull,
}));

vi.mock("@harly/db", () => {
  const makeQuery = () => {
    const query: Record<string, unknown> = {};
    query.from = () => query;
    query.innerJoin = () => query;
    query.where = () => query;
    query.orderBy = () => query;
    query.limit = async () => mocks.selectQueue.shift() ?? [];
    return query;
  };

  return {
    db: {
      select: vi.fn(makeQuery),
      insert: mocks.insert,
      update: mocks.update,
      transaction: mocks.transaction,
    },
    applications: {},
    candidates: { workspaceId: "workspaceId", deletedAt: "deletedAt" },
    candidatePortalNotifications: {},
    interviews: {
      id: "interviewId",
      workspaceId: "interviewWorkspaceId",
      calBookingUid: "calBookingUid",
      candidateId: "interviewCandidateId",
      status: "interviewStatus",
    },
    jobs: { id: "jobId", workspaceId: "jobWorkspaceId", deletedAt: "jobDeletedAt" },
    organization: { id: "organizationId", name: "organizationName" },
    workspaceSettings: { organizationId: "settingsWorkspaceId", calWebhookSecret: "secret" },
  };
});

vi.mock("@/lib/cal/client", () => ({
  verifyCalSignature: mocks.verifyCalSignature,
}));
vi.mock("@/lib/gcal/sync", () => ({
  syncInterviewToGCal: mocks.syncInterviewToGCal,
  cancelInterviewGCalEvent: mocks.cancelInterviewGCalEvent,
  updateInterviewGCalEvent: mocks.updateInterviewGCalEvent,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: mocks.persistDomainEvent,
  publishPersistedDomainEvents: mocks.publishPersistedDomainEvents,
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
}));
vi.mock("@/lib/email/inbound-token", () => ({
  getInboundReplyTo: mocks.getInboundReplyTo,
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: mocks.enqueueEmailOutbox,
  processEmailOutbox: mocks.processEmailOutbox,
}));
vi.mock("@/lib/interviews/sync-ledger", () => ({
  trackInterviewSync: mocks.trackInterviewSync,
}));

import { POST } from "./route";

function requestWithMetadata(triggerEvent = "BOOKING_CREATED") {
  const body = JSON.stringify({
      triggerEvent,
      payload: {
        uid: "booking-1",
        startTime: "2030-01-01T10:00:00.000Z",
        metadata: { applicationId: "app-deleted", candidateId: "cand-deleted" },
      },
    });
  return {
    nextUrl: { searchParams: new URLSearchParams("ws=ws-1") },
    headers: new Headers({ "x-cal-signature-256": "valid" }),
    text: async () => body,
  };
}

function scheduledInterview() {
  const now = new Date("2030-01-01T10:00:00.000Z");
  return {
    id: "interview-1",
    workspaceId: "ws-1",
    applicationId: "app-1",
    candidateId: "cand-1",
    jobId: "job-1",
    interviewerId: null,
    title: "Screening",
    type: "screening",
    mode: "video",
    status: "scheduled",
    scheduledAt: now,
    durationMins: 45,
    location: null,
    notes: null,
    source: "cal.com",
    calBookingUid: "booking-1",
    gcalEventId: null,
    meetLink: null,
    teamsMeetingId: null,
    zoomMeetingId: null,
    jitsiRoom: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("POST /api/webhooks/cal", () => {
  beforeEach(() => {
    mocks.selectQueue.length = 0;
    mocks.isNull.mockClear();
    mocks.verifyCalSignature.mockReturnValue(true);
    mocks.insert.mockReset();
    mocks.update.mockReset();
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({ returning: async () => [] }),
      }),
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        select: vi.fn(() => ({
          from: () => ({
            where: () => ({
              limit: async () => mocks.selectQueue.shift() ?? [],
            }),
          }),
        })),
        update: mocks.update,
        insert: mocks.insert,
      }),
    );
    mocks.persistDomainEvent.mockResolvedValue({ eventId: "event-1" });
    mocks.publishPersistedDomainEvents.mockResolvedValue(undefined);
    mocks.emitWebhookEvent.mockResolvedValue(undefined);
    mocks.trackInterviewSync.mockResolvedValue(false);
    mocks.enqueueEmailOutbox.mockResolvedValue("outbox-1");
    mocks.processEmailOutbox.mockResolvedValue({ sent: 1, failed: 0 });
    mocks.getInboundReplyTo.mockResolvedValue(undefined);
  });

  it("does not create an interview for an inactive candidate application", async () => {
    // workspace settings, then application resolution through the active candidate.
    mocks.selectQueue.push([{ secret: "cal-secret" }], []);

    const response = await POST(await requestWithMetadata() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      skipped: "could not resolve candidate",
    });
    expect(mocks.isNull).toHaveBeenCalledWith("deletedAt");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not mutate or resync an interview after its candidate is deleted", async () => {
    mocks.selectQueue.push([{ secret: "cal-secret" }]);

    const response = await POST(await requestWithMetadata("BOOKING_CANCELLED") as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.cancelInterviewGCalEvent).not.toHaveBeenCalled();
  });

  it("does not emit a second transition for a duplicate Cal reschedule", async () => {
    const interview = scheduledInterview();
    mocks.selectQueue.push(
      [{ secret: "cal-secret" }],
      [interview],
      [interview],
    );

    const response = await POST(
      await requestWithMetadata("BOOKING_RESCHEDULED") as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      skipped: "already terminal or inactive",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.persistDomainEvent).not.toHaveBeenCalled();
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
  });
});
