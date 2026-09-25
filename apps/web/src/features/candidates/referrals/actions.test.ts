import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  requirePermission: vi.fn(),
  requireJobPermission: vi.fn(),
  getWorkspaceContext: vi.fn(),
  createReferralRecord: vi.fn(),
  deleteReferralRecord: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
  emitWebhookEvent: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock("@harly/db", () => {
  const query = () => {
    const builder: Record<string, unknown> = {};
    builder.from = () => builder;
    builder.where = () => builder;
    builder.limit = () => builder;
    builder.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(mocks.selectQueue.shift() ?? []).then(resolve);
    return builder;
  };
  return {
    db: {
      select: vi.fn(query),
      update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    },
    candidateReferrals: {},
    candidates: {},
    member: {},
  };
});

vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
  requireJobPermission: mocks.requireJobPermission,
}));
vi.mock("@/server/events/emit", () => ({
  publishPersistedDomainEvents: mocks.publishPersistedDomainEvents,
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./service", () => ({
  createReferralRecord: mocks.createReferralRecord,
  deleteReferralRecord: mocks.deleteReferralRecord,
  serializeReferral: (value: unknown) => value,
}));

import { deleteReferral, referCandidate, toggleReferralFeatured } from "./actions";

const context = {
  organization: { id: "workspace-1" },
  user: { id: "actor-1", email: "actor@example.com" },
};

describe("candidate referral actions", () => {
  beforeEach(() => {
    mocks.selectQueue.length = 0;
    vi.clearAllMocks();
    mocks.getWorkspaceContext.mockResolvedValue(context);
    mocks.requirePermission.mockResolvedValue(context);
    mocks.requireJobPermission.mockResolvedValue(context);
    mocks.createReferralRecord.mockResolvedValue({
      referral: { id: "referral-1" },
      event: { eventId: "event-1" },
    });
    mocks.deleteReferralRecord.mockResolvedValue({ eventId: "event-delete" });
  });

  it("allows a self-attributed referral with only collab:write", async () => {
    mocks.selectQueue.push([{ id: "candidate-1" }]);

    await expect(
      referCandidate({
        candidateId: "candidate-1",
        workspaceId: "workspace-1",
        referredById: "actor-1",
      }),
    ).resolves.toEqual({ success: true });

    expect(mocks.requirePermission).toHaveBeenCalledTimes(1);
    expect(mocks.requirePermission).toHaveBeenCalledWith("collab:write");
  });

  it("requires candidates:edit when attributing a referral to another member", async () => {
    mocks.selectQueue.push(
      [{ userId: "other-user" }],
      [{ id: "candidate-1" }],
    );

    await referCandidate({
      candidateId: "candidate-1",
      workspaceId: "workspace-1",
      referredById: "other-user",
    });

    expect(mocks.requirePermission).toHaveBeenNthCalledWith(1, "collab:write");
    expect(mocks.requirePermission).toHaveBeenNthCalledWith(2, "candidates:edit");
  });

  it("rejects an inactive or foreign referrer even when the actor can edit candidates", async () => {
    mocks.selectQueue.push([]);

    const result = await referCandidate({
      candidateId: "candidate-1",
      workspaceId: "workspace-1",
      referredById: "inactive-user",
    });

    expect(result).toEqual({
      success: false,
      error: "Referrer is not an active member of this workspace.",
    });
    expect(mocks.createReferralRecord).not.toHaveBeenCalled();
  });

  it("requires candidates:edit for a featured referral", async () => {
    mocks.selectQueue.push([{ id: "candidate-1" }]);

    await referCandidate({
      candidateId: "candidate-1",
      workspaceId: "workspace-1",
      featured: true,
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith("collab:write");
    expect(mocks.requirePermission).toHaveBeenCalledWith("candidates:edit");
  });

  it("rejects a candidate from another workspace without writing", async () => {
    mocks.selectQueue.push([]);

    const result = await referCandidate({
      candidateId: "foreign-candidate",
      workspaceId: "workspace-1",
    });

    expect(result).toEqual({ success: false, error: "Candidate not found." });
    expect(mocks.createReferralRecord).not.toHaveBeenCalled();
  });

  it("returns a friendly duplicate error", async () => {
    mocks.selectQueue.push([{ id: "candidate-1" }]);
    mocks.createReferralRecord.mockResolvedValue({ duplicate: true });

    const result = await referCandidate({
      candidateId: "candidate-1",
      workspaceId: "workspace-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already referred/i);
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
  });

  it("derives the deletion target from the loaded referral and escalates for another actor", async () => {
    mocks.selectQueue.push([
      {
        id: "referral-1",
        workspaceId: "workspace-1",
        candidateId: "actual-candidate",
        createdById: "other-user",
        jobId: null,
      },
    ]);

    await deleteReferral({ referralId: "referral-1" });

    expect(mocks.requirePermission).toHaveBeenCalledWith("collab:write");
    expect(mocks.requirePermission).toHaveBeenCalledWith("candidates:edit");
    expect(mocks.deleteReferralRecord).toHaveBeenCalledWith(
      {},
      {
        id: "referral-1",
        workspaceId: "workspace-1",
        candidateId: "actual-candidate",
      },
      "actor-1",
    );
  });

  it("does not publish duplicate side effects after an idempotent delete", async () => {
    mocks.selectQueue.push([
      {
        id: "referral-1",
        workspaceId: "workspace-1",
        candidateId: "candidate-1",
        createdById: "actor-1",
        jobId: null,
      },
    ]);
    mocks.deleteReferralRecord.mockResolvedValue(null);

    await deleteReferral({ referralId: "referral-1" });

    expect(mocks.publishPersistedDomainEvents).not.toHaveBeenCalled();
    expect(mocks.emitWebhookEvent).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("never exposes a cross-workspace referral through toggle", async () => {
    mocks.selectQueue.push([]);

    await expect(
      toggleReferralFeatured({ referralId: "foreign-referral", featured: true }),
    ).resolves.toEqual({ success: false, error: "Referral not found." });
  });
});
