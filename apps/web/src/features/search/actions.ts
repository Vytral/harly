"use server";

import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { candidates, db, jobs } from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";

export type SearchResults = {
  jobs: { id: string; title: string; slug: string }[];
  candidates: { id: string; name: string; email: string }[];
};

/** Workspace-scoped quick search over jobs and candidates for the ⌘K palette. */
export async function searchWorkspaceAction(
  rawQuery: string,
): Promise<SearchResults> {
  const query = rawQuery.trim();
  if (query.length < 1) {
    return { jobs: [], candidates: [] };
  }

  const { organization: workspace } = await getWorkspaceContext();
  const like = `%${query}%`;

  const [jobRows, candidateRows] = await Promise.all([
    db
      .select({ id: jobs.id, title: jobs.title, slug: jobs.slug })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspace.id),
          isNull(jobs.deletedAt),
          ilike(jobs.title, like),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(5),
    db
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
      })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, workspace.id),
          or(
            ilike(candidates.firstName, like),
            ilike(candidates.lastName, like),
            ilike(candidates.email, like),
          ),
        ),
      )
      .orderBy(desc(candidates.createdAt))
      .limit(5),
  ]);

  return {
    jobs: jobRows,
    candidates: candidateRows.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
    })),
  };
}
