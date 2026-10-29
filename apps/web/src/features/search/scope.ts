import "server-only";

import { and, eq, or, sql, type AnyColumn, type SQL } from "drizzle-orm";

import {
  applications,
  jobHiringTeam,
  jobs,
  tasks,
} from "@harly/db";

import type {
  Permission,
  RoleScope,
} from "@/features/workspaces/permissions";

/**
 * Who is searching, resolved once per request from the role policy. `scope` is
 * the same `RoleScope` the pipeline and candidate actions enforce.
 */
export type WorkspaceSearchActor = {
  workspaceId: string;
  userId: string;
  permissions: readonly Permission[];
  scope: RoleScope;
};

export function actorHasPermission(
  actor: WorkspaceSearchActor,
  permission: Permission,
): boolean {
  return actor.permissions.includes(permission);
}

export function isUnrestrictedScope(scope: RoleScope): boolean {
  return (
    scope.jobAccess === "all" &&
    scope.departments.length === 0 &&
    scope.regions.length === 0
  );
}

/**
 * Pure mirror of the job-level rule in `requireJobPermission`: department and
 * region lists are case-insensitive allow-lists (empty means unrestricted, a
 * missing value never matches a non-empty list), and `assigned` access also
 * needs a hiring-team row. `isAssigned` is that membership.
 */
export function jobVisibleUnderScope(
  scope: RoleScope,
  job: { department: string | null; region: string | null },
  isAssigned: boolean,
): boolean {
  if (isUnrestrictedScope(scope)) return true;
  const allowedBy = (allowed: readonly string[], value: string | null) =>
    allowed.length === 0 ||
    (Boolean(value) &&
      allowed.some(
        (candidate) =>
          candidate.toLocaleLowerCase() === value!.toLocaleLowerCase(),
      ));
  if (!allowedBy(scope.departments, job.department)) return false;
  if (!allowedBy(scope.regions, job.region)) return false;
  return scope.jobAccess === "all" || isAssigned;
}

function lowerIn(column: AnyColumn, values: readonly string[]): SQL {
  return sql`lower(${column}) in (${sql.join(
    values.map((value) => sql`${value.toLowerCase()}`),
    sql`, `,
  )})`;
}

/**
 * The job-level predicates for a restricted actor, as SQL over the `jobs`
 * table. Callers must check {@link isUnrestrictedScope} first; this always
 * returns at least one clause for a restricted scope.
 */
function restrictedJobClauses(actor: WorkspaceSearchActor): SQL[] {
  const clauses: SQL[] = [];
  if (actor.scope.departments.length > 0) {
    clauses.push(lowerIn(jobs.department, actor.scope.departments));
  }
  if (actor.scope.regions.length > 0) {
    clauses.push(lowerIn(jobs.jobLocationRegion, actor.scope.regions));
  }
  if (actor.scope.jobAccess === "assigned") {
    clauses.push(
      sql`exists (select 1 from ${jobHiringTeam} where ${jobHiringTeam.jobId} = ${jobs.id} and ${jobHiringTeam.userId} = ${actor.userId} and ${jobHiringTeam.workspaceId} = ${actor.workspaceId})`,
    );
  }
  return clauses;
}

/**
 * Predicate restricting a `jobs` row to the actor's scope, or undefined when
 * the actor is unrestricted. Used directly on jobs queries.
 */
export function jobScopeSql(actor: WorkspaceSearchActor): SQL | undefined {
  if (isUnrestrictedScope(actor.scope)) return undefined;
  return sql`(${sql.join(restrictedJobClauses(actor), sql` and `)})`;
}

/**
 * Candidates are visible to a restricted actor only through an application on
 * a job inside their scope. A candidate with no such application is hidden,
 * matching `requireCandidatePermission`.
 */
export function candidateScopeSql(
  actor: WorkspaceSearchActor,
  candidateId: AnyColumn,
): SQL | undefined {
  if (isUnrestrictedScope(actor.scope)) return undefined;
  return sql`exists (select 1 from ${applications} inner join ${jobs} on ${jobs.id} = ${applications.jobId} where ${applications.candidateId} = ${candidateId} and ${applications.workspaceId} = ${actor.workspaceId} and ${jobs.workspaceId} = ${actor.workspaceId} and ${jobs.deletedAt} is null and ${sql.join(restrictedJobClauses(actor), sql` and `)})`;
}

/**
 * Tasks are visible to a restricted actor when they are theirs (owned or
 * created by them), or when every link the task carries is inside the actor's
 * scope. A task with a job or application link is judged by those links only,
 * so a link to an out-of-scope application or job hides the task even when its
 * candidate has an in-scope application. The candidate is consulted only for an
 * unlinked task. Unlinked tasks owned by someone else stay hidden when the
 * candidate has no in-scope application.
 */
export function taskScopeSql(actor: WorkspaceSearchActor): SQL | undefined {
  if (isUnrestrictedScope(actor.scope)) return undefined;
  const scopedJob = sql.join(restrictedJobClauses(actor), sql` and `);
  const jobInScope = sql`exists (select 1 from ${jobs} where ${jobs.id} = ${tasks.jobId} and ${jobs.workspaceId} = ${actor.workspaceId} and ${jobs.deletedAt} is null and ${scopedJob})`;
  const applicationInScope = sql`exists (select 1 from ${applications} inner join ${jobs} on ${jobs.id} = ${applications.jobId} where ${applications.id} = ${tasks.applicationId} and ${applications.workspaceId} = ${actor.workspaceId} and ${jobs.deletedAt} is null and ${scopedJob})`;
  const candidateInScope = sql`exists (select 1 from ${applications} inner join ${jobs} on ${jobs.id} = ${applications.jobId} where ${applications.candidateId} = ${tasks.candidateId} and ${applications.workspaceId} = ${actor.workspaceId} and ${jobs.deletedAt} is null and ${scopedJob})`;
  const hasLink = sql`(${tasks.applicationId} is not null or ${tasks.jobId} is not null)`;
  const linksInScope = sql`(${tasks.applicationId} is null or ${applicationInScope}) and (${tasks.jobId} is null or ${jobInScope})`;
  const unlinked = sql`(${tasks.applicationId} is null and ${tasks.jobId} is null)`;
  return or(
    eq(tasks.ownerId, actor.userId),
    eq(tasks.createdById, actor.userId),
    and(hasLink, sql`(${linksInScope})`),
    and(unlinked, candidateInScope),
  );
}
