import { describe, expect, it, vi } from "vitest";

// F1-14: application confirmation + recruiter notification emails must go
// through the durable email_outbox (enqueue + immediate process attempt) instead
// of a fire-and-forget `void`. This asserts the wiring: one candidate row plus
// one row per owner, with the right kinds/payloads, and that delivery is
// delegated to the idempotent worker.

const mocks = vi.hoisted(() => {
  return {
    enqueueEmailOutbox: vi.fn(),
    processEmailOutbox: vi.fn(),
  };
});

vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: mocks.enqueueEmailOutbox,
  processEmailOutbox: mocks.processEmailOutbox,
}));

import { sendApplicationReceivedEmails } from "./notifications";

const EMAIL = {
  workspaceId: "ws-1",
  workspaceName: "Acme",
  workspaceSlug: "acme",
  applicationId: "application-1",
  candidateEmail: "candi@example.com",
  candidateFirstName: "Candi",
  candidateName: "Candi Date",
  jobTitle: "Engineer",
  ownerEmails: ["owner-a@example.com", "owner-b@example.com"],
};

describe("F1-14 application-received emails use the durable outbox", () => {
  it("enqueues one candidate + one recruiter row per owner and processes them", async () => {
    mocks.enqueueEmailOutbox
      .mockResolvedValueOnce("out-candidate")
      .mockResolvedValueOnce("out-owner-a")
      .mockResolvedValueOnce("out-owner-b");
    mocks.processEmailOutbox.mockResolvedValue({ processed: 3, sent: 3, failed: 0 });

    await sendApplicationReceivedEmails(EMAIL as never);

    expect(mocks.enqueueEmailOutbox).toHaveBeenCalledTimes(3);

    const kinds = mocks.enqueueEmailOutbox.mock.calls.map((c) => c[1]);
    expect(kinds).toEqual([
      "application.received.candidate",
      "application.received.recruiter",
      "application.received.recruiter",
    ]);

    const candidatePayload = mocks.enqueueEmailOutbox.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(candidatePayload).toMatchObject({
      candidateEmail: "candi@example.com",
      jobTitle: "Engineer",
      workspaceSlug: "acme",
      applicationId: "application-1",
    });

    const recruiterPayload = mocks.enqueueEmailOutbox.mock.calls[1]?.[2] as Record<string, unknown>;
    expect(recruiterPayload).toMatchObject({
      ownerEmail: "owner-a@example.com",
      candidateName: "Candi Date",
    });

    expect(mocks.processEmailOutbox).toHaveBeenCalledTimes(1);
    expect(mocks.processEmailOutbox.mock.calls[0]?.[0]).toMatchObject({
      ids: ["out-candidate", "out-owner-a", "out-owner-b"],
      workspaceId: "ws-1",
    });
  });
});
