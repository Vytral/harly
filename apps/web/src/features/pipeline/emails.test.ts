import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  process: vi.fn(),
  states: [] as Array<{ status: string }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ inArray: (...values: unknown[]) => values }));
vi.mock("@harly/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mocks.states,
      }),
    }),
  },
  emailOutbox: { id: "id", status: "status" },
}));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: mocks.enqueue,
  processEmailOutbox: mocks.process,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { sendPipelineEmails, type PipelineEmail } from "./emails";

const STAGE_EMAIL: PipelineEmail = {
  type: "stage",
  eventId: "hist-stage-1",
  applicationId: "app-1",
  candidateEmail: "c@example.com",
  candidateName: "Casey",
  jobTitle: "Engineer",
  stageName: "Interview",
  workspaceName: "Acme",
};

const REJECTED_EMAIL: PipelineEmail = {
  type: "rejected",
  eventId: "hist-rejected-1",
  applicationId: "app-2",
  candidateEmail: "d@example.com",
  candidateName: "Dana",
  jobTitle: "Engineer",
  workspaceName: "Acme",
};

beforeEach(() => {
  mocks.enqueue.mockReset();
  mocks.process.mockReset();
  mocks.states = [];
  let n = 0;
  mocks.enqueue.mockImplementation(async () => `outbox-${++n}`);
});

describe("sendPipelineEmails", () => {
  it("returns a summary without a warning when every email was sent", async () => {
    mocks.process.mockResolvedValue({ processed: 2, sent: 2, failed: 0 });
    mocks.states = [{ status: "sent" }, { status: "sent" }];

    const summary = await sendPipelineEmails("ws-1", [STAGE_EMAIL, REJECTED_EMAIL], "user-1");

    expect(summary).toEqual({ queued: 2, sent: 2, failed: 0, emailWarning: undefined });
    expect(mocks.process).toHaveBeenCalledWith({ ids: ["outbox-1", "outbox-2"], workspaceId: "ws-1" });
  });

  it("promises an automatic retry only when the row is still queued", async () => {
    mocks.process.mockResolvedValue({ processed: 1, sent: 0, failed: 1 });
    mocks.states = [{ status: "pending" }];

    const summary = await sendPipelineEmails("ws-1", [STAGE_EMAIL]);

    expect(summary.emailWarning).toBe(
      "The candidate email could not be sent right now and will be retried automatically.",
    );
    expect(summary.failed).toBe(0);
  });

  it("says plainly when an email reached a terminal failure", async () => {
    mocks.process.mockResolvedValue({ processed: 1, sent: 0, failed: 1 });
    mocks.states = [{ status: "failed" }];

    const summary = await sendPipelineEmails("ws-1", [STAGE_EMAIL]);

    expect(summary.failed).toBe(1);
    expect(summary.emailWarning).toContain("will not be retried automatically");
    expect(summary.emailWarning).toContain("Delivery log");
  });

  it("never throws into the stage move when queueing fails", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("database unavailable"));

    const summary = await sendPipelineEmails("ws-1", [STAGE_EMAIL]);

    expect(summary).toMatchObject({ queued: 0, sent: 0, failed: 1 });
    expect(summary.emailWarning).toContain("could not be queued");
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("does nothing for an empty batch", async () => {
    await expect(sendPipelineEmails("ws-1", [])).resolves.toEqual({ queued: 0, sent: 0, failed: 0 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});

describe("sendPipelineEmails durable event keys", () => {
  beforeEach(() => {
    mocks.states = [{ status: "sent" }];
    mocks.process.mockResolvedValue({ processed: 1, sent: 1, failed: 0 });
  });

  it("keys each email on its own stage move, so an identical repeat move is a new email", async () => {
    await sendPipelineEmails("ws-1", [{ ...STAGE_EMAIL, eventId: "hist-move-1" }]);
    await sendPipelineEmails("ws-1", [{ ...STAGE_EMAIL, eventId: "hist-move-2" }]);

    expect(mocks.enqueue.mock.calls[0][3]).toBe("pipeline:hist-move-1");
    expect(mocks.enqueue.mock.calls[1][3]).toBe("pipeline:hist-move-2");
    expect(mocks.enqueue.mock.calls[0][3]).not.toBe(mocks.enqueue.mock.calls[1][3]);
  });

  it("reuses the same key when the same move is retried", async () => {
    await sendPipelineEmails("ws-1", [STAGE_EMAIL]);
    await sendPipelineEmails("ws-1", [STAGE_EMAIL]);

    expect(mocks.enqueue.mock.calls[0][3]).toBe("pipeline:hist-stage-1");
    expect(mocks.enqueue.mock.calls[1][3]).toBe("pipeline:hist-stage-1");
  });
});

describe("sendPipelineEmails truthful outcomes", () => {
  beforeEach(() => {
    mocks.states = [];
    mocks.process.mockReset();
  });

  it("does not claim the email could not be queued when processing failed after the row was saved", async () => {
    mocks.process.mockRejectedValueOnce(new Error("socket hang up"));

    const summary = await sendPipelineEmails("ws-1", [STAGE_EMAIL]);

    expect(summary.queued).toBe(1);
    expect(summary.emailWarning).not.toContain("could not be queued");
    expect(summary.emailWarning).toContain("queued");
    expect(summary.emailWarning).toContain("retried automatically");
    // The outcome is unknown, so no sent count is reported.
    expect(summary.sent).toBeNull();
  });

  it("keeps the 'could not be queued' wording when the row itself was never saved", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("database unavailable"));

    const summary = await sendPipelineEmails("ws-1", [STAGE_EMAIL]);

    expect(summary.emailWarning).toContain("could not be queued");
  });
});

describe("sendPipelineEmails latency budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.states = [];
    mocks.process.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns after the budget with an accurate warning while delivery continues in the background", async () => {
    mocks.process.mockReturnValue(new Promise(() => {}));

    const pending = sendPipelineEmails("ws-1", [STAGE_EMAIL], "user-1");
    await vi.advanceTimersByTimeAsync(8_000);
    const summary = await pending;

    expect(summary.queued).toBe(1);
    expect(summary.emailWarning).toContain("taking longer than usual");
    expect(summary.emailWarning).toContain("will continue in the background");
    expect(summary.emailWarning).not.toContain("could not be queued");
  });
});
