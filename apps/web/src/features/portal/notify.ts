import "server-only";

import { candidatePortalNotifications, db } from "@harly/db";

/**
 * In-app delivery for candidate-facing events. Always works, with or without
 * outgoing email, so a candidate sees updates (offers, documents, interviews,
 * messages) inside the portal even when the company has no mail configured.
 */
export async function createCandidatePortalNotification(input: {
  workspaceId: string;
  candidateId: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(candidatePortalNotifications).values({
    workspaceId: input.workspaceId,
    candidateId: input.candidateId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    metadata: input.metadata ?? {},
  });
}
