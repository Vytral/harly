import "server-only";

import { and, eq, inArray, ne, or } from "drizzle-orm";

import { activityEvents, applications, db, offers } from "@harly/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Withdraw every other active application (and their draft/sent offers) after a hire. */
export async function withdrawSiblingApplicationsForHire(
  tx: Tx,
  input: {
    workspaceId: string;
    candidateId: string;
    hiredApplicationId: string;
    actorUserId: string;
  },
) {
  const sisterApplications = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, input.workspaceId),
        eq(applications.candidateId, input.candidateId),
        ne(applications.id, input.hiredApplicationId),
        eq(applications.status, "active"),
      ),
    );

  if (sisterApplications.length === 0) return;

  const sisterIds = sisterApplications.map((sister) => sister.id);
  await tx
    .update(applications)
    .set({
      status: "withdrawn",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(applications.workspaceId, input.workspaceId),
        inArray(applications.id, sisterIds),
      ),
    );

  await tx
    .update(offers)
    .set({
      status: "withdrawn",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(offers.workspaceId, input.workspaceId),
        inArray(offers.applicationId, sisterIds),
        or(eq(offers.status, "draft"), eq(offers.status, "sent")),
      ),
    );

  await tx.insert(activityEvents).values(
    sisterApplications.map((sister) => ({
      workspaceId: input.workspaceId,
      actorId: input.actorUserId,
      entityType: "application" as const,
      entityId: sister.id,
      type: "application.withdrawn",
      metadata: {
        reason: "hired_for_another_role",
        hiredApplicationId: input.hiredApplicationId,
      },
    })),
  );
}
