import "server-only";

import { and, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";

import { candidates, db } from "@harly/db";

import { detectDuplicatesWithAI } from "@/lib/ai/surfaces/detect-duplicates";
import type { AiModelConfig } from "@/lib/ai/providers";

export type DuplicateMatch = {
  candidateId: string;
  confidence: "high" | "medium";
  reason: string;
  fullName: string;
  email: string;
};

/**
 * Session-free duplicate detector shared by the manual action and application
 * intake automation. Database candidates are always workspace-scoped and model
 * IDs are checked against the suspect set before anything is returned.
 */
export async function detectCandidateDuplicatesForWorkspace(input: {
  workspaceId: string;
  candidateId: string;
  config: AiModelConfig;
}): Promise<DuplicateMatch[]> {
  const [target] = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      headline: candidates.headline,
      skills: candidates.skills,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        eq(candidates.id, input.candidateId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);

  if (!target) return [];

  const suspects = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      headline: candidates.headline,
      skills: candidates.skills,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, input.workspaceId),
        ne(candidates.id, input.candidateId),
        isNull(candidates.deletedAt),
        or(
          ilike(candidates.firstName, `%${target.firstName}%`),
          ilike(candidates.lastName, `%${target.lastName}%`),
          sql`lower(${candidates.email}) = lower(${target.email})`,
        ),
      ),
    )
    .limit(10);

  if (suspects.length === 0) return [];

  const result = await detectDuplicatesWithAI(input.config, {
    target: {
      candidateId: target.id,
      fullName: `${target.firstName} ${target.lastName}`,
      email: target.email,
      headline: target.headline,
      skills: Array.isArray(target.skills) ? (target.skills as string[]) : [],
    },
    suspects: suspects.map((suspect) => ({
      candidateId: suspect.id,
      fullName: `${suspect.firstName} ${suspect.lastName}`,
      email: suspect.email,
      headline: suspect.headline,
      skills: Array.isArray(suspect.skills) ? (suspect.skills as string[]) : [],
    })),
  });

  const suspectsById = new Map(
    suspects.map((suspect) => [suspect.id, suspect]),
  );
  return result.matches.flatMap((match) => {
    const suspect = suspectsById.get(match.candidateId);
    if (!suspect) return [];
    return [
      {
        candidateId: suspect.id,
        confidence: match.confidence,
        reason: match.reason,
        fullName: `${suspect.firstName} ${suspect.lastName}`,
        email: suspect.email,
      },
    ];
  });
}
