import "server-only";

import { getCandidateProfile } from "@/features/candidates/data";
import { searchWorkspace } from "@/features/search/data";
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
  const profile = await getCandidateProfile(top.candidate.id);
  if (!profile) return { status: "not_found", query: trimmedQuery };

  return {
    status: "resolved",
    query: trimmedQuery,
    candidate: top.candidate,
    confidence:
      top.score >= 0.99 ? "exact" : top.score >= 0.86 ? "high" : "medium",
    reason: top.reason,
    applications: profile.applications.map((application) => ({
      applicationId: application.id,
      jobId: application.jobId,
      job: application.jobTitle,
      stage: application.currentStageName,
      status: application.status,
      isActive: application.status === "active",
    })),
  };
}
