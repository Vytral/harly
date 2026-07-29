import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  workspaceId: "mailbox-it-integration-workspace",
  userId: "mailbox-it-integration-user",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    organization: { id: context.workspaceId },
    user: { id: context.userId, email: "mailbox-it@example.test" },
  })),
}));

const integration =
  process.env.RUN_MAILBOX_INTEGRATION === "1" ? describe : describe.skip;

import {
  applications,
  candidates,
  db,
  jobStages,
  jobs,
  mailAttachments,
  mailMessages,
  mailThreads,
  organization,
  user,
} from "@harly/db";
import {
  linkMailboxThreadToApplicationAction,
  replyMailboxThreadAction,
} from "./actions";
import { getInboxData } from "./data";
import { getWorkspaceMailboxAttachment } from "@/lib/mailbox/attachment-access";
import {
  getUnreadInboundReplyCount,
  listInboundReplies,
} from "@/features/inbound-email/data";
import { findOrCreateCanonicalThread } from "@/lib/mail/canonical";

integration("Inbox tenant and active-job isolation", () => {
  let activeJobId: string;
  let deletedJobId: string;
  let activeStageId: string;
  let deletedStageId: string;
  let candidateId: string;
  let activeApplicationId: string;
  let deletedApplicationId: string;
  let activeThreadId: string;
  let deletedJobThreadId: string;
  let activeMessageId: string;
  let deletedJobMessageId: string;
  let activeAttachmentId: string;
  let deletedAttachmentId: string;
  const foreignUserId = "mailbox-it-foreign-user";

  beforeAll(async () => {
    // Make reruns recoverable if setup was interrupted after creating the
    // fixture organization but before all rows were inserted.
    await db.delete(organization).where(eq(organization.id, context.workspaceId));
    await db.delete(user).where(eq(user.id, context.userId));
    await db.insert(organization).values({
      id: context.workspaceId,
      name: "Inbox isolation",
      slug: context.workspaceId,
      createdAt: new Date(),
    });
    await db.insert(user).values({
      id: context.userId,
      name: "Inbox Test User",
      email: "mailbox-it@example.test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(user).values({
      id: foreignUserId,
      name: "Foreign Workspace User",
      email: "mailbox-foreign@example.test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [activeJob] = await db
      .insert(jobs)
      .values({
        workspaceId: context.workspaceId,
        title: "Active requisition",
        slug: `active-${randomUUID()}`,
        employmentType: "full_time",
        workplaceType: "remote",
        description: "Inbox test job",
        status: "open",
        createdById: context.userId,
      })
      .returning({ id: jobs.id });
    const [deletedJob] = await db
      .insert(jobs)
      .values({
        workspaceId: context.workspaceId,
        title: "Deleted requisition",
        slug: `deleted-${randomUUID()}`,
        employmentType: "full_time",
        workplaceType: "remote",
        description: "Inbox test deleted job",
        status: "open",
        deletedAt: new Date(),
        createdById: context.userId,
      })
      .returning({ id: jobs.id });
    activeJobId = activeJob.id;
    deletedJobId = deletedJob.id;
    const [activeStage] = await db
      .insert(jobStages)
      .values({ workspaceId: context.workspaceId, jobId: activeJobId, name: "Applied", order: 0 })
      .returning({ id: jobStages.id });
    const [deletedStage] = await db
      .insert(jobStages)
      .values({ workspaceId: context.workspaceId, jobId: deletedJobId, name: "Applied", order: 0 })
      .returning({ id: jobStages.id });
    activeStageId = activeStage.id;
    deletedStageId = deletedStage.id;
    const [candidate] = await db
      .insert(candidates)
      .values({
        workspaceId: context.workspaceId,
        firstName: "Inbox",
        lastName: "Candidate",
        email: `inbox-${randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    candidateId = candidate.id;
    const [activeApplication] = await db
      .insert(applications)
      .values({ workspaceId: context.workspaceId, candidateId, jobId: activeJobId, currentStageId: activeStageId })
      .returning({ id: applications.id });
    const [deletedApplication] = await db
      .insert(applications)
      .values({ workspaceId: context.workspaceId, candidateId, jobId: deletedJobId, currentStageId: deletedStageId })
      .returning({ id: applications.id });
    activeApplicationId = activeApplication.id;
    deletedApplicationId = deletedApplication.id;
    const [activeThread] = await db
      .insert(mailThreads)
      .values({
        workspaceId: context.workspaceId,
        source: "provider",
        subject: "Active application",
        normalizedSubject: "active application",
        participantEmail: "candidate@example.test",
        candidateId,
        applicationId: activeApplicationId,
        ownerId: foreignUserId,
      })
      .returning({ id: mailThreads.id });
    const [deletedJobThread] = await db
      .insert(mailThreads)
      .values({
        workspaceId: context.workspaceId,
        source: "provider",
        subject: "Deleted application",
        normalizedSubject: "deleted application",
        participantEmail: "candidate@example.test",
        candidateId,
        applicationId: deletedApplicationId,
      })
      .returning({ id: mailThreads.id });
    activeThreadId = activeThread.id;
    deletedJobThreadId = deletedJobThread.id;
    const messageRows = await db.insert(mailMessages).values([
      {
        workspaceId: context.workspaceId,
        threadId: activeThreadId,
        candidateId,
        applicationId: activeApplicationId,
        direction: "inbound",
        fromEmail: "candidate@example.test",
        subject: "Active application",
        textBody: "Hello",
      },
      {
        workspaceId: context.workspaceId,
        threadId: deletedJobThreadId,
        candidateId,
        applicationId: deletedApplicationId,
        direction: "inbound",
        fromEmail: "candidate@example.test",
        subject: "Deleted application",
        textBody: "Historical message",
      },
    ]).returning({ id: mailMessages.id });
    activeMessageId = messageRows[0].id;
    deletedJobMessageId = messageRows[1].id;
    const attachmentRows = await db.insert(mailAttachments).values([
      {
        workspaceId: context.workspaceId,
        messageId: activeMessageId,
        filename: "active.pdf",
        contentType: "application/pdf",
        size: 10,
        storageKey: `mailboxes/${context.workspaceId}/active.pdf`,
      },
      {
        workspaceId: context.workspaceId,
        messageId: deletedJobMessageId,
        filename: "deleted.pdf",
        contentType: "application/pdf",
        size: 10,
        storageKey: `mailboxes/${context.workspaceId}/deleted.pdf`,
      },
    ]).returning({ id: mailAttachments.id });
    activeAttachmentId = attachmentRows[0].id;
    deletedAttachmentId = attachmentRows[1].id;
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, context.workspaceId));
    await db.delete(user).where(eq(user.id, context.userId));
    await db.delete(user).where(eq(user.id, foreignUserId));
  });

  it("only lists active jobs as linkable applications and hides stale job links", async () => {
    const result = await getInboxData({ threadId: deletedJobThreadId });
    expect(result.applications.map((application) => application.id)).toEqual([
      activeApplicationId,
    ]);
    const staleThread = result.threads.find((thread) => thread.id === deletedJobThreadId);
    expect(staleThread).toMatchObject({
      candidateId,
      applicationId: null,
      jobId: null,
      jobTitle: null,
    });
    expect(result.threads.find((thread) => thread.id === activeThreadId)?.ownerName).toBeNull();
    await expect(
      getWorkspaceMailboxAttachment({
        attachmentId: activeAttachmentId,
        workspaceId: context.workspaceId,
      }),
    ).resolves.toMatchObject({ filename: "active.pdf" });
    await expect(
      getWorkspaceMailboxAttachment({
        attachmentId: deletedAttachmentId,
        workspaceId: context.workspaceId,
      }),
    ).resolves.toMatchObject({ filename: "deleted.pdf" });
    const [deletedMessageCandidate] = await db
      .insert(candidates)
      .values({
        workspaceId: context.workspaceId,
        firstName: "Deleted message",
        lastName: "Candidate",
        email: `deleted-message-${randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    const [mismatchedMessage] = await db
      .insert(mailMessages)
      .values({
        workspaceId: context.workspaceId,
        threadId: activeThreadId,
        candidateId: deletedMessageCandidate.id,
        direction: "inbound",
        fromEmail: "candidate@example.test",
        subject: "Mismatched candidate",
        textBody: "Must not authorize this attachment",
      })
      .returning({ id: mailMessages.id });
    const [mismatchedAttachment] = await db
      .insert(mailAttachments)
      .values({
        workspaceId: context.workspaceId,
        messageId: mismatchedMessage.id,
        filename: "mismatched.pdf",
        contentType: "application/pdf",
        size: 10,
        storageKey: `mailboxes/${context.workspaceId}/mismatched.pdf`,
      })
      .returning({ id: mailAttachments.id });
    await db
      .update(candidates)
      .set({ deletedAt: new Date() })
      .where(eq(candidates.id, deletedMessageCandidate.id));
    await expect(
      getWorkspaceMailboxAttachment({
        attachmentId: mismatchedAttachment.id,
        workspaceId: context.workspaceId,
      }),
    ).resolves.toBeNull();
    await db.update(candidates).set({ deletedAt: new Date() }).where(eq(candidates.id, candidateId));
    await expect(
      getWorkspaceMailboxAttachment({
        attachmentId: activeAttachmentId,
        workspaceId: context.workspaceId,
      }),
    ).resolves.toBeNull();
    await db.update(candidates).set({ deletedAt: null }).where(eq(candidates.id, candidateId));
    const replies = await listInboundReplies();
    expect(replies.find((reply) => reply.subject === "Active application")?.jobTitle).toBe(
      "Active requisition",
    );
    expect(replies.find((reply) => reply.subject === "Deleted application")?.jobTitle).toBeNull();
  });

  it("rejects linking an application whose job is in the trash", async () => {
    await expect(
      linkMailboxThreadToApplicationAction({
        threadId: activeThreadId,
        applicationId: deletedApplicationId,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/application/i) });
  });

  it("clears stale application links before a legacy reply can reuse them", async () => {
    const result = await replyMailboxThreadAction({
      threadId: deletedJobThreadId,
      body: "A reply that must not retain the deleted job association.",
      idempotencyKey: `mailbox-stale-application-${randomUUID()}`,
    });
    expect(result).toMatchObject({ ok: false });

    const [thread] = await db
      .select({ applicationId: mailThreads.applicationId })
      .from(mailThreads)
      .where(eq(mailThreads.id, deletedJobThreadId))
      .limit(1);
    const messages = await db
      .select({ applicationId: mailMessages.applicationId })
      .from(mailMessages)
      .where(eq(mailMessages.threadId, deletedJobThreadId));
    expect(thread?.applicationId).toBeNull();
    expect(messages.every((message) => message.applicationId === null)).toBe(true);
  });

  it("does not count an unread message linked to a foreign workspace candidate", async () => {
    const foreignWorkspaceId = `mailbox-unread-foreign-${randomUUID()}`;
    await db.insert(organization).values({
      id: foreignWorkspaceId,
      name: "Foreign unread workspace",
      slug: foreignWorkspaceId,
      createdAt: new Date(),
    });
    const [foreignCandidate] = await db
      .insert(candidates)
      .values({
        workspaceId: foreignWorkspaceId,
        firstName: "Foreign",
        lastName: "Unread",
        email: `foreign-unread-${randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    const before = await getUnreadInboundReplyCount();
    await db.insert(mailMessages).values({
      workspaceId: context.workspaceId,
      threadId: activeThreadId,
      candidateId: foreignCandidate.id,
      direction: "inbound",
      fromEmail: "foreign@example.test",
      subject: "Foreign unread message",
      textBody: "Must not affect the current workspace badge",
      readAt: null,
    });
    const after = await getUnreadInboundReplyCount();
    expect(after).toBe(before);
    await db.delete(organization).where(eq(organization.id, foreignWorkspaceId));
  });

  it("does not reuse a foreign workspace thread through message references", async () => {
    const foreignWorkspaceId = "mailbox-it-foreign-workspace";
    await db.insert(organization).values({
      id: foreignWorkspaceId,
      name: "Foreign Inbox",
      slug: foreignWorkspaceId,
      createdAt: new Date(),
    });
    const [foreignThread] = await db
      .insert(mailThreads)
      .values({
        workspaceId: foreignWorkspaceId,
        source: "provider",
        subject: "Foreign thread",
        normalizedSubject: "foreign thread",
      })
      .returning({ id: mailThreads.id });
    await db.insert(mailMessages).values({
      workspaceId: foreignWorkspaceId,
      threadId: foreignThread.id,
      messageId: "<shared-reference@example.test>",
      direction: "inbound",
      fromEmail: "foreign@example.test",
      subject: "Foreign thread",
      textBody: "Foreign message",
    });

    const resolved = await findOrCreateCanonicalThread({
      workspaceId: context.workspaceId,
      source: "provider",
      subject: "Reply in current workspace",
      inReplyTo: "<shared-reference@example.test>",
      receivedAt: new Date(),
    });
    expect(resolved.id).not.toBe(foreignThread.id);
    await db.delete(organization).where(eq(organization.id, foreignWorkspaceId));
  });
});
