import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (a: unknown, b: unknown) => [a, b],
}));
vi.mock("@harly/db", () => ({
  activityEvents: { t: "activityEvents" },
  applications: { t: "applications" },
  applicationStageHistory: { t: "history" },
  offers: { t: "offers" },
}));
vi.mock("@/features/pipeline/stage-resolver", () => ({
  ensureStageOfKind: vi.fn(async () => ({ id: "stage-hired" })),
}));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(async () => ({ eventId: "evt-1" })),
}));
vi.mock("./withdraw-siblings", () => ({
  withdrawSiblingApplicationsForHire: vi.fn(async () => []),
}));

import { applyOfferDecision, OfferDecisionError } from "./decision";

const OFFER = {
  id: "offer-1",
  applicationId: "app-1",
  candidateId: "cand-1",
  jobId: "job-1",
  title: "Engineer",
};

function fakeTx(application: Record<string, unknown> | null) {
  const calls: string[] = [];
  const tx = {
    select: () => {
      const q: Record<string, unknown> = {};
      q.from = () => q;
      q.where = () => q;
      q.for = (mode: string) => {
        calls.push(`lock:${mode}`);
        return q;
      };
      q.limit = async () => (application ? [application] : []);
      return q;
    },
    update: (table: { t: string }) => ({
      set: (set: Record<string, unknown>) => {
        calls.push(`update:${table.t}:${String(set.status)}`);
        return {
          where: () => ({
            returning: async () => [{ id: "offer-1", ...set }],
          }),
        };
      },
    }),
    insert: (table: { t: string }) => ({
      values: async (values: Record<string, unknown>) => {
        calls.push(`insert:${table.t}:${String(values.type ?? "")}`);
      },
    }),
  };
  return { tx: tx as never, calls };
}

const base = { workspaceId: "ws-1", actorUserId: "user-1", offer: OFFER };

describe("applyOfferDecision", () => {
  it("locks the application before it writes the offer when accepting", async () => {
    const { tx, calls } = fakeTx({
      id: "app-1",
      status: "active",
      currentStageId: "stage-old",
    });
    const result = await applyOfferDecision(tx, { ...base, decision: "accepted" });
    expect(calls[0]).toBe("lock:update");
    expect(calls.indexOf("update:offers:accepted")).toBeGreaterThan(0);
    expect(calls).toContain("update:applications:hired");
    expect(result.hiredEvent).toEqual({ eventId: "evt-1" });
    expect(result.offer).toMatchObject({ status: "accepted" });
    expect((result.offer as unknown as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
  });

  it.each(["rejected", "withdrawn", "hired"])(
    "refuses to accept when the application is %s, before any write",
    async (status) => {
      const { tx, calls } = fakeTx({ id: "app-1", status, currentStageId: null });
      await expect(
        applyOfferDecision(tx, { ...base, decision: "accepted" }),
      ).rejects.toMatchObject({ code: "applicationNotActive" });
      expect(calls.filter((c) => c.startsWith("update") || c.startsWith("insert"))).toEqual([]);
    },
  );

  it("reports a missing application", async () => {
    const { tx } = fakeTx(null);
    await expect(
      applyOfferDecision(tx, { ...base, decision: "accepted" }),
    ).rejects.toBeInstanceOf(OfferDecisionError);
  });

  it("declines without locking or touching the application", async () => {
    const { tx, calls } = fakeTx(null);
    const result = await applyOfferDecision(tx, { ...base, decision: "declined" });
    expect(calls).toEqual(["update:offers:declined", "insert:activityEvents:offer.declined"]);
    expect(result.hiredEvent).toBeNull();
  });
});
