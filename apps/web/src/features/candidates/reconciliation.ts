import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import {
  activityEvents,
  applications,
  candidateFiles,
  candidateMessages,
  candidateNotes,
  candidatePortalNotifications,
  candidatePortalSessions,
  candidateTags,
  candidates,
  db,
  documentAssociations,
  documentVersions,
  documents,
  mailAttachments,
  mailMessages,
  mailThreads,
  organization,
  savedSignatures,
  signatureArtifacts,
  workspaceSettings,
} from "@harly/db";
import { storage } from "@/lib/storage";
import { workspaceStorageKeyFromUrl } from "./data";
import { enqueueCandidateDeletionJob } from "./deletion-jobs";

export type CandidateDeletionReconciliation = {
  workspaceId: string;
  dryRun: boolean;
  deletedCandidates: Array<{
    id: string;
    fullName: string;
    remaining: Record<string, number>;
    deletionQueued: boolean;
  }>;
  orphanStorageKeys: string[];
};

function legacyAttachmentKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    typeof item === "object" &&
    item !== null &&
    "storageKey" in item &&
    typeof item.storageKey === "string"
      ? [item.storageKey]
      : [],
  );
}

/**
 * Reports previously soft-deleted candidates that still have related rows or
 * candidate-owned objects. With `dryRun=false` it only enqueues idempotent
 * purge jobs; the durable deletion worker performs the destructive step.
 */
