import "server-only";

import { and, eq } from "drizzle-orm";

import { applications, db, documentAssociations, offers } from "@harly/db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Resolve only workspace-scoped business context for document lifecycle events. */
export async function documentAutomationContext(
  tx: Transaction,
  workspaceId: string,
  documentId: string,
): Promise<Record<string, unknown>> {
  const associations = await tx
    .select({ targetType: documentAssociations.targetType, targetId: documentAssociations.targetId })
    .from(documentAssociations)
    .where(and(
      eq(documentAssociations.workspaceId, workspaceId),
      eq(documentAssociations.documentId, documentId),
    ));

  const applicationId = associations.find((item) => item.targetType === "application")?.targetId;
  const offerId = associations.find((item) => item.targetType === "offer")?.targetId;
  let candidateId = associations.find((item) => item.targetType === "candidate")?.targetId;

  if (offerId) {
    const [offer] = await tx
      .select({ id: offers.id, applicationId: offers.applicationId, candidateId: offers.candidateId })
      .from(offers)
      .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, offerId)))
      .limit(1);
    if (offer) {
      candidateId ??= offer.candidateId;
      const application = applicationId ?? offer.applicationId;
      if (application) {
        const [row] = await tx
          .select({ id: applications.id, candidateId: applications.candidateId, jobId: applications.jobId })
          .from(applications)
          .where(and(eq(applications.workspaceId, workspaceId), eq(applications.id, application)))
          .limit(1);
        if (row) {
          return {
            application: { id: row.id, candidateId: row.candidateId, jobId: row.jobId },
            candidate: { id: row.candidateId },
            offer: { id: offer.id },
          };
        }
      }
      return {
        ...(candidateId ? { candidate: { id: candidateId } } : {}),
        offer: { id: offer.id },
      };
    }
  }

  if (applicationId) {
    const [application] = await tx
      .select({ id: applications.id, candidateId: applications.candidateId, jobId: applications.jobId })
      .from(applications)
      .where(and(eq(applications.workspaceId, workspaceId), eq(applications.id, applicationId)))
      .limit(1);
    if (application) {
      return {
        application: { id: application.id, candidateId: application.candidateId, jobId: application.jobId },
        candidate: { id: application.candidateId },
      };
    }
  }

  return candidateId ? { candidate: { id: candidateId } } : {};
}
