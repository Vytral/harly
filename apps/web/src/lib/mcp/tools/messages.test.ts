import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireVisibleThread: vi.fn(),
  requireSendableCandidate: vi.fn(),
  loadApplicationContext: vi.fn(),
  listThreads: vi.fn(),
  createMailboxThreadAction: vi.fn(),
  replyMailboxThreadAction: vi.fn(),
  updateMailboxThreadAction: vi.fn(),
  sendBulkCandidateEmail: vi.fn(),
  getEmailTemplate: vi.fn(),
  createEmailTemplate: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [{ id: "tpl-1", name: "Welcome" }] }) }) },
  emailTemplates: { id: "id", name: "name", workspaceId: "workspaceId" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@/features/email-outbox/actions", () => ({
  cancelEmailDeliveryAction: vi.fn(),
  listEmailDeliveryLogAction: vi.fn(),
  retryEmailDeliveryAction: vi.fn(),
}));
vi.mock("@/features/email-templates/actions", () => ({
  createEmailTemplate: m.createEmailTemplate,
  deleteEmailTemplate: vi.fn(),
  setActiveEmailTemplate: vi.fn(),
  updateEmailTemplate: vi.fn(),
}));
vi.mock("@/features/email-templates/data", () => ({ getEmailTemplate: m.getEmailTemplate, listEmailTemplates: vi.fn() }));
vi.mock("@/features/candidates/actions", () => ({
  generateEmailDraftAction: vi.fn(),
  sendBulkCandidateEmail: m.sendBulkCandidateEmail,
}));
vi.mock("@/features/mailbox/compose-shared", async () => {
  const { z } = await import("zod");
  return {
    composerAttachmentSchema: () =>
      z.object({
        filename: z.string(),
        contentType: z.string(),
        base64: z.string(),
      }),
  };
});
vi.mock("@/features/mailbox/actions", () => ({
  createCandidateFromMailboxThreadAction: vi.fn(),
  createMailboxThreadAction: m.createMailboxThreadAction,
  linkMailboxThreadToApplicationAction: vi.fn(),
  linkMailboxThreadToCandidateAction: vi.fn(),
  markMailboxThreadReadAction: vi.fn(),
  replyMailboxThreadAction: m.replyMailboxThreadAction,
  suggestMailboxReplyAction: vi.fn(),
  summarizeMailboxThreadAction: vi.fn(),
  updateMailboxThreadAction: m.updateMailboxThreadAction,
}));
vi.mock("@/features/mailbox/data", () => ({
  getUnreadInboxThreadCount: vi.fn(),
  normalizeInboxFilter: (value: string) => value,
}));
vi.mock("@/features/notifications/actions", () => ({
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(async () => ({ success: true })),
  markNotificationUnread: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/features/notifications/data", () => ({ getUnreadNotificationCount: vi.fn(), listNotifications: vi.fn() }));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: "ws-1", name: "Acme" },
    user: { id: "user-1", email: "me@acme.test", name: "Max" },
  })),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireApplicationPermission: vi.fn(),
  requireCandidatePermission: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/storage", () => ({ storage: { read: vi.fn() } }));
vi.mock("./messages/queries", () => ({
  getAttachmentThreadId: vi.fn(),
  listThreadMessages: vi.fn(),
  listThreads: m.listThreads,
  listWorkspaceMembers: vi.fn(),
  loadApplicationContext: m.loadApplicationContext,
  requireSendableCandidate: m.requireSendableCandidate,
  requireVisibleThread: m.requireVisibleThread,
}));

import { MCP_SCOPES, McpToolError, type McpToolContext, type McpToolDefinition } from "../types";
import { messagesTools } from "./messages";

const ctx: McpToolContext = {
  workspaceId: "ws-1",
  userId: "user-1",
  clientName: "test",
  requestId: "req-1",
  appOrigin: "https://harly.example",
};
const THREAD = "11111111-1111-4111-8111-111111111111";
const CANDIDATE = "22222222-2222-4222-8222-222222222222";
const TEMPLATE = "33333333-3333-4333-8333-333333333333";

function tool(name: string): McpToolDefinition {
  const found = messagesTools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
}
const run = (name: string, input: Record<string, unknown>) => {
  const t = tool(name);
  return t.run(t.input.parse(input), ctx);
};

beforeEach(() => {
  vi.clearAllMocks();
  m.requireVisibleThread.mockResolvedValue({ id: THREAD });
  m.requireSendableCandidate.mockResolvedValue({ id: CANDIDATE, firstName: "Ana", lastName: "Diaz", email: "ana@acme.test" });
  m.loadApplicationContext.mockResolvedValue({ id: "app-1", jobTitle: "Engineer", stageName: "Screen" });
});

