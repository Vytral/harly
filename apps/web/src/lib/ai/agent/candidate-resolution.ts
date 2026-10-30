import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { candidates, db, jobs } from "@harly/db";

import { getCandidateProfile } from "@/features/candidates/data";
import { searchWorkspace } from "@/features/search/data";
import {
  actorHasPermission,
  candidateScopeSql,
  isUnrestrictedScope,
  jobScopeSql,
  type WorkspaceSearchActor,
} from "@/features/search/scope";
import { resolveSearchActor } from "@/features/search/workspace-search";
import {
  rankCandidateMatches,
  type CandidateMatch,
  type CandidateSearchItem,
} from "./candidate-resolution-matching";

type SearchCandidate = CandidateSearchItem;

export { normalizeCandidateReference, rankCandidateMatches } from "./candidate-resolution-matching";

export type CandidateResolution =
  | {
      status: "resolved";
      query: string;
      candidate: SearchCandidate;
      confidence: "exact" | "high" | "medium";
      reason: CandidateMatch["reason"];
      applications: Array<{
        applicationId: string;
        jobId: string;
        job: string;
        stage: string | null;
        status: string;
        isActive: boolean;
      }>;
    }
  | {
      status: "ambiguous";
      query: string;
      alternatives: SearchCandidate[];
    }
  | {
      status: "not_found";
      query: string;
    };

function shouldResolveTopMatch(matches: CandidateMatch[]): boolean {
  const [top, second] = matches;
  if (!top) return false;
  if (top.reason === "email" && top.score >= 1) return true;
  if (
    top.reason === "exact_name" &&
    second?.reason === "exact_name" &&
    second.score >= 0.99
  ) {
    return false;
  }
  if (top.score >= 0.99) return true;
  if (!second) return top.score >= 0.62;
  return top.score >= 0.86 && top.score - second.score >= 0.08;
}

/** Whether the actor may see the candidate: candidates:view plus role scope. */
async function candidateIsVisible(
  actor: WorkspaceSearchActor,
  candidateId: string,
): Promise<boolean> {
  if (!actorHasPermission(actor, "candidates:view")) return false;
  const [row] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, actor.workspaceId),
        isNull(candidates.deletedAt),
        candidateScopeSql(actor, candidates.id),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Keeps only the applications whose job lies inside the actor's scope. */
async function applicationsVisibleTo<T extends { jobId: string }>(
  actor: WorkspaceSearchActor,
  applications: readonly T[],
): Promise<T[]> {
  if (isUnrestrictedScope(actor.scope)) return [...applications];
  const jobIds = [...new Set(applications.map((application) => application.jobId))];
  if (jobIds.length === 0) return [];
  const visibleRows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, actor.workspaceId),
        inArray(jobs.id, jobIds),
        isNull(jobs.deletedAt),
        jobScopeSql(actor),
      ),
    );
  const visible = new Set(visibleRows.map((row) => row.id));
  return applications.filter((application) => visible.has(application.jobId));
}

/**
 * Resolve a human candidate reference into a workspace-scoped candidate.
 * The search adapter provides candidates; this module owns ranking,
 * ambiguity semantics, and the compact result consumed by the agent.
 */
export async function resolveCandidateReference(
  query: string,
): Promise<CandidateResolution> {
  const trimmedQuery = query.trim().slice(0, 100);
  if (!trimmedQuery) return { status: "not_found", query: trimmedQuery };

  const results = await searchWorkspace(trimmedQuery);
  const matches = rankCandidateMatches(trimmedQuery, results.candidates);

  if (!matches.length) {
    return { status: "not_found", query: trimmedQuery };
  }

  if (!shouldResolveTopMatch(matches)) {
    return {
      status: "ambiguous",
      query: trimmedQuery,
      alternatives: matches.slice(0, 5).map((match) => match.candidate),
    };
  }

  const top = matches[0];
  // The resolved candidate must be inside the caller's scope, and only
  // applications on in-scope jobs are returned. A caller who cannot see the
  // candidate gets the same "not found" answer as for an unknown name.
  const actor = await resolveSearchActor();
  if (!(await candidateIsVisible(actor, top.candidate.id))) {
    return { status: "not_found", query: trimmedQuery };
  }
  const profile = await getCandidateProfile(top.candidate.id);
  if (!profile) return { status: "not_found", query: trimmedQuery };
  const visibleApplications = await applicationsVisibleTo(
    actor,
    profile.applications,
  );

  return {
    status: "resolved",
    query: trimmedQuery,
    candidate: top.candidate,
    confidence:
      top.score >= 0.99 ? "exact" : top.score >= 0.86 ? "high" : "medium",
    reason: top.reason,
    applications: visibleApplications.map((application) => ({
      applicationId: application.id,
      jobId: application.jobId,
      job: application.jobTitle,
      stage: application.currentStageName,
      status: application.status,
      isActive: application.status === "active",
    })),
  };
}
