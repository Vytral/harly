import "server-only";

import { and, eq, or } from "drizzle-orm";

import {
  activityEvents,
  db,
  member,
  notifications,
  workspaceSettings,
} from "@harly/db";

import { detectCandidateDuplicatesForWorkspace } from "@/features/candidates/duplicate-detection";
import { getWorkspaceAiConfig } from "@/lib/ai/config";

/**
 * Flag likely duplicate candidates after application intake when the workspace
 * opted in. The application response is not blocked and failures are logged.
 */
export async function scheduleAutoDuplicateCheck(
  candidateId: string,
  workspaceId: string,
): Promise<void> {
  try {
    const [settings] = await db
      .select({ aiDuplicateCheck: workspaceSettings.aiDuplicateCheck })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1);
    if (!settings?.aiDuplicateCheck) return;

    const aiConfig = await getWorkspaceAiConfig(workspaceId);
    if (!aiConfig) return;

    const matches = await detectCandidateDuplicatesForWorkspace({
      workspaceId,
      candidateId,
      config: aiConfig,
    });
    if (matches.length === 0) return;

    // Avoid repeatedly notifying when an existing candidate applies to another
    // role after already being flagged.
    const [existingFlag] = await db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.workspaceId, workspaceId),
          eq(activityEvents.entityType, "candidate"),
          eq(activityEvents.entityId, candidateId),
          eq(activityEvents.type, "candidate.duplicate_detected"),
        ),
      )
      .limit(1);
    if (existingFlag) return;

    const recipients = await db
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(
          eq(member.organizationId, workspaceId),
          or(eq(member.role, "owner"), eq(member.role, "admin")),
        ),
      );

    await db.transaction(async (tx) => {
      await tx.insert(activityEvents).values({
        workspaceId,
        actorId: null,
        entityType: "candidate",
        entityId: candidateId,
        type: "candidate.duplicate_detected",
        metadata: { matches },
      });

      if (recipients.length > 0) {
        const names = matches
          .slice(0, 3)
          .map((match) => match.fullName)
          .join(", ");
        await tx.insert(notifications).values(
          recipients.map(({ userId }) => ({
            workspaceId,
            userId,
            actorId: null,
            type: "candidate.duplicate_detected",
            title: "Possible duplicate candidate",
            body: `Harly AI found a possible match with ${names}.`,
            href: `/dashboard/candidates/${candidateId}`,
            metadata: { candidateId, matches },
          })),
        );
      }
    });
  } catch (error) {
    console.error(
      "Auto duplicate check failed for candidate",
      candidateId,
      error,
    );
  }
}
