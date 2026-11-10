import "server-only";

import { type AnyColumn, and, eq, isNull, ne, or, sql } from "drizzle-orm";

import { candidates, db } from "@harly/db";

import { detectDuplicatesWithAI } from "@/lib/ai/surfaces/detect-duplicates";
import type { AiModelConfig } from "@/lib/ai/providers";
import {
  ACCENT_FROM,
  ACCENT_TO,
  containsPattern,
  describeSignals,
  type DuplicateSignal,
  foldName,
  normalizeLinkedinUrl,
  phoneKey,
  sharedIdentitySignals,
} from "@/features/candidates/duplicate-signals";

export type DuplicateMatch = {
  candidateId: string;
  confidence: "high" | "medium";
  reason: string;
  /** Deterministic signals behind a high-confidence match; the UI renders them in the viewer's language. */
  signals?: DuplicateSignal[];
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
      phone: candidates.phone,
      linkedinUrl: candidates.linkedinUrl,
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

  // Accent-insensitive name match without needing the `unaccent` extension.
  const foldedColumn = (column: AnyColumn) =>
    sql`translate(lower(${column}), ${ACCENT_FROM}, ${ACCENT_TO})`;
  const nameClauses = [
    { column: candidates.firstName, value: foldName(target.firstName) },
    { column: candidates.lastName, value: foldName(target.lastName) },
  ]
    // An empty value would turn into `%%` and match everyone.
    .filter((clause) => clause.value.length > 0)
    .map(
      (clause) =>
        sql`${foldedColumn(clause.column)} like ${containsPattern(clause.value)} escape '\\'`,
    );

  const targetPhoneKey = phoneKey(target.phone);
  const targetLinkedin = normalizeLinkedinUrl(target.linkedinUrl);

  const suspects = await db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
      linkedinUrl: candidates.linkedinUrl,
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
          ...nameClauses,
          sql`lower(${candidates.email}) = lower(${target.email})`,
          targetPhoneKey
            ? sql`right(regexp_replace(coalesce(${candidates.phone}, ''), '\\D', '', 'g'), 9) = ${targetPhoneKey}`
            : undefined,
          targetLinkedin
            ? sql`lower(substring(${candidates.linkedinUrl} from 'linkedin\\.com/(?:in|pub)/([^/?#[:space:]]+)')) = ${targetLinkedin}`
            : undefined,
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
  const aiMatches = result.matches.flatMap((match) => {
    const suspect = suspectsById.get(match.candidateId);
    if (!suspect) return [];
    return [
      {
        candidateId: suspect.id,
        confidence: match.confidence,
        reason: match.reason,
        fullName: `${suspect.firstName} ${suspect.lastName}`,
        email: suspect.email,
      } satisfies DuplicateMatch,
    ];
  });

  // Deterministic identity signals (email / normalized phone / LinkedIn slug)
  // are stronger than the model's opinion: surface them as high confidence,
  // and keep the model's match only when it adds a record we have no signal for.
  const signalMatches: DuplicateMatch[] = suspects.flatMap((suspect) => {
    const signals = sharedIdentitySignals(target, suspect);
    if (signals.length === 0) return [];
    return [
      {
        candidateId: suspect.id,
        confidence: "high" as const,
        reason: `Shared identity: ${describeSignals(signals)}.`,
        signals,
        fullName: `${suspect.firstName} ${suspect.lastName}`,
        email: suspect.email,
      },
    ];
  });
  const signalIds = new Set(signalMatches.map((match) => match.candidateId));
  return [...signalMatches, ...aiMatches.filter((match) => !signalIds.has(match.candidateId))];
}
