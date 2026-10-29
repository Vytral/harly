import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  process: vi.fn(),
  // Results for each `.limit()` / `.orderBy()` read, in call order.
  reads: [] as unknown[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  desc: (value: unknown) => value,
  eq: (...values: unknown[]) => values,
  sql: (...values: unknown[]) => values,
}));
vi.mock("@harly/db", () => {
  const chain: Record<string, unknown> = {};
  const next = async () => mocks.reads.shift() ?? [];
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = next;
  return {
    db: { select: () => chain },
    emailOutbox: { id: "id", status: "status", payload: "payload", kind: "kind", workspaceId: "ws", createdAt: "createdAt" },
    interviews: { id: "id", workspaceId: "ws", updatedAt: "updatedAt" },
    user: { id: "userId", timezone: "timezone" },
  };
});
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: mocks.enqueue,
  processEmailOutbox: mocks.process,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { queueInterviewEmail } from "./email-queue";

const SCHEDULED_PAYLOAD = {
  interviewId: "interview-1",
  revision: 1_700_000_000_000,
  candidateEmail: "casey@example.test",
  candidateName: "Casey Doe",
  companyName: "Acme",
  jobTitle: "Engineer",
  scheduledAt: "2099-03-10T10:00:00.000Z",
  timeZone: "Europe/Madrid",
};

beforeEach(() => {
  mocks.enqueue.mockReset();
  mocks.process.mockReset();
  mocks.reads = [];
  mocks.enqueue.mockResolvedValue("outbox-1");
  mocks.process.mockResolvedValue({ processed: 1, sent: 1, failed: 0 });
});

describe("queueInterviewEmail dedupe key", () => {
  it("keys an email on the interview, the action, the time and the interview revision", async () => {
    mocks.reads = [[{ status: "sent" }]];

    await queueInterviewEmail("ws-1", "interview.scheduled", { ...SCHEDULED_PAYLOAD });

    expect(mocks.enqueue.mock.calls[0][3]).toBe(
      `interview:interview-1:interview.scheduled:2099-03-10T10:00:00.000Z:${SCHEDULED_PAYLOAD.revision}`,
    );
  });

  it("gives an identical re-invite after a cancel its own email", async () => {
    mocks.reads = [[{ status: "sent" }], [{ status: "sent" }]];

    await queueInterviewEmail("ws-1", "interview.scheduled", { ...SCHEDULED_PAYLOAD });
    await queueInterviewEmail("ws-1", "interview.scheduled", {
      ...SCHEDULED_PAYLOAD,
      revision: SCHEDULED_PAYLOAD.revision + 60_000,
    });

    expect(mocks.enqueue.mock.calls[0][3]).not.toBe(mocks.enqueue.mock.calls[1][3]);
  });
});

describe("queueInterviewEmail time zone for later changes", () => {
  it("sends a reschedule in the zone of the original invite, not the rescheduler's zone", async () => {
    mocks.reads = [
      [{ payload: { timeZone: "America/New_York" } }], // original invite
      [{ status: "sent" }], // delivery state
    ];

    await queueInterviewEmail(
      "ws-1",
      "interview.rescheduled",
      { ...SCHEDULED_PAYLOAD, timeZone: "Europe/Madrid" },
      "user-1",
    );

    expect(mocks.enqueue.mock.calls[0][2]).toMatchObject({ timeZone: "America/New_York" });
  });

  it("falls back to the requested zone when the original invite predates zone recording", async () => {
    mocks.reads = [[], [], [{ status: "sent" }]];

    await queueInterviewEmail(
      "ws-1",
      "interview.canceled",
      { ...SCHEDULED_PAYLOAD, timeZone: "Europe/Madrid" },
    );

    expect(mocks.enqueue.mock.calls[0][2]).toMatchObject({ timeZone: "Europe/Madrid" });
  });
});

describe("queueInterviewEmail truthful outcomes", () => {
  it("does not say the email could not be queued when processing failed after it was saved", async () => {
    mocks.reads = [[]];
    mocks.process.mockRejectedValueOnce(new Error("socket hang up"));

    const result = await queueInterviewEmail("ws-1", "interview.scheduled", { ...SCHEDULED_PAYLOAD });

    expect(result.status).toBe("failed");
    expect(result.warning).not.toContain("could not be queued");
    expect(result.warning).toContain("will be retried automatically");
  });

  it("says the email could not be queued when the row was never saved", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("database unavailable"));

    const result = await queueInterviewEmail("ws-1", "interview.scheduled", { ...SCHEDULED_PAYLOAD });

    expect(result.warning).toContain("could not be queued");
  });
});

describe("queueInterviewEmail latency budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns within the budget with an accurate warning while delivery continues", async () => {
    mocks.reads = [[{ status: "pending" }]];
    mocks.process.mockReturnValue(new Promise(() => {}));

    const pending = queueInterviewEmail("ws-1", "interview.scheduled", { ...SCHEDULED_PAYLOAD });
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await pending;

    expect(result.warning).toContain("taking longer than usual");
    expect(result.warning).toContain("will continue in the background");
    expect(result.warning).not.toContain("could not be queued");
  });
});
