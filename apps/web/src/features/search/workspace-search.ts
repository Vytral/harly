import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  isNull,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

import {
  applications,
  candidates,
  db,
  jobStages,
  jobs,
  member as authMembers,
  tasks,
  user as authUsers,
} from "@harly/db";

import { TASK_STATUS_LABELS } from "@/features/tasks/shared";
import type { Permission } from "@/features/workspaces/permissions";
import { getRolePolicy } from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";

import {
  actorHasPermission,
  candidateScopeSql,
  jobScopeSql,
  taskScopeSql,
  type WorkspaceSearchActor,
} from "./scope";
import {
  clampSearchLimit,
  highlightRanges,
  normalizeSearchQuery,
  type NormalizedSearchQuery,
} from "./query";
import {
  emptyWorkspaceSearchResults,
  type SearchGroupKey,
  type WorkspaceSearchGroup,
  type WorkspaceSearchHit,
  type WorkspaceSearchResults,
} from "./results";

/**
 * The permission each group needs. A group the caller lacks is omitted, so no
 * candidate name, email or application leaves the server without candidate access.
 */
export const SEARCH_GROUP_PERMISSION: Record<SearchGroupKey, Permission> = {
  jobs: "jobs:view",
  candidates: "candidates:view",
  applications: "candidates:view",
  tasks: "tasks:read",
  people: "members:read",
};

/** Resolve who is searching. Redirects for unauthenticated users, as other pages do. */
export async function resolveSearchActor(): Promise<WorkspaceSearchActor> {
  const context = await getWorkspaceContext();
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  return {
    workspaceId: context.organization.id,
    userId: context.user.id,
    permissions: policy.permissions,
    scope: policy.scope,
  };
}

// ---------------------------------------------------------------------------
// SQL building blocks. Text is compared through lower(...) so the trigram
// indexes from migration 0155 apply to the same expressions.
// ---------------------------------------------------------------------------

const candidateFullName = sql`(${candidates.firstName} || ' ' || ${candidates.lastName})`;

function lowerLike(expression: SQL | AnyColumn, pattern: string): SQL {
  return sql`lower(${expression}) like ${pattern}`;
}

/** Every query token appears in the text (order-independent). */
function tokensMatch(expression: SQL | AnyColumn, query: NormalizedSearchQuery): SQL {
  return and(
    ...query.tokenContainsPatterns.map((pattern) => lowerLike(expression, pattern)),
  )!;
}

/**
 * Match tier per row, the SQL form of {@link matchRank}: 0 exact, 1 prefix,
 * 2 contains. Ordering by it before recency puts an exact email first.
 */
function rankSql(
  query: NormalizedSearchQuery,
  exact: (SQL | AnyColumn)[],
  prefix: (SQL | AnyColumn)[],
): SQL<number> {
  return sql<number>`case when ${or(
    ...exact.map((expression) => sql`lower(${expression}) = ${query.lower}`),
  )} then 0 when ${or(
    ...prefix.map((expression) => lowerLike(expression, query.prefixPattern)),
  )} then 1 else 2 end`;
}

function seeAllCandidates(query: NormalizedSearchQuery): string {
  return `/dashboard/candidates?q=${encodeURIComponent(query.text)}`;
}

function joinParts(parts: (string | null | undefined)[]): string | null {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length > 0 ? present.join(" • ") : null;
}

// ---------------------------------------------------------------------------
// One query per group. Each applies the group's workspace filter, the actor's
// scope, and fetches `limit + 1` rows so `hasMore` is exact.
// ---------------------------------------------------------------------------

async function searchJobRows(
  actor: WorkspaceSearchActor,
  query: NormalizedSearchQuery,
  fetchLimit: number,
) {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      department: jobs.department,
      location: jobs.location,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, actor.workspaceId),
        isNull(jobs.deletedAt),
        jobScopeSql(actor),
        or(
          tokensMatch(jobs.title, query),
          lowerLike(jobs.department, query.containsPattern),
          lowerLike(jobs.location, query.containsPattern),
          lowerLike(jobs.sector, query.containsPattern),
        ),
      ),
    )
    .orderBy(
      asc(rankSql(query, [jobs.title], [jobs.title])),
      desc(jobs.createdAt),
      desc(jobs.id),
    )
    .limit(fetchLimit);
}

