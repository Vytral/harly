import "server-only";

import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { candidates, db, jobs } from "@harly/db";

import { actorHasPermission, candidateScopeSql, jobScopeSql } from "./scope";
import { resolveSearchActor } from "./workspace-search";
import { escapeLikePattern } from "./patterns";

export type SearchResults = {
  jobs: { id: string; title: string; slug: string; department: string | null }[];
  candidates: {
    id: string;
    name: string;
    email: string;
    headline: string | null;
    avatarUrl: string | null;
  }[];
};

export const emptySearchResults: SearchResults = { jobs: [], candidates: [] };

/**
 * Which halves of the quick search the caller may see: jobs need `jobs:view`,
 * candidates need `candidates:view`. Shared by every caller that resolves the
 * legacy search (Spotlight, @mentions, Harly AI), so the rule lives in one place.
 */
export async function workspaceSearchAccess(): Promise<{
  jobs: boolean;
  candidates: boolean;
}> {
  const actor = await resolveSearchActor();
  return {
    jobs: actorHasPermission(actor, "jobs:view"),
    candidates: actorHasPermission(actor, "candidates:view"),
  };
}

/**
 * Workspace-scoped quick search over jobs and candidates for the Spotlight
 * palette, @mentions and Harly AI. Team members are intentionally excluded.
 *
 * Enforces permission and role scope itself: a caller without `jobs:view` gets
 * no jobs, one without `candidates:view` gets no candidates, and a scoped caller
 * only sees records inside their scope (the same predicates as the scoped search).
 */
export async function searchWorkspace(query: string): Promise<SearchResults> {
  const actor = await resolveSearchActor();
  const access = {
    jobs: actorHasPermission(actor, "jobs:view"),
    candidates: actorHasPermission(actor, "candidates:view"),
  };
  const normalizedQuery = query.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!normalizedQuery || (!access.jobs && !access.candidates)) {
    return emptySearchResults;
  }
  const like = `%${escapeLikePattern(normalizedQuery)}%`;
  const nameTokens = normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map(escapeLikePattern);
  const tokenNameMatch =
    nameTokens.length > 1
      ? and(
          ...nameTokens.map((token) => {
            const tokenLike = `%${token}%`;
            return or(
              ilike(candidates.firstName, tokenLike),
              ilike(candidates.lastName, tokenLike),
            );
          }),
        )
      : undefined;

  const jobRows = access.jobs
    ? await db
        .select({
          id: jobs.id,
          title: jobs.title,
          slug: jobs.slug,
          department: jobs.department,
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.workspaceId, actor.workspaceId),
            isNull(jobs.deletedAt),
            or(
              ilike(jobs.title, like),
              ilike(jobs.department, like),
              ilike(jobs.location, like),
              ilike(jobs.sector, like),
            ),
            jobScopeSql(actor),
          ),
        )
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .limit(6)
    : [];
  const candidateRows = access.candidates
    ? await db
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
            or(
              ilike(candidates.firstName, like),
              ilike(candidates.lastName, like),
              tokenNameMatch,
              ilike(candidates.email, like),
              ilike(candidates.phone, like),
              ilike(candidates.headline, like),
              ilike(candidates.location, like),
            ),
            candidateScopeSql(actor, candidates.id),
          ),
        )
        .orderBy(desc(candidates.createdAt), desc(candidates.id))
        .limit(6)
    : [];

  return {
    jobs: jobRows,
    candidates: candidateRows.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      headline: c.headline,
      avatarUrl: c.avatarUrl,
    })),
  };
}
