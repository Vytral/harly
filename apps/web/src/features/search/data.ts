import "server-only";

import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { candidates, db, jobs } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

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
 * Workspace-scoped quick search over jobs and candidates for the Spotlight
 * palette. Team members are intentionally excluded for now.
 */
export async function searchWorkspace(query: string): Promise<SearchResults> {
  const { organization: workspace } = await getWorkspaceContext();
  const like = `%${query}%`;
  const nameTokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
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

  const [jobRows, candidateRows] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        slug: jobs.slug,
        department: jobs.department,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspace.id),
          isNull(jobs.deletedAt),
          or(
            ilike(jobs.title, like),
            ilike(jobs.department, like),
            ilike(jobs.location, like),
            ilike(jobs.sector, like),
          ),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(6),
    db
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
          eq(candidates.workspaceId, workspace.id),
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
        ),
      )
      .orderBy(desc(candidates.createdAt))
      .limit(6),
  ]);

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