async function searchCandidateRows(
  actor: WorkspaceSearchActor,
  query: NormalizedSearchQuery,
  fetchLimit: number,
) {
  return db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      headline: candidates.headline,
      avatarUrl: candidates.avatarUrl,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, actor.workspaceId),
        isNull(candidates.deletedAt),
        isNull(candidates.anonymizedAt),
        candidateScopeSql(actor, candidates.id),
        or(
          tokensMatch(candidateFullName, query),
          lowerLike(candidates.email, query.containsPattern),
          lowerLike(candidates.headline, query.containsPattern),
          lowerLike(candidates.location, query.containsPattern),
          lowerLike(candidates.phone, query.containsPattern),
        ),
      ),
    )
    .orderBy(
      asc(rankSql(query, [candidates.email], [candidateFullName, candidates.email])),
      desc(candidates.createdAt),
      desc(candidates.id),
    )
    .limit(fetchLimit);
}

async function searchApplicationRows(
  actor: WorkspaceSearchActor,
  query: NormalizedSearchQuery,
  fetchLimit: number,
) {
  return db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      avatarUrl: candidates.avatarUrl,
      jobTitle: jobs.title,
      stageName: jobStages.name,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, applications.candidateId),
        eq(candidates.workspaceId, actor.workspaceId),
        isNull(candidates.deletedAt),
        isNull(candidates.anonymizedAt),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.id, applications.jobId),
        eq(jobs.workspaceId, actor.workspaceId),
        isNull(jobs.deletedAt),
      ),
    )
    .innerJoin(jobStages, eq(jobStages.id, applications.currentStageId))
    .where(
      and(
        eq(applications.workspaceId, actor.workspaceId),
        jobScopeSql(actor),
        or(
          tokensMatch(candidateFullName, query),
          lowerLike(candidates.email, query.containsPattern),
          tokensMatch(jobs.title, query),
        ),
      ),
    )
    .orderBy(
      asc(
        rankSql(query, [candidates.email], [candidateFullName, jobs.title]),
      ),
      desc(applications.appliedAt),
      desc(applications.id),
    )
    .limit(fetchLimit);
}

async function searchTaskRows(
  actor: WorkspaceSearchActor,
  query: NormalizedSearchQuery,
  fetchLimit: number,
) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, actor.workspaceId),
        isNull(tasks.deletedAt),
        taskScopeSql(actor),
        tokensMatch(tasks.title, query),
      ),
    )
    .orderBy(
      asc(rankSql(query, [tasks.title], [tasks.title])),
      desc(tasks.createdAt),
      desc(tasks.id),
    )
    .limit(fetchLimit);
}

async function searchPeopleRows(
  actor: WorkspaceSearchActor,
  query: NormalizedSearchQuery,
  fetchLimit: number,
) {
  // Members are visible to anyone with members:read, so no scope applies. The
  // email is used for matching only and is never returned.
  return db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      jobTitle: authUsers.jobTitle,
      image: authUsers.image,
    })
    .from(authMembers)
    .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
    .where(
      and(
        eq(authMembers.organizationId, actor.workspaceId),
        eq(authMembers.status, "active"),
        or(
          tokensMatch(authUsers.name, query),
          lowerLike(authUsers.email, query.containsPattern),
        ),
      ),
    )
    .orderBy(
      asc(rankSql(query, [authUsers.email], [authUsers.name, authUsers.email])),
      desc(authMembers.createdAt),
      desc(authMembers.id),
    )
    .limit(fetchLimit);
}

function buildGroup(
  rows: readonly WorkspaceSearchHit[],
  limit: number,
  seeAllHref: string,
): WorkspaceSearchGroup {
  // Rows were fetched with `limit + 1`, so one extra row means more matches.
  return {
    hits: rows.slice(0, limit),
    hasMore: rows.length > limit,
    seeAllHref,
  };
}

