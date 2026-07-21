import "server-only";

import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { db, jobs } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  rankJobMatches,
  type JobMatch,
  type JobSearchItem,
} from "./job-resolution-matching";

export { normalizeJobReference, rankJobMatches } from "./job-resolution-matching";

export type JobResolution =
  | {
      status: "resolved";
      query: string;
      job: JobSearchItem;
      confidence: "exact" | "high" | "medium";
      reason: JobMatch["reason"];
    }
  | {
      status: "ambiguous";
      query: string;
      alternatives: JobSearchItem[];
    }
  | {
      status: "not_found";
      query: string;
    };

function shouldResolveTopMatch(matches: JobMatch[]): boolean {
  const [top, second] = matches;
  if (!top) return false;
  if (top.reason === "exact_title" || top.reason === "slug") {
    return !second || second.score < top.score;
  }
  if (!second) return top.score >= 0.6;
  return top.score >= 0.84 && top.score - second.score >= 0.08;
}

async function searchJobs(query: string): Promise<JobSearchItem[]> {
  const { organization: workspace } = await getWorkspaceContext();
  const like = `%${query}%`;
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      slug: jobs.slug,
      department: jobs.department,
      location: jobs.location,
      status: jobs.status,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, workspace.id),
        isNull(jobs.deletedAt),
        or(
          ilike(jobs.title, like),
          ilike(jobs.slug, like),
          ilike(jobs.department, like),
          ilike(jobs.location, like),
          ilike(jobs.sector, like),
        ),
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(50);
}

/** Resolve a named role from the complete workspace job set, not the UI's short search window. */
export async function resolveJobReference(query: string): Promise<JobResolution> {
  const trimmedQuery = query.trim().slice(0, 120);
  if (!trimmedQuery) return { status: "not_found", query: trimmedQuery };

  const matches = rankJobMatches(trimmedQuery, await searchJobs(trimmedQuery));
  if (!matches.length) return { status: "not_found", query: trimmedQuery };

  if (!shouldResolveTopMatch(matches)) {
    return {
      status: "ambiguous",
      query: trimmedQuery,
      alternatives: matches.slice(0, 5).map((match) => match.job),
    };
  }

  const top = matches[0];
  return {
    status: "resolved",
    query: trimmedQuery,
    job: top.job,
    confidence: top.score >= 0.98 ? "exact" : top.score >= 0.84 ? "high" : "medium",
    reason: top.reason,
  };
}
