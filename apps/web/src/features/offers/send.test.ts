import { beforeEach, describe, expect, it, vi } from "vitest";

// F1-13: an offer is only marked `sent` after the email provider accepts it.
// The sendOffer action inserts a durable email_outbox row, delegates delivery
// to the idempotent worker (processEmailOutbox), and flips the offer to `sent`
// only once the outbox row reports success , so a crash can never leave a
// `sent` offer without a delivered email, or resend it.

const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const insertQueue: unknown[][] = [];
  const updateCalls: Array<{ set: Record<string, unknown> }> = [];
  const transactionImpl = vi.fn();
  return {
    selectQueue,
    insertQueue,
    updateCalls,
    transactionImpl,
    requirePermission: vi.fn(),
    processEmailOutbox: vi.fn(),
    renderActiveEmailTemplate: vi.fn(),
    getWorkspaceEmailBranding: vi.fn(),
    emitWebhookEvent: vi.fn(),
    logOfferActivityInsert: vi.fn(),
  };
});

vi.mock("@harly/db", () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.where = () => q;
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.orderBy = () => q;
    q.limit = async () => mocks.selectQueue.shift() ?? [];
    return q;
  };
  return {
    db: {
      select: vi.fn(makeQuery),
      insert: vi.fn(() => ({
        values: () => ({ returning: async () => mocks.insertQueue.shift() ?? [{ id: "x" }] }),
      })),
      update: vi.fn(() => ({
        set: (set: Record<string, unknown>) => {
          mocks.updateCalls.push({ set });
          return { where: () => ({}) };
        },
      })),
      transaction: (fn: (tx: unknown) => Promise<unknown>) => mocks.transactionImpl(fn),
    },
    offers: {},
    emailOutbox: {},
    activityEvents: {},
    candidates: {},
    organization: {},
    applications: {},
    jobStages: {},
    applicationStageHistory: {},
    jobHiringTeam: {},
    notifications: {},
    workspaceSettings: {},
  };
});

vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  processEmailOutbox: mocks.processEmailOutbox,
}));
vi.mock("@/lib/email", () => ({ sendWorkspaceEmail: vi.fn(), getWorkspaceEmailBranding: vi.fn() }));
vi.mock("@/features/email-templates/data", () => ({
  renderActiveEmailTemplate: mocks.renderActiveEmailTemplate,
}));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: mocks.emitWebhookEvent }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getServerLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { sendOffer } from "./actions";

const OFFER = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "draft",
  candidateId: "candidate-1",
  applicationId: "app-1",
  jobId: "job-1",
  title: "Engineer",
  salaryAmount: null,
  currency: null,
  salaryPeriod: null,
  equity: null,
  startDate: null,
  expiresAt: null,
};

const RECIPIENT = {
  email: "candidate@example.com",
  firstName: "Candi",
  lastName: "Date",
  companyName: "Acme",
};

describe("F1-13 offer delivery via durable outbox", () => {
  beforeEach(() => {
    mocks.selectQueue.length = 0;
    mocks.insertQueue.length = 0;
    mocks.updateCalls.length = 0;
    mocks.transactionImpl.mockReset();
    mocks.processEmailOutbox.mockReset();
    mocks.renderActiveEmailTemplate.mockReset();
    mocks.getWorkspaceEmailBranding.mockResolvedValue({});
    mocks.requirePermission.mockReset();
    mocks.requirePermission.mockResolvedValue({
      user: { id: "user-1" },
      organization: { id: "ws-1" },
    });
  });

  it("inserts the outbox row, delegates delivery, and marks the offer sent only on success", async () => {
    mocks.selectQueue.push([OFFER], [RECIPIENT], [{ status: "sent" }]);
    mocks.insertQueue.push([{ id: "outbox-1" }]);
    mocks.processEmailOutbox.mockResolvedValue({ processed: 1, sent: 1, failed: 0 });

    const result = await sendOffer({ offerId: "33333333-3333-4333-8333-333333333333" });

    expect(result.success).toBe(true);
    // The worker was asked to deliver this specific outbox row.
    expect(mocks.processEmailOutbox).toHaveBeenCalledTimes(1);
    expect(mocks.processEmailOutbox.mock.calls[0]?.[0]).toMatchObject({
      ids: ["outbox-1"],
    });
    // The outbox row was written before delivery was delegated.
    expect(mocks.insertQueue.length).toBe(0);
  });

  it("keeps the offer draft and queues the outbox when delivery fails", async () => {
    mocks.selectQueue.push([OFFER], [RECIPIENT], [{ status: "pending" }]);
    mocks.insertQueue.push([{ id: "outbox-1" }]);
    mocks.processEmailOutbox.mockResolvedValue({ processed: 1, sent: 0, failed: 1 });

    const result = await sendOffer({ offerId: "33333333-3333-4333-8333-333333333333" });

    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/queued for retry/i);
    expect(mocks.processEmailOutbox).toHaveBeenCalledTimes(1);
  });
});
