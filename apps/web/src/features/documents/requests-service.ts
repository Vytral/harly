import "server-only";

import { and, asc, eq, lte, inArray } from "drizzle-orm";

import {
  activityEvents,
  applications,
  candidatePortalNotifications,
  db,
  documentRequestPackages,
  documentRequests,
} from "@harly/db";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WorkflowDocumentRequestItem = {
  title: string;
  instructions?: string;
};

export type WorkflowDocumentRequestResult =
  | {
      ok: true;
      applicationId: string;
      candidateId: string;
      packageId: string;
      requestIds: string[];
      reused: boolean;
    }
  | { ok: false; error: string };

/**
 * Session-free domain operation used by the workflow adapter. The caller has
 * already checked the actor permission; this module owns tenant validation,
 * idempotency and the candidate-facing notification.
 */
export async function createDocumentRequestsForWorkflow(input: {
  database?: typeof db;
  workspaceId: string;
  actorUserId: string;
  applicationId: string;
  items: WorkflowDocumentRequestItem[];
  dueAt?: Date | null;
  effectKey: string;
}): Promise<WorkflowDocumentRequestResult> {
  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    const [application] = await tx
      .select({ id: applications.id, candidateId: applications.candidateId })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.id, input.applicationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!application) return { ok: false, error: "Application not found." };

    let [packageRow] = await tx
      .select({ id: documentRequestPackages.id })
      .from(documentRequestPackages)
      .where(
        and(
          eq(documentRequestPackages.workspaceId, input.workspaceId),
          eq(documentRequestPackages.workflowEffectId, input.effectKey),
        ),
      )
      .limit(1);
    if (!packageRow) {
      [packageRow] = await tx
        .insert(documentRequestPackages)
        .values({
          workspaceId: input.workspaceId,
          applicationId: application.id,
          candidateId: application.candidateId,
          workflowEffectId: input.effectKey,
          version: 1,
          status: "pending",
          dueAt: input.dueAt ?? null,
          requestedById: input.actorUserId || null,
        })
        .onConflictDoNothing({
          target: [documentRequestPackages.workspaceId, documentRequestPackages.workflowEffectId],
        })
        .returning({ id: documentRequestPackages.id });
    }
    if (!packageRow) {
      [packageRow] = await tx
        .select({ id: documentRequestPackages.id })
        .from(documentRequestPackages)
        .where(
          and(
            eq(documentRequestPackages.workspaceId, input.workspaceId),
            eq(documentRequestPackages.workflowEffectId, input.effectKey),
          ),
        )
        .limit(1);
    }
    if (!packageRow) return { ok: false, error: "Document package could not be created." };

    const existing = await tx
      .select({ id: documentRequests.id })
      .from(documentRequests)
      .where(
        and(
          eq(documentRequests.workspaceId, input.workspaceId),
          eq(documentRequests.packageId, packageRow.id),
        ),
      );
    if (existing.length > 0) {
      return {
        ok: true,
        applicationId: application.id,
        candidateId: application.candidateId,
        packageId: packageRow.id,
        requestIds: existing.map((row) => row.id),
        reused: true,
      };
    }

    const inserted = await tx
      .insert(documentRequests)
      .values(
        input.items.map((item, index) => ({
          workspaceId: input.workspaceId,
          applicationId: application.id,
          candidateId: application.candidateId,
          packageId: packageRow.id,
          title: item.title.trim(),
          instructions: item.instructions?.trim() || null,
          dueAt: input.dueAt ?? null,
          requestedById: input.actorUserId || null,
          // Keep a per-item effect key for legacy consumers while the package
          // owns the canonical idempotency identity.
          workflowEffectId: `${input.effectKey}:${index}`,
        })),
      )
      .returning({ id: documentRequests.id });

    if (inserted.length === 0) {
      return { ok: false, error: "Document requests could not be created." };
    }

    await tx.insert(activityEvents).values({
      workspaceId: input.workspaceId,
      actorId: input.actorUserId || null,
      entityType: "candidate",
      entityId: application.candidateId,
      type: "document.requested",
      metadata: {
        applicationId: application.id,
        count: inserted.length,
        titles: input.items.map((item) => item.title.trim()),
        source: "workflow",
      },
    });

    const count = inserted.length;
    await tx.insert(candidatePortalNotifications).values({
      workspaceId: input.workspaceId,
      candidateId: application.candidateId,
      type: "document_requested",
      title: count === 1 ? "A document was requested" : `${count} documents were requested`,
      body:
        count === 1
          ? `Please upload: ${input.items[0]!.title.trim()}.`
          : `You have ${count} documents to upload for your application.`,
      href: `/portal/applications/${application.id}`,
      metadata: { applicationId: application.id, count, source: "workflow" },
    });

    return {
      ok: true,
      applicationId: application.id,
      candidateId: application.candidateId,
      packageId: packageRow.id,
      requestIds: inserted.map((row) => row.id),
      reused: false,
    };
  });
}