describe("messages tool registry", () => {
  it("has unique snake_case names prefixed messages_ in the messages group", () => {
    const names = messagesTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of messagesTools) {
      expect(t.name).toMatch(/^messages_[a-z]+(_[a-z]+)*$/);
      expect(t.group).toBe("messages");
      expect(MCP_SCOPES).toContain(t.scope);
      expect(t.description.length).toBeGreaterThan(40);
    }
  });

  it("sets all four annotations explicitly and keeps read tools read-only", () => {
    for (const t of messagesTools) {
      for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
        expect(typeof t.annotations[key]).toBe("boolean");
      }
      if (t.scope === "messages:read") expect(t.annotations.destructiveHint).toBe(false);
      if (t.annotations.readOnlyHint) expect(t.annotations.destructiveHint).toBe(false);
    }
  });

  it("marks every tool that sends email destructive and open-world, and says so", () => {
    const senders = ["messages_reply_thread", "messages_send_email", "messages_send_bulk_email", "messages_retry_delivery"];
    for (const name of senders) {
      const t = tool(name);
      expect(t.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
      expect(t.description).toMatch(/real email/i);
      expect(t.scope).toBe("messages:send");
    }
  });

  it("keeps AI drafting from sending anything", () => {
    for (const name of ["messages_draft_email", "messages_suggest_reply", "messages_summarize_thread"]) {
      expect(tool(name).annotations.destructiveHint).toBe(false);
      expect(tool(name).scope).toBe("messages:read");
    }
  });

  it("requires templates:manage for template writes and describes every input field", () => {
    for (const name of ["messages_create_template", "messages_update_template", "messages_delete_template", "messages_set_template_active"]) {
      expect(tool(name).permission).toBe("templates:manage");
    }
    for (const t of messagesTools) {
      const shape = (t.input as unknown as { shape: Record<string, { description?: string }> }).shape;
      for (const [key, field] of Object.entries(shape)) {
        expect(field.description, `${t.name}.${key}`).toBeTruthy();
      }
    }
  });
});

