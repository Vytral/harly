import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { activityEvents, applications, candidateFiles, candidates, db, workspaceSettings } from "@harly/db";

import { createResumeStorageKey } from "@/lib/storage-validation";
import { createPipelineFixture, runPipelineIntegration, type PipelineFixture } from "@/test-support/pipeline-fixture";

const storageDelete = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage", () => ({ storage: { delete: storageDelete } }));
vi.mock("@/lib/logger", () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: () => logger };
  return { createLogger: () => logger, getServerLogger: () => logger };
});

import { anonymizeCandidateForRetention, findDueCandidatesForRetention } from "./retention";

const LONG_AGO = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

describe.skipIf(!runPipelineIntegration)("candidate retention (database)", () => {
  let fx: PipelineFixture;

  async function addResume(candidateId: string) {
    const key = createResumeStorageKey(fx.workspaceId, "resume.pdf");
    await db.insert(candidateFiles).values({
      workspaceId: fx.workspaceId,
      candidateId,
      fileName: "resume.pdf",
      fileUrl: `/api/storage/file?key=${encodeURIComponent(key)}`,
      fileType: "application/pdf",
      fileSize: 10,
    });
    return key;
  }

  async function addCandidate(updatedAt = LONG_AGO) {
    const [row] = await db
      .insert(candidates)
      .values({
        workspaceId: fx.workspaceId,
        firstName: "Retention",
        lastName: "Subject",
        email: `${randomUUID()}@example.test`,
        phone: "+1 555 0100",
        updatedAt,
      })
      .returning({ id: candidates.id });
    return row!.id;
  }

  beforeAll(async () => {
    fx = await createPipelineFixture();
    await db
      .insert(workspaceSettings)
      .values({
        organizationId: fx.workspaceId,
        dataRetentionEnabled: true,
        dataRetentionApplicantsMonths: 12,
        dataRetentionTalentPoolMonths: 24,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.organizationId,
        set: { dataRetentionEnabled: true, dataRetentionApplicantsMonths: 12, dataRetentionTalentPoolMonths: 24 },
      });
  });

  beforeEach(() => {
    storageDelete.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  it("finds only stale candidates without an active or hired application", async () => {
    const stale = await addCandidate();
    const fresh = await addCandidate(new Date());
    const active = await addCandidate();
    await db.insert(applications).values({
      workspaceId: fx.workspaceId,
      candidateId: active,
      jobId: fx.jobId,
      currentStageId: fx.stages.applied!.id,
      status: "active",
      updatedAt: LONG_AGO,
    });

    const due = (await findDueCandidatesForRetention(500)).filter((row) => row.workspaceId === fx.workspaceId);
    const ids = due.map((row) => row.id);
    expect(ids).toContain(stale);
    expect(ids).not.toContain(fresh);
    expect(ids).not.toContain(active);
    expect(due.find((row) => row.id === stale)?.thresholdMonths).toBe(12);
  });

  it("does not enforce retention for a workspace that has not opted in", async () => {
    const other = await createPipelineFixture();
    try {
      await db.insert(workspaceSettings).values({
        organizationId: other.workspaceId,
        dataRetentionEnabled: false,
        dataRetentionApplicantsMonths: 1,
      });
      const [row] = await db
        .insert(candidates)
        .values({
          workspaceId: other.workspaceId,
          firstName: "Opted",
          lastName: "Out",
          email: `${randomUUID()}@example.test`,
          updatedAt: LONG_AGO,
        })
        .returning({ id: candidates.id });
      const due = await findDueCandidatesForRetention(500);
      expect(due.map((entry) => entry.id)).not.toContain(row!.id);
    } finally {
      await other.cleanup();
    }
  });

  it("skips a candidate that still has an active application", async () => {
    const id = await addCandidate();
    await db.insert(applications).values({
      workspaceId: fx.workspaceId,
      candidateId: id,
      jobId: fx.jobId,
      currentStageId: fx.stages.applied!.id,
      status: "hired",
    });
    expect(await anonymizeCandidateForRetention(id, fx.workspaceId, 12)).toBe("skipped_blocking_status");
    const [row] = await db.select({ anonymizedAt: candidates.anonymizedAt }).from(candidates).where(eq(candidates.id, id));
    expect(row?.anonymizedAt).toBeNull();
  });

  it("redacts personal data, deletes stored files and records an activity event", async () => {
    const id = await addCandidate();
    const key = await addResume(id);

    expect(await anonymizeCandidateForRetention(id, fx.workspaceId, 12)).toBe("anonymized");
    const [row] = await db.select().from(candidates).where(eq(candidates.id, id));
    expect(row).toMatchObject({ firstName: "Redacted", lastName: "Candidate", phone: null });
    expect(row?.email).toBe(`redacted+${id}@anonymized.invalid`);
    expect(row?.anonymizedAt).toBeInstanceOf(Date);
    expect(storageDelete).toHaveBeenCalledWith(key);
    expect(await db.select().from(candidateFiles).where(eq(candidateFiles.candidateId, id))).toHaveLength(0);
    const events = await db.select({ type: activityEvents.type }).from(activityEvents).where(eq(activityEvents.entityId, id));
    expect(events.map((event) => event.type)).toContain("candidate.anonymized");

    // Idempotent: a second run on an anonymized candidate must not claim success.
    expect(await anonymizeCandidateForRetention(id, fx.workspaceId, 12)).toBe("failed");
  });

  it("keeps the candidate untouched when a stored object cannot be erased", async () => {
    const id = await addCandidate();
    await addResume(id);
    storageDelete.mockRejectedValue(new Error("storage down"));

    expect(await anonymizeCandidateForRetention(id, fx.workspaceId, 12)).toBe("failed");
    const [row] = await db.select({ anonymizedAt: candidates.anonymizedAt }).from(candidates).where(eq(candidates.id, id));
    expect(row?.anonymizedAt).toBeNull();
    expect(await db.select().from(candidateFiles).where(eq(candidateFiles.candidateId, id))).toHaveLength(1);
    // The next run retries and succeeds once storage recovers.
    storageDelete.mockResolvedValue(undefined);
    expect(await anonymizeCandidateForRetention(id, fx.workspaceId, 12)).toBe("anonymized");
  });
});
