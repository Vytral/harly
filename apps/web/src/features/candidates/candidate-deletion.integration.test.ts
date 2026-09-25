import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const context = vi.hoisted(() => ({
  workspaceId: `candidate-delete-it-${Math.random().toString(36).slice(2)}`,
  userId: `candidate-delete-user-${Math.random().toString(36).slice(2)}`,
}));
const storageMock = vi.hoisted(() => ({
  delete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn().mockResolvedValue({
    organization: { id: context.workspaceId },
    user: { id: context.userId, email: "deleter@example.test" },
  }),
  requireCandidatePermission: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: async () => ({
    organization: { id: context.workspaceId },
    user: { id: context.userId, email: "deleter@example.test" },
  }),
}));
vi.mock("@/features/ai-chat/data", () => ({
  deleteConversationsForCandidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/storage", () => ({ storage: storageMock }));
vi.mock("@/lib/gcal/sync", () => ({ cancelInterviewGCalEvent: vi.fn() }));
vi.mock("@/lib/outlook/teams-sync", () => ({
  cancelInterviewTeamsMeeting: vi.fn(),
}));
vi.mock("@/lib/zoom/sync", () => ({ cancelInterviewZoomMeeting: vi.fn() }));
vi.mock("@/lib/jitsi/sync", () => ({
  cancelInterviewJitsiMeeting: vi.fn(),
}));

const integration =
  process.env.RUN_CANDIDATE_DELETION_INTEGRATION === "1"
    ? describe
    : describe.skip;

import {
  aiConversations,
  applicationQuestions,
  applications,
  candidateFiles,
  candidateMessages,
  candidateNotes,
  candidatePortalMagicLinks,
  candidatePortalNotifications,
  candidatePortalSessions,
  candidateReferrals,
  candidateTags,
  candidateDeletionJobs,
  candidates,
  db,
  documentAssociations,
  documentLegalHolds,
  documentRequirements,
  documentRequests,
  documentVersions,
  documents,
  dsarRequests,
  evaluationRubrics,
  jobApprovalRequests,
  jobEmbeddings,
  jobStages,
  jobs,
  mailAttachments,
  mailIdempotencyKeys,
  mailMessages,
  mailThreads,
  offers,
  organization,
  scorecards,
  slackDeliveries,
  tasks,
  user,
} from "@harly/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { permanentlyDeleteCandidate } from "./data";
import {
  listOpenJobsForWorkspaceSlug,
  permanentlyDeleteJob,
  restoreJob,
  trashJob,
} from "@/features/jobs/data";
import {
  claimDueCandidateDeletionJobs,
  markCandidateDeletionCompleted,
  markCandidateDeletionFailed,
  requeueCandidateDeletionJob,
} from "./deletion-jobs";
import {
  fulfilDsarErasureAction,
  reviewDsarRequestAction,
} from "@/features/workspaces/dsar-actions";

integration("permanent candidate deletion", () => {
  let candidateId: string;
  let applicationId: string;
  let jobId: string;
  let stageId: string;
  let documentId: string;
  let candidateFileId: string;

  beforeAll(async () => {
    await db.insert(organization).values({
      id: context.workspaceId,
      name: "Candidate deletion integration",
      slug: context.workspaceId,
      createdAt: new Date(),
    });
    await db.insert(user).values({
      id: context.userId,
      name: "Deletion Test User",
      email: "deleter@example.test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    [{ id: jobId }] = await db
      .insert(jobs)
      .values({
        workspaceId: context.workspaceId,
        title: "Integration job",
        slug: `integration-${randomUUID()}`,
        employmentType: "full_time",
        workplaceType: "remote",
        description: "Integration test job",
        createdById: context.userId,
      })
      .returning({ id: jobs.id });
    [{ id: stageId }] = await db
      .insert(jobStages)
      .values({
        workspaceId: context.workspaceId,
        jobId,
        name: "Screen",
        order: 0,
      })
      .returning({ id: jobStages.id });
  });

  beforeEach(async () => {
    storageMock.delete.mockReset().mockResolvedValue(undefined);
    [{ id: candidateId }] = await db
      .insert(candidates)
      .values({
        workspaceId: context.workspaceId,
        firstName: "Erase",
        lastName: "Me",
        email: `erase-${randomUUID()}@example.test`,
        avatarUrl: `workspaces/${context.workspaceId}/images/avatar.png`,
        deletedAt: new Date(),
      })
      .returning({ id: candidates.id });
    [{ id: applicationId }] = await db
      .insert(applications)
      .values({
        workspaceId: context.workspaceId,
        candidateId,
        jobId,
        currentStageId: stageId,
      })
      .returning({ id: applications.id });
    [{ id: candidateFileId }] = await db
      .insert(candidateFiles)
      .values({
        workspaceId: context.workspaceId,
        candidateId,
        fileName: "resume.pdf",
        fileUrl: `workspaces/${context.workspaceId}/resumes/${candidateId}.pdf`,
      })
      .returning({ id: candidateFiles.id });
    [{ id: documentId }] = await db
      .insert(documents)
      .values({
        workspaceId: context.workspaceId,
        name: "NDA",
        originalName: "nda.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        checksum: "integration-checksum",
        storageKey: `workspaces/${context.workspaceId}/documents/${candidateId}.pdf`,
        legacyCandidateFileId: candidateFileId,
      })
      .returning({ id: documents.id });
    await db.insert(documentVersions).values({
      workspaceId: context.workspaceId,
      documentId,
      versionNumber: 1,
      storageKey: `workspaces/${context.workspaceId}/documents/${candidateId}-v1.pdf`,
      sizeBytes: 10,
      checksum: "integration-version-checksum",
    });
    await db.insert(documentAssociations).values({
      workspaceId: context.workspaceId,
      documentId,
      targetType: "candidate",
      targetId: candidateId,
    });
    await db.insert(documentRequests).values({
      workspaceId: context.workspaceId,
      applicationId,
      candidateId,
      title: "NDA",
      documentId,
    });
    await db.insert(candidateNotes).values({
      workspaceId: context.workspaceId,
      candidateId,
      authorId: context.userId,
      body: "private note",
    });
    await db.insert(candidateTags).values({
      workspaceId: context.workspaceId,
      candidateId,
      label: "integration",
    });
    await db.insert(scorecards).values({
      workspaceId: context.workspaceId,
      candidateId,
      applicationId,
      authorId: context.userId,
      rating: "strong",
    });
    await db.insert(offers).values({
      workspaceId: context.workspaceId,
      applicationId,
      candidateId,
      jobId,
      title: "Integration offer",
      createdById: context.userId,
    });
    await db.insert(candidatePortalSessions).values({
      workspaceId: context.workspaceId,
      candidateId,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(candidatePortalNotifications).values({
      workspaceId: context.workspaceId,
      candidateId,
      type: "integration",
      title: "Test",
    });
    const [{ email }] = await db
      .select({ email: candidates.email })
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    await db.insert(candidatePortalMagicLinks).values({
      workspaceId: context.workspaceId,
      email,
      tokenHash: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });
    const [{ id: threadId }] = await db
      .insert(mailThreads)
      .values({
        workspaceId: context.workspaceId,
        source: "provider",
        subject: "Candidate email",
        normalizedSubject: "candidate email",
        candidateId: null,
      })
      .returning({ id: mailThreads.id });
    const [{ id: messageId }] = await db
      .insert(mailMessages)
      .values({
        workspaceId: context.workspaceId,
        threadId,
        candidateId,
        direction: "inbound",
        fromEmail: email,
        subject: "Candidate email",
        textBody: "private mail",
      })
      .returning({ id: mailMessages.id });
    await db.insert(mailAttachments).values({
      workspaceId: context.workspaceId,
      messageId,
      filename: "attachment.pdf",
      contentType: "application/pdf",
      size: 10,
      storageKey: `mailboxes/${context.workspaceId}/attachments/${candidateId}.pdf`,
    });
    await db.insert(mailIdempotencyKeys).values({
      workspaceId: context.workspaceId,
      idempotencyKey: randomUUID(),
      messageId: "legacy-message-id",
      status: "sent",
      candidateId,
      applicationId,
      threadId,
      mailMessageId: messageId,
      payloadHash: "integration-payload",
    });
    await db.insert(candidateMessages).values({
      workspaceId: context.workspaceId,
      candidateId,
      toEmail: email,
      subject: "Legacy mail",
      body: "legacy private mail",
      attachments: [
        {
          storageKey: `mailboxes/${context.workspaceId}/legacy/${candidateId}.pdf`,
        },
      ],
    });
    await db.insert(aiConversations).values({
      workspaceId: context.workspaceId,
      userId: context.userId,
      candidateId,
      title: "Candidate context",
    });
    await db.insert(slackDeliveries).values({
      workspaceId: context.workspaceId,
      event: "candidate.updated",
      channelId: "C123",
      payload: {
        text: "Candidate updated",
        _harly: { candidateIds: [candidateId], applicationIds: [applicationId] },
      },
      status: "pending",
    });
  });

  afterAll(async () => {
    await db
      .delete(organization)
      .where(eq(organization.id, context.workspaceId));
    await db.delete(user).where(eq(user.id, context.userId));
  });

  it("erases direct, indirect, legacy, portal and storage references", async () => {
    const result = await permanentlyDeleteCandidate(candidateId, "integration");
    expect(result.ok).toBe(true);
    expect(result.ok && result.stats.storageObjects).toBe(6);
    expect(storageMock.delete).toHaveBeenCalledTimes(6);

    const [remainingCandidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    expect(remainingCandidate).toBeUndefined();
    expect(
      await db
        .select({ id: mailIdempotencyKeys.id })
        .from(mailIdempotencyKeys)
        .where(eq(mailIdempotencyKeys.workspaceId, context.workspaceId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: slackDeliveries.id })
        .from(slackDeliveries)
        .where(eq(slackDeliveries.workspaceId, context.workspaceId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: candidatePortalMagicLinks.id })
        .from(candidatePortalMagicLinks)
        .where(eq(candidatePortalMagicLinks.workspaceId, context.workspaceId)),
    ).toHaveLength(0);
    await expect(
      db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.id, applicationId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, documentId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select({ id: candidateFiles.id })
        .from(candidateFiles)
        .where(eq(candidateFiles.id, candidateFileId)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(eq(aiConversations.candidateId, candidateId)),
    ).resolves.toHaveLength(0);
  });

  it("fails closed on storage and can retry idempotently", async () => {
    storageMock.delete.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(
      permanentlyDeleteCandidate(candidateId, "integration"),
    ).resolves.toMatchObject({
      ok: false,
    });
    expect(
      await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          and(eq(candidates.id, candidateId), isNotNull(candidates.deletedAt)),
        ),
    ).toHaveLength(1);

    const result = await permanentlyDeleteCandidate(candidateId, "integration");
    expect(result.ok).toBe(true);
  });

  it("keeps the candidate when the database transaction fails, then retries", async () => {
    const transaction = vi
      .spyOn(db, "transaction")
      .mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      permanentlyDeleteCandidate(candidateId, "integration"),
    ).rejects.toThrow("database unavailable");
    expect(
      await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(eq(candidates.id, candidateId)),
    ).toHaveLength(1);
    transaction.mockRestore();
    const result = await permanentlyDeleteCandidate(candidateId, "integration");
    expect(result.ok).toBe(true);
  });

  it("blocks on legal hold and succeeds after the hold is released", async () => {
    const [{ id: holdId }] = await db
      .insert(documentLegalHolds)
      .values({
        workspaceId: context.workspaceId,
        documentId,
        reason: "Regulatory review",
        placedById: context.userId,
      })
      .returning({ id: documentLegalHolds.id });

    await db
      .update(jobs)
      .set({ status: "open", publishedAt: new Date() })
      .where(eq(jobs.id, jobId));
    expect(
      (await listOpenJobsForWorkspaceSlug(context.workspaceId)).jobs.some(
        (job) => job.id === jobId,
      ),
    ).toBe(true);
    await expect(trashJob(jobId)).resolves.toMatchObject({ ok: true });
    expect(
      (await listOpenJobsForWorkspaceSlug(context.workspaceId)).jobs.some(
        (job) => job.id === jobId,
      ),
    ).toBe(false);
    await expect(restoreJob(jobId)).resolves.toMatchObject({ ok: true });
    expect(
      (await listOpenJobsForWorkspaceSlug(context.workspaceId)).jobs.some(
        (job) => job.id === jobId,
      ),
    ).toBe(true);

    await expect(permanentlyDeleteJob(jobId)).resolves.toMatchObject({
      ok: false,
      error: "Job must be in the trash.",
    });
    await expect(trashJob(jobId)).resolves.toMatchObject({ ok: true });
    // The application still exists at this point and protects the
    // requisition from destructive deletion.
    await expect(permanentlyDeleteJob(jobId)).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/applications/i),
    });

    await expect(
      permanentlyDeleteCandidate(candidateId, "integration"),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/legal hold/i),
    });
    expect(
      await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(eq(candidates.id, candidateId)),
    ).toHaveLength(1);

    await db
      .delete(documentLegalHolds)
      .where(eq(documentLegalHolds.id, holdId));
    await expect(
      permanentlyDeleteCandidate(candidateId, "integration"),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it("rejects another workspace and serializes concurrent purges", async () => {
    const foreignWorkspaceId = `candidate-delete-foreign-${randomUUID()}`;
    const foreignCandidateId = randomUUID();
    await db.insert(organization).values({
      id: foreignWorkspaceId,
      name: "Foreign workspace",
      slug: foreignWorkspaceId,
      createdAt: new Date(),
    });
    await db.insert(candidates).values({
      id: foreignCandidateId,
      workspaceId: foreignWorkspaceId,
      firstName: "Foreign",
      lastName: "Candidate",
      email: `foreign-${randomUUID()}@example.test`,
      deletedAt: new Date(),
    });

    await expect(
      permanentlyDeleteCandidate(foreignCandidateId, "integration"),
    ).resolves.toMatchObject({ ok: false });
    expect(
      await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(eq(candidates.id, foreignCandidateId)),
    ).toHaveLength(1);

    await db
      .delete(organization)
      .where(eq(organization.id, foreignWorkspaceId));

    const [first, second] = await Promise.all([
      permanentlyDeleteCandidate(candidateId, "worker-a"),
      permanentlyDeleteCandidate(candidateId, "worker-b"),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
  });

  it("records DSAR rejection and supports an approved blocked retry", async () => {
    const [{ id: staleJobId }] = await db
      .insert(candidateDeletionJobs)
      .values({
        workspaceId: context.workspaceId,
        candidateId,
        dedupeKey: `stale-${randomUUID()}`,
        status: "processing",
        phase: "processing",
        attempts: 1,
        lockedAt: new Date(Date.now() - 20 * 60_000),
        lockedBy: "dead-worker",
      })
      .returning({ id: candidateDeletionJobs.id });
    const reclaimed = await claimDueCandidateDeletionJobs({
      workerId: "recovery-worker",
      lockTtlMs: 10 * 60_000,
    });
    expect(reclaimed.some((job) => job.id === staleJobId)).toBe(true);
    expect(
      await markCandidateDeletionCompleted(
        staleJobId,
        { durationMs: 1 },
        "dead-worker",
      ),
    ).toBe(false);
    expect(
      await markCandidateDeletionCompleted(
        staleJobId,
        { durationMs: 1 },
        "recovery-worker",
      ),
    ).toBe(true);

    const [{ id: blockedJobId }] = await db
      .insert(candidateDeletionJobs)
      .values({
        workspaceId: context.workspaceId,
        candidateId,
        dedupeKey: `blocked-${randomUUID()}`,
        status: "blocked",
        phase: "legal_hold",
        blockedReason: "hold",
      })
      .returning({ id: candidateDeletionJobs.id });
    expect(
      await requeueCandidateDeletionJob({
        workspaceId: context.workspaceId,
        jobId: blockedJobId,
        requestedBy: "operator@example.test",
      }),
    ).toMatchObject({ status: "pending", attempts: 0 });

    const [{ id: retryJobId }] = await db
      .insert(candidateDeletionJobs)
      .values({
        workspaceId: context.workspaceId,
        candidateId,
        dedupeKey: `retry-${randomUUID()}`,
        status: "processing",
        phase: "processing",
        attempts: 1,
        lockedAt: new Date(),
        lockedBy: "retry-worker",
      })
      .returning({ id: candidateDeletionJobs.id });
    expect(
      await markCandidateDeletionFailed(
        retryJobId,
        new Error("temporary storage failure"),
        "retry-worker",
      ),
    ).toBe(true);
    const [retryJob] = await db
      .select({
        status: candidateDeletionJobs.status,
        nextRetryAt: candidateDeletionJobs.nextRetryAt,
        lastError: candidateDeletionJobs.lastError,
      })
      .from(candidateDeletionJobs)
      .where(eq(candidateDeletionJobs.id, retryJobId));
    expect(retryJob.status).toBe("failed");
    expect(retryJob.nextRetryAt?.getTime()).toBeGreaterThan(
      Date.now() + 50_000,
    );
    expect(retryJob.lastError).toBe("temporary storage failure");

    const [{ id: exhaustedJobId }] = await db
      .insert(candidateDeletionJobs)
      .values({
        workspaceId: context.workspaceId,
        candidateId,
        dedupeKey: `exhausted-${randomUUID()}`,
        status: "processing",
        phase: "processing",
        attempts: 8,
        lockedAt: new Date(),
        lockedBy: "exhausted-worker",
      })
      .returning({ id: candidateDeletionJobs.id });
    expect(
      await markCandidateDeletionFailed(
        exhaustedJobId,
        new Error("permanent failure"),
        "exhausted-worker",
      ),
    ).toBe(true);
    const [exhaustedJob] = await db
      .select({ status: candidateDeletionJobs.status })
      .from(candidateDeletionJobs)
      .where(eq(candidateDeletionJobs.id, exhaustedJobId));
    expect(exhaustedJob.status).toBe("dead_letter");

    const [{ id: rejectedRequestId }] = await db
      .insert(dsarRequests)
      .values({
        workspaceId: context.workspaceId,
        candidateId,
        type: "erasure",
        requestedBy: "candidate@example.test",
      })
      .returning({ id: dsarRequests.id });
    await expect(
      reviewDsarRequestAction({
        requestId: rejectedRequestId,
        decision: "deny",
        notes: "Identity verification failed",
      }),
    ).resolves.toMatchObject({ ok: true });
    const [rejected] = await db
      .select({ status: dsarRequests.status })
      .from(dsarRequests)
      .where(eq(dsarRequests.id, rejectedRequestId));
    expect(rejected.status).toBe("denied");

    const [{ id: approvedRequestId }] = await db
      .insert(dsarRequests)
      .values({
        workspaceId: context.workspaceId,
        candidateId,
        type: "erasure",
        requestedBy: "candidate@example.test",
      })
      .returning({ id: dsarRequests.id });
    await reviewDsarRequestAction({
      requestId: approvedRequestId,
      decision: "approve",
    });
    const [{ id: holdId }] = await db
      .insert(documentLegalHolds)
      .values({
        workspaceId: context.workspaceId,
        documentId,
        reason: "DSAR integration hold",
        placedById: context.userId,
      })
      .returning({ id: documentLegalHolds.id });

    await expect(
      fulfilDsarErasureAction({
        requestId: approvedRequestId,
        candidateId,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/legal hold/i),
    });
    const [blocked] = await db
      .select({
        status: dsarRequests.status,
        blockedReason: dsarRequests.blockedReason,
        blockedBy: dsarRequests.blockedBy,
        reviewDueAt: dsarRequests.reviewDueAt,
      })
      .from(dsarRequests)
      .where(eq(dsarRequests.id, approvedRequestId));
    expect(blocked).toMatchObject({
      status: "blocked",
      blockedBy: "deleter@example.test",
    });
    expect(blocked.blockedReason).toMatch(/legal hold/i);
    expect(blocked.reviewDueAt).toBeInstanceOf(Date);

    await db
      .delete(documentLegalHolds)
      .where(eq(documentLegalHolds.id, holdId));
    await expect(
      fulfilDsarErasureAction({
        requestId: approvedRequestId,
        candidateId,
      }),
    ).resolves.toMatchObject({ ok: true });
    const [completed] = await db
      .select({ status: dsarRequests.status })
      .from(dsarRequests)
      .where(eq(dsarRequests.id, approvedRequestId));
    expect(completed.status).toBe("completed");

    await db.insert(applicationQuestions).values({
      workspaceId: context.workspaceId,
      jobId,
      key: "portfolio",
      label: "Portfolio",
      type: "url",
      order: 1,
    });
    await db.insert(documentRequirements).values({
      workspaceId: context.workspaceId,
      jobId,
      stageId,
      label: "Identity document",
    });
    await db.insert(evaluationRubrics).values({
      workspaceId: context.workspaceId,
      jobId,
      version: 1,
      configHash: `rubric-${randomUUID()}`,
      createdById: context.userId,
    });
    await db.insert(jobEmbeddings).values({
      workspaceId: context.workspaceId,
      jobId,
      model: "integration-model",
      embedding: [0.1, 0.2],
      sourceHash: `job-${randomUUID()}`,
    });
    await db.insert(jobApprovalRequests).values({
      workspaceId: context.workspaceId,
      jobId,
      requesterId: context.userId,
      approverId: context.userId,
    });
    const [{ id: taskId }] = await db
      .insert(tasks)
      .values({
        workspaceId: context.workspaceId,
        title: "Follow up after job deletion",
        ownerId: context.userId,
        createdById: context.userId,
        jobId,
      })
      .returning({ id: tasks.id });

    const [{ id: referredCandidateId }] = await db
      .insert(candidates)
      .values({
        workspaceId: context.workspaceId,
        firstName: "Referred",
        lastName: "Candidate",
        email: `referred-${randomUUID()}@example.test`,
      })
      .returning({ id: candidates.id });
    const [{ id: referralId }] = await db
      .insert(candidateReferrals)
      .values({
        workspaceId: context.workspaceId,
        candidateId: referredCandidateId,
        jobId,
        referredById: context.userId,
        createdById: context.userId,
      })
      .returning({ id: candidateReferrals.id });

    const deletedJob = await permanentlyDeleteJob(jobId);
    expect(deletedJob).toMatchObject({ ok: true });
    expect(
      await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.id, jobId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: jobStages.id })
        .from(jobStages)
        .where(eq(jobStages.jobId, jobId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: applicationQuestions.id })
        .from(applicationQuestions)
        .where(eq(applicationQuestions.jobId, jobId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: documentRequirements.id })
        .from(documentRequirements)
        .where(eq(documentRequirements.jobId, jobId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: evaluationRubrics.id })
        .from(evaluationRubrics)
        .where(eq(evaluationRubrics.jobId, jobId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: jobEmbeddings.id })
        .from(jobEmbeddings)
        .where(eq(jobEmbeddings.jobId, jobId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: jobApprovalRequests.id })
        .from(jobApprovalRequests)
        .where(eq(jobApprovalRequests.jobId, jobId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: candidateReferrals.id })
        .from(candidateReferrals)
        .where(eq(candidateReferrals.id, referralId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(eq(candidates.id, referredCandidateId)),
    ).toHaveLength(1);
    const [task] = await db
      .select({ id: tasks.id, jobId: tasks.jobId })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    expect(task).toEqual({ id: taskId, jobId: null });
  });
});