export async function reconcileCandidateDeletion(input: {
  workspaceId: string;
  dryRun?: boolean;
  limit?: number;
  requestedBy?: string;
}): Promise<CandidateDeletionReconciliation> {
  const dryRun = input.dryRun ?? true;
  const deleted = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      avatarUrl: candidates.avatarUrl,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        isNotNull(candidates.deletedAt),
      ),
    )
    .limit(input.limit ?? 100);

  const candidateReports = [];
  const referencedKeys = new Set<string>();
  const workspacePrefix = `workspaces/${input.workspaceId}/`;

  const [
    allFiles,
    allDocuments,
    allVersions,
    allMailAttachments,
    allSignatureArtifacts,
    allSavedSignatures,
    allCandidates,
    allLegacyMessages,
    branding,
  ] = await Promise.all([
    db
      .select({ fileUrl: candidateFiles.fileUrl })
      .from(candidateFiles)
      .where(eq(candidateFiles.workspaceId, input.workspaceId)),
    db
      .select({ storageKey: documents.storageKey })
      .from(documents)
      .where(eq(documents.workspaceId, input.workspaceId)),
    db
      .select({ storageKey: documentVersions.storageKey })
      .from(documentVersions)
      .where(eq(documentVersions.workspaceId, input.workspaceId)),
    db
      .select({ storageKey: mailAttachments.storageKey })
      .from(mailAttachments)
      .where(eq(mailAttachments.workspaceId, input.workspaceId)),
    db
      .select({ storageKey: signatureArtifacts.storageKey })
      .from(signatureArtifacts)
      .where(eq(signatureArtifacts.workspaceId, input.workspaceId)),
    db
      .select({ storageKey: savedSignatures.storageKey })
      .from(savedSignatures)
      .where(eq(savedSignatures.workspaceId, input.workspaceId)),
    db
      .select({ avatarUrl: candidates.avatarUrl })
      .from(candidates)
      .where(eq(candidates.workspaceId, input.workspaceId)),
    db
      .select({ attachments: candidateMessages.attachments })
      .from(candidateMessages)
      .where(eq(candidateMessages.workspaceId, input.workspaceId)),
    db
      .select({
        logo: organization.logo,
        logoEmail: organization.logoEmail,
        heroImageUrl: workspaceSettings.heroImageUrl,
        sidebarLogoUrl: workspaceSettings.sidebarLogoUrl,
        sidebarLogoDarkUrl: workspaceSettings.sidebarLogoDarkUrl,
      })
      .from(organization)
      .leftJoin(
        workspaceSettings,
        eq(workspaceSettings.organizationId, organization.id),
      )
      .where(eq(organization.id, input.workspaceId)),
  ]);

  for (const row of allFiles) {
    const key = workspaceStorageKeyFromUrl(input.workspaceId, row.fileUrl);
    if (key) referencedKeys.add(key);
  }
  for (const row of [
    ...allDocuments,
    ...allVersions,
    ...allMailAttachments,
    ...allSignatureArtifacts,
    ...allSavedSignatures,
  ]) {
    if (row.storageKey.startsWith(workspacePrefix))
      referencedKeys.add(row.storageKey);
  }
  for (const row of allCandidates) {
    if (!row.avatarUrl) continue;
    const key = workspaceStorageKeyFromUrl(input.workspaceId, row.avatarUrl);
    if (key) referencedKeys.add(key);
  }
  for (const row of allLegacyMessages) {
    for (const key of legacyAttachmentKeys(row.attachments)) {
      if (
        key.startsWith(workspacePrefix) ||
        key.startsWith(`mailboxes/${input.workspaceId}/`)
      )
        referencedKeys.add(key);
    }
  }
  for (const row of branding) {
    for (const value of [
      row.logo,
      row.logoEmail,
      row.heroImageUrl,
      row.sidebarLogoUrl,
      row.sidebarLogoDarkUrl,
    ]) {
      if (!value) continue;
      const key = workspaceStorageKeyFromUrl(input.workspaceId, value);
      if (key) referencedKeys.add(key);
    }
  }

  for (const candidate of deleted) {
    const [applicationRows, counts] = await Promise.all([
      db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.candidateId, candidate.id)),
      Promise.all([
        db
          .select({ id: candidateFiles.id })
          .from(candidateFiles)
          .where(eq(candidateFiles.candidateId, candidate.id)),
        db
          .select({ id: candidateNotes.id })
          .from(candidateNotes)
          .where(eq(candidateNotes.candidateId, candidate.id)),
        db
          .select({ id: candidateTags.id })
          .from(candidateTags)
          .where(eq(candidateTags.candidateId, candidate.id)),
        db
          .select({ id: candidatePortalSessions.id })
          .from(candidatePortalSessions)
          .where(eq(candidatePortalSessions.candidateId, candidate.id)),
        db
          .select({ id: candidatePortalNotifications.id })
          .from(candidatePortalNotifications)
          .where(eq(candidatePortalNotifications.candidateId, candidate.id)),
        db
          .select({ id: candidateMessages.id })
          .from(candidateMessages)
          .where(eq(candidateMessages.candidateId, candidate.id)),
        db
          .select({ id: activityEvents.id })
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.workspaceId, input.workspaceId),
              eq(activityEvents.entityId, candidate.id),
            ),
          ),
        db
          .select({ id: documentAssociations.id })
          .from(documentAssociations)
          .where(
            and(
              eq(documentAssociations.workspaceId, input.workspaceId),
              eq(documentAssociations.targetId, candidate.id),
            ),
          ),
        db
          .select({ id: mailMessages.id })
          .from(mailMessages)
          .where(eq(mailMessages.candidateId, candidate.id)),
        db
          .select({ id: mailThreads.id })
          .from(mailThreads)
          .where(eq(mailThreads.candidateId, candidate.id)),
      ]),
    ]);
    const values = [applicationRows, ...counts];
    const remaining = Object.fromEntries(
      values.map((rows, index) => [
        [
          "applications",
          "candidateFiles",
          "notes",
          "tags",
          "portalSessions",
          "portalNotifications",
          "legacyMessages",
          "activityEvents",
          "documentAssociations",
          "mailMessages",
          "mailThreads",
        ][index],
        rows.length,
      ]),
    ) as Record<string, number>;
    const job = !dryRun
      ? await enqueueCandidateDeletionJob({
          workspaceId: input.workspaceId,
          candidateId: candidate.id,
          requestType: "reconciliation",
          requestedBy: input.requestedBy ?? "reconciliation",
        })
      : null;
    candidateReports.push({
      id: candidate.id,
      fullName: `${candidate.firstName} ${candidate.lastName}`,
      remaining,
      deletionQueued: Boolean(job),
    });
  }

  const storedKeys = await storage.list(workspacePrefix);
  const candidateOwnedPrefixes = [
    workspacePrefix,
    `mailboxes/${input.workspaceId}/`,
  ];
  const orphanStorageKeys = storedKeys.filter(
    (key) =>
      candidateOwnedPrefixes.some((prefix) => key.startsWith(prefix)) &&
      !referencedKeys.has(key),
  );
  return {
    workspaceId: input.workspaceId,
    dryRun,
    deletedCandidates: candidateReports,
    orphanStorageKeys,
  };
}