describe("messages_send_email", () => {
  it("always sends to the candidate's address on file and checks permission first", async () => {
    m.createMailboxThreadAction.mockResolvedValue({ ok: true, threadId: THREAD, delivered: true });
    const out = (await run("messages_send_email", {
      candidateId: CANDIDATE,
      subject: "Hello",
      body: "Hi Ana",
      idempotencyKey: "key-1",
    })) as { url: string; sent: boolean };
    expect(m.requireSendableCandidate).toHaveBeenCalledWith(CANDIDATE, "collab:write");
    expect(m.createMailboxThreadAction).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: CANDIDATE, toEmail: "ana@acme.test", idempotencyKey: "key-1" }),
    );
    expect(out.sent).toBe(true);
    expect(out.url).toBe(`https://harly.example/dashboard/inbox?thread=${THREAD}`);
  });

  it("generates a distinct key per call when none is supplied", async () => {
    m.createMailboxThreadAction.mockResolvedValue({ ok: true, threadId: THREAD, delivered: true });
    await run("messages_send_email", { candidateId: CANDIDATE, subject: "S", body: "B" });
    await run("messages_send_email", { candidateId: CANDIDATE, subject: "S", body: "B" });
    const keys = m.createMailboxThreadAction.mock.calls.map((call) => call[0].idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("renders a template for the candidate before sending", async () => {
    m.getEmailTemplate.mockResolvedValue({ id: TEMPLATE, subject: "About {{job_title}}", body: "<p>Hi {{candidate_first_name}}</p>" });
    m.createMailboxThreadAction.mockResolvedValue({ ok: true, threadId: THREAD, delivered: true });
    await run("messages_send_email", { candidateId: CANDIDATE, templateId: TEMPLATE });
    expect(m.createMailboxThreadAction).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "About Engineer", body: "Hi Ana" }),
    );
  });

  it("refuses to send when a template variable has no value", async () => {
    m.getEmailTemplate.mockResolvedValue({ id: TEMPLATE, subject: "S", body: "See you {{interview_date}}" });
    await expect(run("messages_send_email", { candidateId: CANDIDATE, templateId: TEMPLATE })).rejects.toThrow(/interview_date/);
    expect(m.createMailboxThreadAction).not.toHaveBeenCalled();
  });

  it("requires content", async () => {
    await expect(run("messages_send_email", { candidateId: CANDIDATE })).rejects.toBeInstanceOf(McpToolError);
  });

  it("surfaces delivery conflicts as conflict errors", async () => {
    m.createMailboxThreadAction.mockResolvedValue({ ok: false, code: "delivery_unknown", error: "Not sure it was sent." });
    await expect(run("messages_send_email", { candidateId: CANDIDATE, subject: "S", body: "B" })).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("messages_reply_thread", () => {
  it("checks the thread is visible before replying", async () => {
    m.requireVisibleThread.mockRejectedValue(new McpToolError("Thread not found.", "not_found"));
    await expect(run("messages_reply_thread", { threadId: THREAD, body: "Thanks" })).rejects.toMatchObject({ code: "not_found" });
    expect(m.replyMailboxThreadAction).not.toHaveBeenCalled();
  });

  it("passes the idempotency key through and reports replays", async () => {
    m.replyMailboxThreadAction.mockResolvedValue({ ok: true, threadId: THREAD, idempotentReplay: true });
    const out = (await run("messages_reply_thread", { threadId: THREAD, body: "Thanks", idempotencyKey: "k" })) as { idempotentReplay: boolean };
    expect(m.replyMailboxThreadAction).toHaveBeenCalledWith(expect.objectContaining({ threadId: THREAD, idempotencyKey: "k" }));
    expect(out.idempotentReplay).toBe(true);
  });
});

describe("messages_send_bulk_email", () => {
  it("rejects variables the bulk sender cannot fill", async () => {
    await expect(
      run("messages_send_bulk_email", { candidateIds: [CANDIDATE], subject: "S", body: "At {{interview_time}}" }),
    ).rejects.toThrow(/interview_time/);
    expect(m.sendBulkCandidateEmail).not.toHaveBeenCalled();
  });

  it("caps recipients at 50 and de-duplicates ids", async () => {
    const t = tool("messages_send_bulk_email");
    const ids = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(t.input.safeParse({ candidateIds: ids, subject: "S", body: "B" }).success).toBe(false);
    m.sendBulkCandidateEmail.mockResolvedValue({ success: true, sent: 1, failed: 0 });
    const out = await run("messages_send_bulk_email", { candidateIds: [CANDIDATE, CANDIDATE], subject: "Hi {{candidate_first_name}}", body: "B" });
    expect(m.sendBulkCandidateEmail).toHaveBeenCalledWith(expect.objectContaining({ candidateIds: [CANDIDATE] }));
    expect(out).toEqual({ sent: 1, failed: 0, requested: 1 });
  });
});

describe("thread management", () => {
  it("maps 'me' to the acting user when assigning", async () => {
    m.updateMailboxThreadAction.mockResolvedValue({ ok: true });
    await run("messages_assign_thread", { threadId: THREAD, ownerId: "me" });
    expect(m.updateMailboxThreadAction).toHaveBeenCalledWith({ threadId: THREAD, ownerId: "user-1" });
  });

  it("never touches a thread the caller cannot see", async () => {
    m.requireVisibleThread.mockRejectedValue(new McpToolError("Thread not found.", "not_found"));
    await expect(run("messages_set_thread_status", { threadId: THREAD, status: "archived" })).rejects.toBeInstanceOf(McpToolError);
    expect(m.updateMailboxThreadAction).not.toHaveBeenCalled();
  });

  it("pages thread lists", async () => {
    const row = (id: string) => ({
      id, transport: "smtp", subject: "S", participantEmail: null, status: "open", unreadCount: 0,
      lastMessageAt: new Date("2026-01-01"), candidateId: null, candidateFirstName: null, candidateLastName: null,
      ownerId: null, ownerName: null, applicationId: null, jobId: null, jobTitle: null, applicationStageName: null,
      hasInboundReply: false, needsReply: false, preview: null,
    });
    m.listThreads.mockResolvedValue([row("a"), row("b"), row("c")]);
    const out = (await run("messages_list_threads", { limit: 2 })) as { threads: unknown[]; hasMore: boolean; nextOffset: number };
    expect(out.threads).toHaveLength(2);
    expect(out.hasMore).toBe(true);
    expect(out.nextOffset).toBe(2);
  });
});

describe("messages_create_template", () => {
  it("returns the new template id", async () => {
    m.createEmailTemplate.mockResolvedValue({ success: true });
    const out = (await run("messages_create_template", { name: "Welcome", subject: "S", body: "B" })) as { templateId: string };
    expect(out.templateId).toBe("tpl-1");
  });

  it("maps a duplicate-name failure to an error", async () => {
    m.createEmailTemplate.mockResolvedValue({ success: false, error: "A template with that name already exists." });
    await expect(run("messages_create_template", { name: "Welcome", subject: "S", body: "B" })).rejects.toThrow(/already exists/);
  });
});
