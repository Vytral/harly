import { beforeEach, describe, expect, it, vi } from "vitest";

// Canonical sends must reach the provider at most once per idempotency key.
// The idempotency row is modelled in memory so each scenario can assert both the
// number of provider calls and the stored status.

const state = vi.hoisted(() => ({
  idem: null as Record<string, unknown> | null,
  send: vi.fn(),
  insertCanonical: vi.fn(),
  flagEnabled: true,
  senderError: null as unknown,
  failAcceptanceWrites: false,
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  isNull: (...values: unknown[]) => values,
}));

vi.mock("@harly/db", () => {
  const fakeDb = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (state.idem) return [];
            state.idem = {
              id: "idem-1",
              threadId: null,
              mailMessageId: null,
              providerMessageId: null,
              error: null,
              ...values,
              status: values.status ?? "pending",
            };
            return [state.idem];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (state.idem ? [state.idem] : []),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        if (state.failAcceptanceWrites && values.status === "sent") {
          throw new Error("connection reset after accept");
        }
        const apply = () => {
          if (state.idem) Object.assign(state.idem, values);
          return state.idem ? [state.idem] : [];
        };
        return {
          where: () => {
            const rows = apply();
            return Object.assign(Promise.resolve(rows), {
              returning: async () => rows,
            });
          },
        };
      },
    }),
  };
  return {
    db: fakeDb,
    mailIdempotencyKeys: {
      id: "id",
      workspaceId: "workspaceId",
      idempotencyKey: "idempotencyKey",
      status: "status",
    },
    candidates: { id: "id", workspaceId: "workspaceId", deletedAt: "deletedAt" },
    applications: { id: "id" },
    jobs: { id: "id" },
    candidateMessages: { id: "id" },
    mailUnificationMigrations: {},
  };
});

