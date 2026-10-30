import { beforeEach, describe, expect, it, vi } from "vitest";

// Mailbox reply/create actions must turn reservation conflicts into typed results
// (`code: "delivery_unknown"`) rather than throwing into the composer.

const mocks = vi.hoisted(() => ({
  queue: [] as unknown[][],
  sendCanonicalEmail: vi.fn(),
  reserveLegacy: vi.fn(),
  resolveUnknown: vi.fn(),
  flagEnabled: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/mailbox/compose-shared", async () => {
  const { z } = await import("zod");
  return {
    composerAttachmentsSchema: z.array(z.any()).optional(),
    decodeComposerAttachments: () => [],
    richBodyReact: () => null,
  };
});
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  desc: (value: unknown) => value,
  eq: (...values: unknown[]) => values,
  isNull: (value: unknown) => value,
}));

function chain() {
  const link: Record<string, unknown> = {};
  link.from = () => link;
  link.where = () => link;
  link.innerJoin = () => link;
  link.orderBy = () => link;
  link.limit = async () => mocks.queue.shift() ?? [];
  link.set = () => link;
  link.returning = async () => [];
  return link;
}

vi.mock("@harly/db", () => ({
  db: {
    select: () => chain(),
    update: () => chain(),
    insert: () => ({ values: () => ({ returning: async () => [{ id: "mm-1" }] }) }),
  },
  applications: { id: "id", candidateId: "candidateId", workspaceId: "workspaceId", jobId: "jobId", appliedAt: "appliedAt" },
  candidates: { id: "id", workspaceId: "workspaceId", deletedAt: "deletedAt", email: "email" },
  jobs: { id: "id", workspaceId: "workspaceId", deletedAt: "deletedAt" },
  mailMessages: { threadId: "threadId", workspaceId: "workspaceId", receivedAt: "receivedAt" },
  mailThreads: { id: "id", workspaceId: "workspaceId", lastMessageAt: "lastMessageAt" },
  member: {},
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: async () => ({
    organization: { id: "ws-1" },
    user: { id: "user-1", email: "recruiter@example.com" },
  }),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({ requirePermission: async () => ({}) }));
vi.mock("@/lib/mailbox/config", () => ({ getMailboxConfig: async () => null }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/mailbox/sync", () => ({ syncMailbox: vi.fn() }));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: vi.fn() }));
vi.mock("@/server/api/ratelimit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/ai/surfaces/mailbox-assistance", () => ({
  generateMailboxReplyWithAI: vi.fn(),
  generateMailboxSummaryWithAI: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/email", () => ({ getWorkspaceEmailSender: async () => ({ send: vi.fn() }) }));
vi.mock("@/lib/email/inbound-token", () => ({ getInboundReplyTo: async () => undefined }));
vi.mock("@/lib/mail/canonical", () => ({ insertCanonicalMessage: vi.fn() }));
vi.mock("@/lib/mail/feature-flag", () => ({
  isMailUnificationEnabled: async () => mocks.flagEnabled,
}));
vi.mock("@/lib/mail/send-canonical-email", () => ({
  sendCanonicalEmail: (...args: unknown[]) => mocks.sendCanonicalEmail(...args),
}));
vi.mock("@/lib/mail/legacy-delivery", () => ({
  completeLegacyMailDelivery: vi.fn(),
  failLegacyMailDelivery: vi.fn(),
  reserveLegacyMailDelivery: (...args: unknown[]) => mocks.reserveLegacy(...args),
  resolveUnknownMailDelivery: (...args: unknown[]) => mocks.resolveUnknown(...args),
}));

import { MailDeliveryConflictError } from "@/lib/mail/delivery-state";
import {
  createMailboxThreadAction,
  replyMailboxThreadAction,
  resolveUnknownMailDeliveryAction,
} from "@/features/mailbox/actions";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";
const THREAD = {
  id: THREAD_ID,
  workspaceId: "ws-1",
  candidateId: null,
  applicationId: null,
  participantEmail: "candidate@example.com",
  subject: "Hello",
};

beforeEach(() => {
  mocks.queue.length = 0;
  mocks.sendCanonicalEmail.mockReset();
  mocks.reserveLegacy.mockReset();
  mocks.resolveUnknown.mockReset();
  mocks.flagEnabled = true;
});

describe("mailbox actions and delivery conflicts", () => {
  it("returns a typed delivery_unknown result for a reply instead of throwing", async () => {
    mocks.queue.push([THREAD], []); // thread lookup, then last message
    mocks.sendCanonicalEmail.mockRejectedValue(new MailDeliveryConflictError("delivery_unknown"));

    const result = await replyMailboxThreadAction({
      threadId: THREAD_ID,
      body: "Following up",
      idempotencyKey: "compose-1",
      attachments: [],
    });

    expect(result).toMatchObject({ ok: false, code: "delivery_unknown" });
    expect((result as { error: string }).error).toContain("couldn't confirm this was sent");
  });

  it("maps an in-progress conflict on create to a typed result", async () => {
    mocks.flagEnabled = true;
    mocks.queue.push([]); // candidate lookup is skipped without a candidate id
    mocks.sendCanonicalEmail.mockRejectedValue(new MailDeliveryConflictError("delivery_in_progress"));

    const result = await createMailboxThreadAction({
      toEmail: "new@example.com",
      subject: "Hi",
      body: "Hello",
      idempotencyKey: "compose-2",
      attachments: [],
    });

    expect(result).toMatchObject({ ok: false, code: "delivery_in_progress" });
  });

  it("turns other canonical failures into a plain retryable error, never a thrown one", async () => {
    mocks.queue.push([THREAD], []);
    mocks.sendCanonicalEmail.mockRejectedValue(new Error("provider down"));

    const result = await replyMailboxThreadAction({
      threadId: THREAD_ID,
      body: "Hello",
      idempotencyKey: "compose-3",
      attachments: [],
    });

    expect(result).toEqual({ ok: false, error: "Unable to send. Please try again." });
  });

  it("confirms an unknown delivery as sent only when the server finds one", async () => {
    mocks.resolveUnknown.mockResolvedValueOnce(true);
    await expect(resolveUnknownMailDeliveryAction({ idempotencyKey: "compose-1" })).resolves.toEqual({ ok: true });
    expect(mocks.resolveUnknown).toHaveBeenCalledWith({ workspaceId: "ws-1", idempotencyKey: "compose-1" });

    mocks.resolveUnknown.mockResolvedValueOnce(false);
    await expect(resolveUnknownMailDeliveryAction({ idempotencyKey: "compose-9" })).resolves.toMatchObject({ ok: false });
  });
});