/**
 * Run the grouped palette search for an actor. Pure of request state, so the
 * integration tests call it with an explicit actor. Groups the actor lacks
 * permission for are not queried at all.
 */
export async function searchWorkspaceForActor(
  actor: WorkspaceSearchActor,
  rawQuery: string,
  options: { limitPerGroup?: number } = {},
): Promise<WorkspaceSearchResults> {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return emptyWorkspaceSearchResults("");

  const limit = clampSearchLimit(options.limitPerGroup);
  const fetchLimit = limit + 1;
  const want = (group: SearchGroupKey) =>
    actorHasPermission(actor, SEARCH_GROUP_PERMISSION[group]);

  const [jobRows, candidateRows, applicationRows, taskRows, personRows] =
    await Promise.all([
      want("jobs") ? searchJobRows(actor, query, fetchLimit) : undefined,
      want("candidates")
        ? searchCandidateRows(actor, query, fetchLimit)
        : undefined,
      want("applications")
        ? searchApplicationRows(actor, query, fetchLimit)
        : undefined,
      want("tasks") ? searchTaskRows(actor, query, fetchLimit) : undefined,
      want("people") ? searchPeopleRows(actor, query, fetchLimit) : undefined,
    ]);

  const groups: WorkspaceSearchResults["groups"] = {};

  if (jobRows) {
    const hits = jobRows.map<WorkspaceSearchHit>((job) => ({
      group: "jobs",
      id: job.id,
      primary: job.title,
      secondary: joinParts([job.department, job.location]),
      href: `/dashboard/jobs/${job.id}`,
      avatarUrl: null,
      highlight: highlightRanges(job.title, query.tokens),
    }));
    groups.jobs = buildGroup(hits, limit, "/dashboard/jobs");
  }

  if (candidateRows) {
    const hits = candidateRows.map<WorkspaceSearchHit>((candidate) => {
      const name = `${candidate.firstName} ${candidate.lastName}`;
      return {
        group: "candidates",
        id: candidate.id,
        primary: name,
        secondary: candidate.headline ?? candidate.email,
        href: `/dashboard/candidates/${candidate.id}`,
        avatarUrl: candidate.avatarUrl,
        highlight: highlightRanges(name, query.tokens),
      };
    });
    groups.candidates = buildGroup(hits, limit, seeAllCandidates(query));
  }

  if (applicationRows) {
    const hits = applicationRows.map<WorkspaceSearchHit>((row) => {
      const name = `${row.firstName} ${row.lastName}`;
      return {
        group: "applications",
        id: row.applicationId,
        primary: name,
        secondary: joinParts([row.jobTitle, row.stageName]),
        href: `/dashboard/candidates/${row.candidateId}`,
        avatarUrl: row.avatarUrl,
        highlight: highlightRanges(name, query.tokens),
      };
    });
    groups.applications = buildGroup(hits, limit, seeAllCandidates(query));
  }

  if (taskRows) {
    const hits = taskRows.map<WorkspaceSearchHit>((task) => ({
      group: "tasks",
      id: task.id,
      primary: task.title,
      secondary: TASK_STATUS_LABELS[task.status as keyof typeof TASK_STATUS_LABELS] ?? task.status,
      href: "/dashboard/tasks",
      avatarUrl: null,
      highlight: highlightRanges(task.title, query.tokens),
    }));
    groups.tasks = buildGroup(hits, limit, "/dashboard/tasks");
  }

  if (personRows) {
    const hits = personRows.map<WorkspaceSearchHit>((person) => ({
      group: "people",
      id: person.id,
      primary: person.name,
      secondary: person.jobTitle,
      href: "/settings/members",
      avatarUrl: person.image,
      highlight: highlightRanges(person.name, query.tokens),
    }));
    groups.people = buildGroup(hits, limit, "/settings/members");
  }

  return {
    query: query.text,
    groups,
    allResultsHref: want("candidates") ? seeAllCandidates(query) : null,
  };
}
