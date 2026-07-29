import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  aiEvaluations,
  activityEvents,
  applications,
  candidateEmbeddings,
  candidateFiles,
  candidates,
  db,
  documentAssociations,
  documentLegalHolds,
  documentVersions,
  documents,
  evaluationJobs,
} from "@harly/db";

import { storage } from "@/lib/storage";
import { createLogger } from "@/lib/logger";
import { workspaceStorageKeyFromUrl } from "./data";

const log = createLogger("candidate-retention");

export type RetentionOutcome =
  | "anonymized"
  | "skipped_blocking_status"
  | "skipped_legal_hold"
  | "failed";

type DueCandidate = { id: string; workspaceId: string; thresholdMonths: number };

/**
 * Candidates whose last activity is older than their workspace's retention
 * window (applicants or talent-pool, whichever applies), for workspaces that
 * opted into automatic enforcement. Candidates still in an active pipeline or
 * already hired never qualify — enforced here AND re-checked per-candidate in
 * `anonymizeCandidateForRetention` to close any TOCTOU gap.
 */
export async function findDueCandidatesForRetention(
  limit: number,
): Promise<DueCandidate[]> {
  const rows = (await db.execute(sql`
    select c."id" as "id", c."workspace_id" as "workspace_id",
      case
        when exists (
          select 1 from "pool_entries" pe
          where pe."candidate_id" = c."id" and pe."removed_at" is null
        ) then ws."data_retention_talent_pool_months"
        else ws."data_retention_applicants_months"
      end as "threshold_months"
    from "candidates" c
    inner join "workspace_settings" ws on ws."organization_id" = c."workspace_id"
    where ws."data_retention_enabled" = true
      and c."deleted_at" is null
      and c."anonymized_at" is null
      and not exists (
        select 1 from "applications" a2
        where a2."candidate_id" = c."id" and a2."status" in ('active', 'hired')
      )
      and greatest(
        c."updated_at",
        coalesce((select max(a."updated_at") from "applications" a where a."candidate_id" = c."id"), c."updated_at")
      ) <= now() - (
        (case
          when exists (
            select 1 from "pool_entries" pe
            where pe."candidate_id" = c."id" and pe."removed_at" is null
          ) then ws."data_retention_talent_pool_months"
          else ws."data_retention_applicants_months"
        end)::text || ' months'
      )::interval
    order by c."updated_at" asc
    limit ${limit}
  `)) as unknown as Array<{ id: string; workspace_id: string; threshold_months: number }>;

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    thresholdMonths: row.threshold_months,
  }));
}

/**
 * Anonymize one candidate for data-retention compliance: redact PII, delete
 * their documents' stored bytes, keep the candidate + pipeline rows for
 * historical metrics. Idempotent (guarded by `anonymizedAt is null`) and safe
 * to retry — storage deletion happens before any DB write, and the whole
 * write set is one transaction.
 */
