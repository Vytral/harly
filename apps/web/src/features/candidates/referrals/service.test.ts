import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persistDomainEvent: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { transaction: vi.fn() },
  activityEvents: { id: "activity_events.id" },
  candidateReferrals: {
    id: "candidate_referrals.id",
    workspaceId: "candidate_referrals.workspace_id",
  },
}));

vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: mocks.persistDomainEvent,
}));

import { createReferralRecord, deleteReferralRecord } from "./service";

function referral(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-08-03T12:00:00.000Z");
  return {
    id: "referral-1",
    workspaceId: "workspace-1",
    candidateId: "candidate-1",
    jobId: "job-1",
    referredById: "referrer-1",
    createdById: "actor-1",
    note: "Strong recommendation",
    featured: false,
    featuredById: null,
    featuredAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTx(created: ReturnType<typeof referral> | null) {
  const activityValues = vi.fn(async () => undefined);
  const referralReturning = vi.fn(async () => (created ? [created] : []));
  const insert = vi.fn((table: unknown) => {
    if (table && typeof table === "object" && "workspaceId" in table) {
      return {
        values: () => ({
          onConflictDoNothing: () => ({ returning: referralReturning }),
        }),
      };
    }
    return { values: activityValues };
  });
  return { tx: { insert }, insert, activityValues, referralReturning };
}

describe("candidate referral service", () => {
  beforeEach(() => {
    mocks.persistDomainEvent.mockReset();
    mocks.persistDomainEvent.mockResolvedValue({ eventId: "event-1" });
  });

  it("absorbs a duplicate without writing activity or an event", async () => {
    const { tx, insert } = createTx(null);

    await expect(
      createReferralRecord(tx as never, {
        workspaceId: "workspace-1",
        candidateId: "candidate-1",
        jobId: "job-1",
        referredById: "referrer-1",
        createdById: "actor-1",
      }),
    ).resolves.toEqual({ duplicate: true });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(mocks.persistDomainEvent).not.toHaveBeenCalled();
  });

  it("records the authenticated actor separately from the credited referrer", async () => {
    const created = referral();
    const { tx, activityValues } = createTx(created);

    const result = await createReferralRecord(tx as never, {
      workspaceId: "workspace-1",
      candidateId: "candidate-1",
      jobId: "job-1",
      referredById: "referrer-1",
      createdById: "actor-1",
      featured: true,
    });

    expect(result).toEqual({ referral: created, event: { eventId: "event-1" } });
    expect(activityValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor-1",
        entityId: "candidate-1",
        metadata: expect.objectContaining({ referredById: "referrer-1" }),
      }),
    );
    expect(mocks.persistDomainEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: "actor-1",
        aggregateId: "candidate-1",
      }),
    );
  });

  it("does not emit a second lifecycle event when deletion is already complete", async () => {
    const returning = vi.fn(async () => []);
    const tx = {
      delete: () => ({
        where: () => ({ returning }),
      }),
      insert: vi.fn(),
    };

    await expect(
      deleteReferralRecord(
        tx as never,
        { id: "referral-1", workspaceId: "workspace-1", candidateId: "candidate-1" },
        "actor-1",
      ),
    ).resolves.toBeNull();

    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.persistDomainEvent).not.toHaveBeenCalled();
  });

  it("anchors delete activity and payload to the server-loaded candidate", async () => {
    const activityValues = vi.fn(async () => undefined);
    const tx = {
      delete: () => ({
        where: () => ({ returning: async () => [{ id: "referral-1" }] }),
      }),
      insert: () => ({ values: activityValues }),
    };

    await deleteReferralRecord(
      tx as never,
      { id: "referral-1", workspaceId: "workspace-1", candidateId: "actual-candidate" },
      "actor-1",
    );

    expect(activityValues).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "actual-candidate", actorId: "actor-1" }),
    );
    expect(mocks.persistDomainEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        aggregateId: "actual-candidate",
        payload: { referralId: "referral-1", candidateId: "actual-candidate" },
      }),
    );
  });
});
