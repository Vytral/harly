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
    },
    applications: {},
    candidates: { workspaceId: "workspaceId", deletedAt: "deletedAt" },
    interviews: {},
    jobs: { id: "jobId", workspaceId: "jobWorkspaceId", deletedAt: "jobDeletedAt" },
    workspaceSettings: {},
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
  });

  it("does not create an interview for an inactive candidate application", async () => {
    // workspace settings, then the workspace/application/candidate validation.
    mocks.selectQueue.push([{ secret: "cal-secret" }], []);

    const response = await POST(await requestWithMetadata() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      skipped: "application mismatch",
    });
    expect(mocks.isNull).toHaveBeenCalledWith("deletedAt");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not mutate or resync an interview after its candidate is deleted", async () => {
    mocks.selectQueue.push([{ secret: "cal-secret" }]);

    const response = await POST(await requestWithMetadata("BOOKING_CANCELLED") as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.cancelInterviewGCalEvent).not.toHaveBeenCalled();
  });
});
