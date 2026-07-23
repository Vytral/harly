import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const values = vi.fn();
  const notifyInboundEmail = vi.fn();

  return {
    selectResults,
    values,
    notifyInboundEmail,
    selectChain: () => {
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      chain.from = () => chain;
      chain.innerJoin = () => chain;
      chain.where = () => chain;
      chain.orderBy = () => chain;
      chain.limit = async () => selectResults.shift() ?? [];
      return chain;
    },
  };
});

vi.mock("@harly/db", () => ({
  applications: {
    id: "applications.id",
    candidateId: "applications.candidateId",
    jobId: "applications.jobId",
    inboundToken: "applications.inboundToken",
    workspaceId: "applications.workspaceId",
  },
  candidates: {
    id: "candidates.id",
    firstName: "candidates.firstName",
    lastName: "candidates.lastName",
  },
  candidateMessages: {
    id: "candidateMessages.id",
    workspaceId: "candidateMessages.workspaceId",
    providerMessageId: "candidateMessages.providerMessageId",
  },
  mailThreads: {
    id: "mailThreads.id",
    workspaceId: "mailThreads.workspaceId",
    mailboxId: "mailThreads.mailboxId",
    source: "mailThreads.source",
    conversationId: "mailThreads.conversationId",
    candidateId: "mailThreads.candidateId",
    applicationId: "mailThreads.applicationId",
    normalizedSubject: "mailThreads.normalizedSubject",
    participantEmail: "mailThreads.participantEmail",
    status: "mailThreads.status",
    lastMessageAt: "mailThreads.lastMessageAt",
    unreadCount: "mailThreads.unreadCount",
  },
  mailMessages: {
    id: "mailMessages.id",
    workspaceId: "mailMessages.workspaceId",
    threadId: "mailMessages.threadId",
    messageId: "mailMessages.messageId",
    createdAt: "mailMessages.createdAt",
  },
  mailAttachments: {},
  db: {
    select: vi.fn(mocks.selectChain),
    insert: vi.fn(() => ({
      values: (...args: unknown[]) => {
        mocks.values(...args);
        return {
          onConflictDoNothing: () => ({
            returning: async () => [{ id: "message-1", threadId: "thread-existing" }],
          }),
          returning: async () => [{ id: "message-1", threadId: "thread-existing" }],
        };
      },
    })),
    update: vi.fn(() => ({
      set: () => ({ where: async () => [] }),
    })),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
  desc: (...args: unknown[]) => args,
  sql: (...args: unknown[]) => args,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getServerLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}));

vi.mock("@/lib/storage", () => ({
  storage: { getPresignedUploadUrl: vi.fn() },
}));
vi.mock("@/server/notify/inbox", () => ({
  notifyInboundEmail: mocks.notifyInboundEmail,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@harly/db";
import { processInboundEmail } from "./inbound-processor";

const email = {
  messageId: "provider-message-1",
  from: "candidate@example.com",
  to: ["reply+token@updates.example.com"],
  subject: "Availability",
  textBody: "I can meet next week.",
  attachments: [],
  receivedAt: new Date(),
};

describe("processInboundEmail", () => {
  beforeEach(() => {
    mocks.selectResults.length = 0;
    mocks.values.mockClear();
    mocks.notifyInboundEmail.mockClear();
    vi.mocked(db.insert).mockClear();
  });

  it("records a routed reply and alerts the hiring team", async () => {
    mocks.selectResults.push(
      [{ id: "application-1", candidateId: "candidate-1", jobId: "job-1" }],
      [],
    );

    await processInboundEmail(email, "workspace-1");

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        source: "legacy-webhook",
        candidateId: "candidate-1",
        applicationId: "application-1",
        mailboxId: null,
      }),
    );
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        candidateId: "candidate-1",
        applicationId: "application-1",
        direction: "inbound",
        messageId: "provider-message-1",
      }),
    );
    expect(mocks.notifyInboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        jobId: "job-1",
        candidateId: "candidate-1",
        subject: "Availability",
      }),
    );
  });

  it("does not duplicate a provider retry already recorded for the workspace", async () => {
    mocks.selectResults.push(
      [{ id: "application-1", candidateId: "candidate-1", jobId: "job-1" }],
      [{ id: "message-1", threadId: "thread-1" }],
    );

    await processInboundEmail(email, "workspace-1");

    expect(mocks.notifyInboundEmail).not.toHaveBeenCalled();
  });

  it("resolves the existing canonical thread when messageId is new", async () => {
    mocks.selectResults.push(
      // Application routed by the plus-address token.
      [{ id: "application-1", candidateId: "candidate-1", jobId: "job-1" }],
      // No message with this provider messageId exists yet.
      [],
      // Contextual canonical-thread lookup: same candidate, application,
      // normalized subject and open status.
      [{ id: "thread-existing", conversationId: "conversation-existing" }],
    );

    await processInboundEmail(email, "workspace-1");

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        threadId: "thread-existing",
        candidateId: "candidate-1",
        applicationId: "application-1",
        messageId: "provider-message-1",
      }),
    );
    expect(mocks.notifyInboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        candidateId: "candidate-1",
        threadId: "thread-existing",
      }),
    );
  });

  it("rejects untrusted inbound attachments (size/type/filename) and stores only valid ones", async () => {
    mocks.selectResults.push(
      [{ id: "application-1", candidateId: "candidate-1", jobId: "job-1" }],
      [],
    );

    const { storage } = await import("@/lib/storage");
    const malicious = {
      ...email,
      attachments: [
        {
          filename: "../../evil.exe",
          contentType: "application/x-msdownload",
          content: Buffer.alloc(10),
        },
        {
          filename: "too-big.pdf",
          contentType: "application/pdf",
          content: Buffer.alloc(30 * 1024 * 1024),
        },
        {
          filename: "ok.pdf",
          contentType: "application/pdf",
          content: Buffer.alloc(10),
        },
      ],
    };

    await processInboundEmail(malicious, "workspace-1");

    expect(vi.mocked(storage.getPresignedUploadUrl)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(storage.getPresignedUploadUrl)).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining("ok.pdf"),
      }),
    );
  });
});