export async function anonymizeCandidateForRetention(
  candidateId: string,
  workspaceId: string,
  thresholdMonths: number,
): Promise<RetentionOutcome> {
  const [blocking] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.candidateId, candidateId), inArray(applications.status, ["active", "hired"])))
    .limit(1);
  if (blocking) return "skipped_blocking_status";

  const candidateApplications = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.candidateId, candidateId));
  const applicationIds = candidateApplications.map((row) => row.id);

  const associatedDocs = await db
    .select({ documentId: documentAssociations.documentId })
    .from(documentAssociations)
    .where(
      and(
        eq(documentAssociations.workspaceId, workspaceId),
        or(
          and(eq(documentAssociations.targetType, "candidate"), eq(documentAssociations.targetId, candidateId)),
          applicationIds.length > 0
            ? and(eq(documentAssociations.targetType, "application"), inArray(documentAssociations.targetId, applicationIds))
            : undefined,
        ),
      ),
    );
  const documentIds = [...new Set(associatedDocs.map((row) => row.documentId).filter((id): id is string => Boolean(id)))];

  // documentLegalHolds restricts deletion of its document even after release
  // (see the schema comment) — any hold history at all blocks this candidate.
  if (documentIds.length > 0) {
    const [hold] = await db
      .select({ id: documentLegalHolds.id })
      .from(documentLegalHolds)
      .where(inArray(documentLegalHolds.documentId, documentIds))
      .limit(1);
    if (hold) return "skipped_legal_hold";
  }

  const [documentRows, versionRows, fileRows, candidateRow] = await Promise.all([
    documentIds.length > 0
      ? db.select({ storageKey: documents.storageKey }).from(documents).where(inArray(documents.id, documentIds))
      : Promise.resolve([]),
    documentIds.length > 0
      ? db
          .select({ storageKey: documentVersions.storageKey })
          .from(documentVersions)
          .where(inArray(documentVersions.documentId, documentIds))
      : Promise.resolve([]),
    db.select({ fileUrl: candidateFiles.fileUrl }).from(candidateFiles).where(eq(candidateFiles.candidateId, candidateId)),
    db.select({ avatarUrl: candidates.avatarUrl }).from(candidates).where(eq(candidates.id, candidateId)).limit(1),
  ]);

  const rawKeys = [...documentRows.map((r) => r.storageKey), ...versionRows.map((r) => r.storageKey)];
  const urlKeys = [...fileRows.map((r) => r.fileUrl), candidateRow[0]?.avatarUrl]
    .filter((url): url is string => Boolean(url))
    .map((url) => workspaceStorageKeyFromUrl(workspaceId, url))
    .filter((key): key is string => Boolean(key));
  const storageKeys = new Set([...rawKeys, ...urlKeys]);

  const storageResults = await Promise.allSettled([...storageKeys].map((key) => storage.delete(key)));
  if (storageResults.some((result) => result.status === "rejected")) {
    log.error({ candidateId }, "retention: could not erase every stored object, will retry next run");
    return "failed";
  }

  try {
    await db.transaction(async (tx) => {
      if (documentIds.length > 0) {
        await tx.delete(documents).where(inArray(documents.id, documentIds));
      }
      // Derived artifacts can retain candidate data even after the raw resume
      // is removed. They are not needed for anonymized historical metrics.
      await tx.delete(aiEvaluations).where(eq(aiEvaluations.candidateId, candidateId));
      await tx.delete(candidateEmbeddings).where(eq(candidateEmbeddings.candidateId, candidateId));
      await tx.delete(evaluationJobs).where(eq(evaluationJobs.candidateId, candidateId));
      await tx.delete(candidateFiles).where(eq(candidateFiles.candidateId, candidateId));

      const now = new Date();
      const [updated] = await tx
        .update(candidates)
        .set({
          firstName: "Redacted",
          lastName: "Candidate",
          email: `redacted+${candidateId}@anonymized.invalid`,
          phone: null,
          address: null,
          location: null,
          linkedinUrl: null,
          githubUrl: null,
          websiteUrl: null,
          avatarUrl: null,
          headline: null,
          summary: null,
          skills: [],
          educationEntries: [],
          experienceEntries: [],
          anonymizedAt: now,
          updatedAt: now,
        })
        .where(and(eq(candidates.id, candidateId), isNull(candidates.anonymizedAt)))
        .returning({ id: candidates.id });
      if (!updated) throw new Error("Candidate was already anonymized or removed.");

      await tx.insert(activityEvents).values({
        workspaceId,
        actorId: null,
        entityType: "candidate",
        entityId: candidateId,
        type: "candidate.anonymized",
        metadata: { reason: "data_retention", thresholdMonths, documentsDeleted: documentIds.length },
      });
    });
  } catch (error) {
    log.error({ error, candidateId }, "retention: anonymization transaction failed");
    return "failed";
  }

  return "anonymized";
}