/** Recompute package state from its item rows inside the caller's transaction. */
export async function reconcileDocumentRequestPackage(
  tx: DatabaseTransaction,
  input: { workspaceId: string; packageId: string },
  now = new Date(),
): Promise<"pending" | "completed" | "declined" | "cancelled"> {
  // Every item mutation calls this helper in the same transaction. Locking the
  // package first serializes concurrent uploads/reviews for one package, so a
  // second transaction recalculates against the first transaction's commit
  // instead of overwriting a completed package with a stale `pending` state.
  const [packageRow] = await tx
    .select({ id: documentRequestPackages.id })
    .from(documentRequestPackages)
    .where(and(
      eq(documentRequestPackages.workspaceId, input.workspaceId),
      eq(documentRequestPackages.id, input.packageId),
    ))
    .for("update")
    .limit(1);
  if (!packageRow) return "cancelled";

  const rows = await tx
    .select({ status: documentRequests.status })
    .from(documentRequests)
    .where(and(
      eq(documentRequests.workspaceId, input.workspaceId),
      eq(documentRequests.packageId, input.packageId),
    ));
  const status = rows.length === 0
    ? "cancelled"
    : rows.some((row) => row.status === "declined")
    ? "declined"
    : rows.length > 0 && rows.every((row) => row.status === "accepted" || row.status === "waived")
      ? "completed"
      : "pending";
  await tx
    .update(documentRequestPackages)
    .set({
      status,
      completedAt: status === "completed" ? now : null,
      resolvedAt: status === "pending" ? null : now,
      updatedAt: now,
    })
    .where(and(
      eq(documentRequestPackages.workspaceId, input.workspaceId),
      eq(documentRequestPackages.id, input.packageId),
    ));
  return status;
}

/**
 * Expire candidate document packages whose recruiter deadline has passed.
 * Package expiry is deliberately separate from item review status: a request
 * remains auditable in the portal, while the workflow observes one canonical
 * terminal package state and can take its `expired` edge.
 */
export async function expireOverdueDocumentRequestPackages(
  database: typeof db = db,
  now = new Date(),
): Promise<{ workspaceId: string; packageId: string }[]> {
  return database.transaction(async (tx) => {
    const due = await tx
      .select({
        id: documentRequestPackages.id,
        workspaceId: documentRequestPackages.workspaceId,
        candidateId: documentRequestPackages.candidateId,
        applicationId: documentRequestPackages.applicationId,
      })
      .from(documentRequestPackages)
      .where(and(
        eq(documentRequestPackages.status, "pending"),
        lte(documentRequestPackages.dueAt, now),
      ))
      .orderBy(asc(documentRequestPackages.dueAt), asc(documentRequestPackages.id))
      .limit(200)
      .for("update", { skipLocked: true });

    if (due.length === 0) return [];
    const ids = due.map((row) => row.id);
    const expired = await tx
      .update(documentRequestPackages)
      .set({ status: "expired", resolvedAt: now, updatedAt: now })
      .where(and(
        inArray(documentRequestPackages.id, ids),
        eq(documentRequestPackages.status, "pending"),
      ))
      .returning({ id: documentRequestPackages.id, workspaceId: documentRequestPackages.workspaceId });

    for (const row of expired) {
      const original = due.find((candidate) => candidate.id === row.id);
      if (!original) continue;
      await tx.insert(activityEvents).values({
        workspaceId: row.workspaceId,
        actorId: null,
        entityType: "candidate",
        entityId: original.candidateId,
        type: "document.package_expired",
        metadata: { packageId: row.id, applicationId: original.applicationId, source: "system" },
      });
      await tx.insert(candidatePortalNotifications).values({
        workspaceId: row.workspaceId,
        candidateId: original.candidateId,
        type: "document_expired",
        title: "Document request expired",
        body: "A document request passed its deadline. Contact the recruiting team if you need more time.",
        href: `/portal/applications/${original.applicationId}`,
        metadata: { packageId: row.id, applicationId: original.applicationId, source: "system" },
      });
    }
    return expired.map((row) => ({ workspaceId: row.workspaceId, packageId: row.id }));
  });
}
