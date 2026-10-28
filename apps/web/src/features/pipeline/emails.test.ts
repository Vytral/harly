import { beforeEach, describe, expect, it, vi } from "vitest";

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
  applicationId: "app-1",
  candidateEmail: "c@example.com",
  candidateName: "Casey",
  jobTitle: "Engineer",
  stageName: "Interview",
  workspaceName: "Acme",
};

const REJECTED_EMAIL: PipelineEmail = {
  type: "rejected",
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
