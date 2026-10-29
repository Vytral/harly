import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { applications, candidates, db, jobs, offers } from "@harly/db";

import {
  candidateScopeSql,
  isUnrestrictedScope,
  jobScopeSql,
  type WorkspaceSearchActor,
} from "@/features/search/scope";

export type DocumentAssociationTarget = {
  targetType: string;
  targetId: string | null;
};

function targetKey(target: DocumentAssociationTarget): string {
  return `${target.targetType}:${target.targetId ?? ""}`;
}

/**
 * Resolves which document association targets the actor may see. A target is
 * visible when the record it points at sits inside the actor's scope, judged by
 * the same predicates the candidate and job lists use. Workspace-level
 * associations have no record and are always visible. Unrestricted actors skip
 * the queries entirely.
 */
export async function visibleAssociationTargets(
  actor: WorkspaceSearchActor,
  targets: DocumentAssociationTarget[],
): Promise<Set<string>> {
  const visible = new Set<string>();
  if (isUnrestrictedScope(actor.scope)) {
    for (const target of targets) visible.add(targetKey(target));
    return visible;
  }

  const idsByType = new Map<string, Set<string>>();
  for (const target of targets) {
    if (!target.targetId || target.targetType === "workspace") continue;
    const ids = idsByType.get(target.targetType) ?? new Set<string>();
    ids.add(target.targetId);
    idsByType.set(target.targetType, ids);
  }

  const idsFor = (type: string) => [...(idsByType.get(type) ?? [])];

  if (idsByType.has("candidate")) {
    const rows = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, actor.workspaceId),
          inArray(candidates.id, idsFor("candidate")),
          candidateScopeSql(actor, candidates.id),
        ),
      );
    for (const row of rows) visible.add(targetKey({ targetType: "candidate", targetId: row.id }));
  }

  if (idsByType.has("job")) {
    const rows = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, actor.workspaceId),
          inArray(jobs.id, idsFor("job")),
          jobScopeSql(actor),
        ),
      );
    for (const row of rows) visible.add(targetKey({ targetType: "job", targetId: row.id }));
  }

  if (idsByType.has("application")) {
    const rows = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(applications.workspaceId, actor.workspaceId),
          eq(jobs.workspaceId, actor.workspaceId),
          inArray(applications.id, idsFor("application")),
          jobScopeSql(actor),
        ),
      );
    for (const row of rows) visible.add(targetKey({ targetType: "application", targetId: row.id }));
  }

  if (idsByType.has("offer")) {
    const rows = await db
      .select({ id: offers.id })
      .from(offers)
      .innerJoin(jobs, eq(jobs.id, offers.jobId))
      .where(
        and(
          eq(offers.workspaceId, actor.workspaceId),
          eq(jobs.workspaceId, actor.workspaceId),
          inArray(offers.id, idsFor("offer")),
          jobScopeSql(actor),
        ),
      );
    for (const row of rows) visible.add(targetKey({ targetType: "offer", targetId: row.id }));
  }

  return visible;
}

/** Whether one association is inside the actor's scope, given the visible set. */
export function isAssociationVisible(
  target: DocumentAssociationTarget,
  visibleTargets: ReadonlySet<string>,
): boolean {
  if (target.targetType === "workspace") return true;
  return visibleTargets.has(targetKey(target));
}

/**
 * A document with at least one association is hidden from a viewer whose
 * access is only the workspace-wide default when every one of its associations
 * is out of scope. Explicit access (ownership, an admin role, or an ACL rule
 * that names the viewer) stays authoritative, and a document with no
 * associations is never hidden by this rule.
 */
export function documentHiddenByAssociationScope(input: {
  associations: DocumentAssociationTarget[];
  visibleTargets: ReadonlySet<string>;
  aclGranted: boolean;
}): boolean {
  if (input.aclGranted || input.associations.length === 0) return false;
  return input.associations.every(
    (target) => !isAssociationVisible(target, input.visibleTargets),
  );
}