vi.mock("@/lib/email", () => ({
  getWorkspaceEmailSender: async () => {
    if (state.senderError) throw state.senderError;
    return { send: state.send };
  },
}));
vi.mock("./canonical", () => ({
  insertCanonicalMessage: (...args: unknown[]) => state.insertCanonical(...args),
}));
vi.mock("./feature-flag", () => ({
  isMailUnificationEnabled: async () => state.flagEnabled,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { DeliveryOutcomeUnknownError } from "@harly/emails";

import { MailDeliveryConflictError } from "./delivery-state";
import { sendCanonicalEmail, type SendCanonicalEmailInput } from "./send-canonical-email";

const INPUT: SendCanonicalEmailInput = {
  workspaceId: "ws-1",
  idempotencyKey: "compose-1",
  toEmail: "candidate@example.com",
  subject: "Re: Hello",
  textBody: "Hello there",
  sourceHint: "smtp",
  authorId: "user-1",
};

const CANONICAL_OK = { messageId: "mail-1", threadId: "thread-1", duplicate: false };

beforeEach(() => {
  state.idem = null;
  state.send.mockReset();
  state.insertCanonical.mockReset();
  state.flagEnabled = true;
  state.senderError = null;
  state.failAcceptanceWrites = false;
});

describe("sendCanonicalEmail", () => {
  it("records sent with its thread and message ids on success", async () => {
    state.send.mockResolvedValue({ messageId: "prov-1" });
    state.insertCanonical.mockResolvedValue(CANONICAL_OK);

    const result = await sendCanonicalEmail(INPUT);

    expect(result).toMatchObject({ delivered: true, persisted: true, threadId: "thread-1" });
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.idem).toMatchObject({ status: "sent", providerMessageId: "prov-1", mailMessageId: "mail-1" });
  });

  it("never marks an accepted message failed when saving the conversation fails afterwards", async () => {
    state.send.mockResolvedValue({ messageId: "prov-1" });
    state.insertCanonical.mockRejectedValue(new Error("write failed"));

    const result = await sendCanonicalEmail(INPUT);

    expect(result).toMatchObject({ delivered: true, persisted: false, threadId: "" });
    expect(state.idem?.status).toBe("sent");
    expect(state.idem?.status).not.toBe("failed");
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("completes only the saving step when the same key is retried after a persistence failure", async () => {
    state.send.mockResolvedValue({ messageId: "prov-1" });
    state.insertCanonical.mockRejectedValueOnce(new Error("write failed"));
    await sendCanonicalEmail(INPUT);

    state.insertCanonical.mockResolvedValue(CANONICAL_OK);
    const replay = await sendCanonicalEmail(INPUT);

    expect(replay).toMatchObject({ delivered: true, persisted: true, threadId: "thread-1", idempotentReplay: true });
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.idem).toMatchObject({ status: "sent", mailMessageId: "mail-1" });
  });

  it("refuses to re-send a key whose outcome is unknown and reports a typed conflict", async () => {
    // The first send creates the row with its real payload hash; then the row is
    // moved to the state a reconciliation pass would leave it in.
    state.send.mockResolvedValueOnce({ messageId: "prov-1" });
    state.insertCanonical.mockResolvedValue(CANONICAL_OK);
    await sendCanonicalEmail(INPUT);
    state.idem = { ...state.idem!, status: "unknown", mailMessageId: null, providerMessageId: null };
    state.send.mockClear();

    const attempt = sendCanonicalEmail(INPUT);
    await expect(attempt).rejects.toBeInstanceOf(MailDeliveryConflictError);
    await expect(attempt).rejects.toMatchObject({ code: "delivery_unknown" });
    expect(state.send).not.toHaveBeenCalled();
  });

  it("keeps a provider rejection retryable under the same key", async () => {
    state.send.mockRejectedValueOnce(new Error("Resend rejected email"));
    await expect(sendCanonicalEmail(INPUT)).rejects.toThrow("Resend rejected email");
    expect(state.idem?.status).toBe("failed");

    state.send.mockResolvedValueOnce({ messageId: "prov-2" });
    state.insertCanonical.mockResolvedValue(CANONICAL_OK);
    const retry = await sendCanonicalEmail(INPUT);

    expect(retry).toMatchObject({ delivered: true });
    expect(state.send).toHaveBeenCalledTimes(2);
  });

  it("reports a key another request is sending as in progress", async () => {
    state.send.mockResolvedValueOnce({ messageId: "prov-1" });
    state.insertCanonical.mockResolvedValue(CANONICAL_OK);
    await sendCanonicalEmail(INPUT);
    state.idem = { ...state.idem!, status: "sending", mailMessageId: null, providerMessageId: null };
    state.send.mockClear();

    await expect(sendCanonicalEmail(INPUT)).rejects.toMatchObject({ code: "delivery_in_progress" });
    expect(state.send).not.toHaveBeenCalled();
  });

  it("marks the key failed when the sender cannot even be constructed, so it is never stuck in sending", async () => {
    state.senderError = new Error("Workspace email config is corrupt");

    await expect(sendCanonicalEmail(INPUT)).rejects.toThrow("Workspace email config is corrupt");

    expect(state.send).not.toHaveBeenCalled();
    expect(state.idem?.status).toBe("failed");
  });

  it("treats an SMTP outcome that is unknown after the message was handed over as unknown, not failed", async () => {
    state.send.mockRejectedValueOnce(new DeliveryOutcomeUnknownError("SMTP socket closed after DATA"));

    await expect(sendCanonicalEmail(INPUT)).rejects.toMatchObject({
      code: "delivery_unknown",
    });
    expect(state.idem?.status).toBe("unknown");

    // A same-key retry needs an explicit choice: it must not send again.
    state.send.mockClear();
    await expect(sendCanonicalEmail(INPUT)).rejects.toMatchObject({ code: "delivery_unknown" });
    expect(state.send).not.toHaveBeenCalled();
  });

  it("keeps a definitive SMTP rejection retryable under the same key", async () => {
    state.send.mockRejectedValueOnce(Object.assign(new Error("550 mailbox unavailable"), { responseCode: 550 }));
    await expect(sendCanonicalEmail(INPUT)).rejects.toThrow("550 mailbox unavailable");
    expect(state.idem?.status).toBe("failed");
  });

  it("says a same-key retry finishes saving the record when the acceptance was recorded", async () => {
    state.send.mockResolvedValue({ messageId: "prov-1" });
    state.insertCanonical.mockRejectedValue(new Error("write failed"));

    const result = await sendCanonicalEmail(INPUT);

    expect(result.persisted).toBe(false);
    expect(result.legacyWriteWarning).toBe(
      "Sent, but the conversation record could not be saved. Retrying this send will not send it again and will finish saving the record.",
    );
  });

  it("describes the saved-record failure truthfully when the acceptance itself could not be recorded", async () => {
    state.send.mockResolvedValue({ messageId: "prov-1" });
    state.insertCanonical.mockRejectedValue(new Error("write failed"));
    state.failAcceptanceWrites = true;

    const result = await sendCanonicalEmail(INPUT);

    expect(result.persisted).toBe(false);
    expect(result.legacyWriteWarning).toBe(
      "Sent, but the delivery could not be recorded. It will not be sent again; check the sent folder before sending a new copy.",
    );
  });
});
