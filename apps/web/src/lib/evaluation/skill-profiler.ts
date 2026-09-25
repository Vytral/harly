/**
 * Candidate Skill Profiler — Phase 1 of the ATS Evolution Roadmap (Audit doc §8).
 *
 * Derives skill evidence occurrences and per-concept skill profiles from the
 * deterministic parser output. This layer is purely additive: it reads
 * CandidateFactDocument and never mutates raw facts or scoring behavior.
 *
 * Key guarantees:
 * - Every occurrence carries provenance and (when role-scoped) a bounded interval.
 * - Relevant durations are honest: lower bound = union of explicitly bounded
 *   intervals; upper bound includes estimated windows; exact only when every
 *   contributing interval is bounded (§23.6 "No false precision").
 * - Related-but-not-equivalent skills stay distinct.
 */

import type {
  CandidateFactDocument,
  ParsedWorkPosition,
  TextProvenance,
} from "./ats-parser";
import { unionWorkIntervals } from "./ats-parser";
import {
  matchSkillConceptsInText,
  resolveSkillConcept,
  type SkillResolutionResult,
} from "./taxonomy/skill-concepts";
import type {
  RelevantDurationResult,
  SkillEvidenceKind,
  SkillEvidenceOccurrence,
} from "./types";

export interface CandidateSkillProfile {
  conceptId?: string;
  canonicalName: string;
  occurrences: SkillEvidenceOccurrence[];
  evidenceKinds: SkillEvidenceKind[];
  /** Roles in which this skill has at least one occurrence. */
  roleIds: string[];
  /** Criterion-specific relevant duration derived from role-scoped occurrences. */
  relevantDuration: RelevantDurationResult;
  /** True when at least one occurrence belongs to a role current at the reference date. */
  currentlyUsed: boolean;
  /** Months between the most recent evidence interval end and the reference date. */
  lastUsedMonthsAgo?: number;
  /** Most recent evidence date, kept as data even though recency is not scored. */
  lastEvidenceDate?: string;
}

export interface CandidateSkillProfileDocument {
  schemaVersion: 2;
  referenceDate: string;
  occurrences: SkillEvidenceOccurrence[];
  profiles: CandidateSkillProfile[];
  /** Raw declared terms that could not be resolved to any taxonomy concept. */
  unresolvedDeclaredTerms: string[];
}

function toMonthsAbsolute(year: number, month?: number): number {
  return year * 12 + (month ?? 0);
}

/**
 * Detects negated skill mentions such as "no Python", "sin experiencia en Java",
 * "not familiar with React". Conservative: only explicit negation cues in the
 * immediate window before the term count as negation.
 */
function isNegatedMention(
  fragmentText: string,
  canonicalName: string,
  searchTokens: string[],
): boolean {
  const lowered = fragmentText.toLowerCase();
  const terms = [canonicalName, ...searchTokens].map((t) => t.toLowerCase());
  for (const term of terms) {
    const idx = lowered.indexOf(term);
    if (idx < 0) continue;
    const windowBefore = lowered.slice(Math.max(0, idx - 30), idx);
    if (
      /\b(no|not|never|without|sin|sin\s+experiencia\s+en|nunca|except|excluding|lack(?:ing)?)\b/.test(
        windowBefore,
      )
    ) {
      return true;
    }
  }
  return false;
}

function roleInterval(
  role: ParsedWorkPosition,
  referenceMonthsAbsolute: number,
): SkillEvidenceOccurrence["interval"] | undefined {
  if (role.startYear && role.endYear && role.endYear >= role.startYear) {
    return {
      startYear: role.startYear,
      startMonth: role.startMonth,
      endYear: role.endYear,
      endMonth: role.endMonth,
      isCurrent: role.isCurrent,
      bounded: true,
    };
  }
  if (role.isCurrent && role.durationMonths && role.durationMonths > 0) {
    // Unbounded placement: approximate window ending at the reference date.
    const endAbs = referenceMonthsAbsolute;
    const startAbs = endAbs - role.durationMonths;
    return {
      startYear: Math.floor(startAbs / 12),
      startMonth: startAbs % 12,
      endYear: Math.floor(endAbs / 12),
      endMonth: endAbs % 12,
      isCurrent: true,
      bounded: false,
    };
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract an explicit skill-tenure claim without treating a role's whole
 * lifespan as exact skill tenure. */
function explicitDurationMonths(
  text: string,
  canonicalName: string,
  searchTokens: string[],
): number | undefined {
  const tokens = [canonicalName, ...searchTokens]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const escaped = escapeRegExp(token);
    const before = new RegExp(
      `(\\d{1,2})\\s*\\+?\\s*(?:years?|yrs?|años?|año)\\s*(?:of\\s+)?(?:experience\\s+(?:in|with)\\s+)?${escaped}`,
      "i",
    );
    const after = new RegExp(
      `${escaped}[^\\n]{0,24}?(?:for|during|por|durante)\\s+(\\d{1,2})\\s*(?:years?|yrs?|años?|año)`,
      "i",
    );
    const match = text.match(before) ?? text.match(after);
    if (!match) continue;
    const years = Number(match[1]);
    if (Number.isFinite(years) && years > 0) return years * 12;
  }
  return undefined;
}

function intervalUnionMonths(
  intervals: Array<{ start: number; end: number }>,
): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0]!.start;
  let curEnd = sorted[0]!.end;
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.start <= curEnd) {
      curEnd = Math.max(curEnd, next.end);
    } else {
      total += curEnd - curStart;
      curStart = next.start;
      curEnd = next.end;
    }
  }
  total += curEnd - curStart;
  return total;
}

function evidenceEndDate(
  interval: NonNullable<SkillEvidenceOccurrence["interval"]>,
  referenceDate: string,
): string {
  if (interval.isCurrent) return referenceDate;
  if (interval.endMonth) {
    return `${interval.endYear}-${String(interval.endMonth).padStart(2, "0")}-01`;
  }
  return `${interval.endYear}-12-31`;
}

/**
 * Computes honest relevant duration from occurrences.
 * - exactMonths: only an explicit duration claim is exact.
 * - lowerBoundMonths: role mentions alone do not prove continuous usage, so
 *   their provable lower bound is zero.
 * - upperBoundMonths: non-overlapping union of the possible role windows.
 */
export function computeRelevantDuration(
  occurrences: SkillEvidenceOccurrence[],
  referenceDate: string,
): RelevantDurationResult {
  const refAbs = toMonthsAbsolute(
    Number(referenceDate.slice(0, 4)),
    Number(referenceDate.slice(5, 7)),
  );

  const scoped = occurrences.filter((o) => o.interval);
  const sourceRoleIds = [
    ...new Set(scoped.map((o) => o.roleId).filter(Boolean)),
  ] as string[];

  const explicit = occurrences
    .map((occurrence) => occurrence.explicitDurationMonths)
    .filter((months): months is number => typeof months === "number" && Number.isFinite(months) && months > 0);

  if (explicit.length > 0) {
    const months = Math.max(...explicit);
    const lastEndAbs = scoped.length > 0
      ? Math.max(
          ...scoped.map((occurrence) =>
            toMonthsAbsolute(occurrence.interval!.endYear, occurrence.interval!.endMonth),
          ),
        )
      : null;
    const isCurrentEvidence = scoped.some((occurrence) => occurrence.interval!.isCurrent);
    const lastEvidenceDate = scoped.length > 0
      ? evidenceEndDate(
          scoped.reduce((latest, occurrence) =>
            toMonthsAbsolute(occurrence.interval!.endYear, occurrence.interval!.endMonth) >
              toMonthsAbsolute(latest.interval!.endYear, latest.interval!.endMonth)
              ? occurrence
              : latest,
          scoped[0]!).interval!,
          referenceDate,
        )
      : undefined;
    return {
      lowerBoundMonths: months,
      upperBoundMonths: months,
      exactMonths: months,
      isCurrentEvidence,
      lastEvidenceDate,
      lastUsedMonthsAgo: isCurrentEvidence || lastEndAbs === null
        ? undefined
        : Math.max(0, refAbs - lastEndAbs),
      sourceRoleIds,
      method: "explicit_duration_text",
    };
  }

  if (scoped.length === 0) {
    return {
      lowerBoundMonths: 0,
      upperBoundMonths: null,
      exactMonths: null,
      isCurrentEvidence: false,
      sourceRoleIds,
      method: "none",
    };
  }

  const hasUnbounded = scoped.some((o) => !o.interval!.bounded);
  const upperBoundMonths = intervalUnionMonths(
    scoped.map((o) => ({
      start: toMonthsAbsolute(o.interval!.startYear, o.interval!.startMonth),
      end: toMonthsAbsolute(o.interval!.endYear, o.interval!.endMonth),
    })),
  );

  const lastEndAbs = Math.max(
    ...scoped.map((o) => toMonthsAbsolute(o.interval!.endYear, o.interval!.endMonth)),
  );
  const isCurrentEvidence = scoped.some((o) => o.interval!.isCurrent);
  const lastEvidenceOccurrence = scoped.reduce((latest, occurrence) =>
    toMonthsAbsolute(occurrence.interval!.endYear, occurrence.interval!.endMonth) >
      toMonthsAbsolute(latest.interval!.endYear, latest.interval!.endMonth)
      ? occurrence
      : latest,
  scoped[0]!);

  return {
    lowerBoundMonths: 0,
    upperBoundMonths,
    exactMonths: null,
    isCurrentEvidence,
    lastEvidenceDate: evidenceEndDate(lastEvidenceOccurrence.interval!, referenceDate),
    lastUsedMonthsAgo: isCurrentEvidence ? 0 : Math.max(0, refAbs - lastEndAbs),
    sourceRoleIds,
    method: hasUnbounded ? "unbounded_estimate" : "bounded_interval_union",
  };
}

/**
 * Derives the skill evidence occurrence stream from parsed candidate facts.
 */
export function extractSkillEvidenceOccurrences(
  facts: CandidateFactDocument,
  options?: {
    answers?: Array<{ question: string; answer: string }>;
    profileSkills?: string[];
    recruiterAliases?: string[];
  },
): SkillEvidenceOccurrence[] {
  const occurrences: SkillEvidenceOccurrence[] = [];
  const refAbs = toMonthsAbsolute(
    Number(facts.referenceDate.slice(0, 4)),
    Number(facts.referenceDate.slice(5, 7)),
  );

  const toNormalization = (
    resolved: SkillResolutionResult,
  ): SkillEvidenceOccurrence["normalizationMethod"] =>
    resolved.method === "deterministic_exact" ? "exact" : resolved.method;

  // 1. Declared skills (Skills section) — LinkedIn-style explicit skills.
  // Exact labels resolve via resolveSkillConcept so short canonical names like
  // "Go" / "R" are kept when the candidate deliberately listed them. Free-text
  // scanners still use matchSkillConceptsInText (short-token guard intact).
  for (const skill of facts.declaredSkills) {
    const exact = resolveSkillConcept(skill.name, options?.recruiterAliases);
    const resolvedList = exact.conceptId
      ? [exact]
      : matchSkillConceptsInText(skill.name, options?.recruiterAliases);
    for (const resolved of resolvedList) {
      if (!resolved.conceptId) continue;
      occurrences.push({
        rawTerm: skill.name,
        conceptId: resolved.conceptId,
        canonicalName: resolved.canonicalName,
        normalizationMethod: toNormalization(resolved),
        evidenceKind: "declared",
        explicitDurationMonths: explicitDurationMonths(
          skill.name,
          resolved.canonicalName,
          resolved.searchTokens,
        ),
        provenance: skill.provenance,
      });
    }
  }

  // 2. Demonstrated skills in work roles (achievements and titles).
  // Negated mentions ("no Python", "sin experiencia en Java") must not count
  // as positive evidence — §27 adversarial / evidence-strength requirement.
  for (const role of facts.workHistory) {
    const interval = roleInterval(role, refAbs);
    const fragments: Array<{ text: string; provenance: TextProvenance }> = [
      { text: role.title, provenance: role.provenance },
      ...role.achievements.map((a) => ({ text: a.text, provenance: a.provenance })),
    ];
    const seenInRole = new Set<string>();
    for (const fragment of fragments) {
      const matched = matchSkillConceptsInText(fragment.text, options?.recruiterAliases);
      for (const resolved of matched) {
        if (!resolved.conceptId) continue;
        if (isNegatedMention(fragment.text, resolved.canonicalName, resolved.searchTokens)) {
          continue;
        }
        const dedupeKey = `${resolved.conceptId}:${fragment.text}`;
        if (seenInRole.has(dedupeKey)) continue;
        seenInRole.add(dedupeKey);
        occurrences.push({
          rawTerm: fragment.text,
          conceptId: resolved.conceptId,
          canonicalName: resolved.canonicalName,
          normalizationMethod: toNormalization(resolved),
          evidenceKind: "demonstrated_role",
          roleId: role.id,
          interval,
          explicitDurationMonths: explicitDurationMonths(
            fragment.text,
            resolved.canonicalName,
            resolved.searchTokens,
          ),
          provenance: fragment.provenance,
        });
      }
    }
  }

  // 3. Credentialed skills (certifications).
  for (const cert of facts.certifications) {
    for (const resolved of matchSkillConceptsInText(cert.name, options?.recruiterAliases)) {
      occurrences.push({
        rawTerm: cert.name,
        conceptId: resolved.conceptId,
        canonicalName: resolved.canonicalName,
        normalizationMethod: toNormalization(resolved),
        evidenceKind: "credentialed",
        explicitDurationMonths: explicitDurationMonths(
          cert.name,
          resolved.canonicalName,
          resolved.searchTokens,
        ),
        provenance: cert.provenance,
      });
    }
  }

  // 4. Application answers.
  for (const qa of options?.answers ?? []) {
    const provenance: TextProvenance = { sourceType: "application_qa", rawText: qa.answer };
    for (const resolved of matchSkillConceptsInText(qa.answer, options?.recruiterAliases)) {
      occurrences.push({
        rawTerm: qa.answer,
        conceptId: resolved.conceptId,
        canonicalName: resolved.canonicalName,
        normalizationMethod: toNormalization(resolved),
        evidenceKind: "application_answer",
        explicitDurationMonths: explicitDurationMonths(
          qa.answer,
          resolved.canonicalName,
          resolved.searchTokens,
        ),
        provenance,
      });
    }
  }

  // 5. Candidate profile skills.
  for (const name of options?.profileSkills ?? []) {
    const resolved = resolveSkillConcept(name, options?.recruiterAliases);
    const provenance: TextProvenance = { sourceType: "candidate_profile", rawText: name };
    occurrences.push({
      rawTerm: name,
      conceptId: resolved.conceptId,
      canonicalName: resolved.canonicalName,
      normalizationMethod: resolved.conceptId ? toNormalization(resolved) : "unresolved",
      evidenceKind: "declared",
      explicitDurationMonths: resolved.conceptId
        ? explicitDurationMonths(name, resolved.canonicalName, resolved.searchTokens)
        : undefined,
      provenance,
    });
  }

  return occurrences;
}

/**
 * Aggregates occurrences into one profile per resolved concept.
 * Ordinary declared/credentialed occurrences never fabricate tenure; explicit
 * duration claims are the one source of duration evidence that may exist
 * outside a role interval.
 */
export function buildCandidateSkillProfiles(
  facts: CandidateFactDocument,
  options?: {
    answers?: Array<{ question: string; answer: string }>;
    profileSkills?: string[];
    recruiterAliases?: string[];
  },
): CandidateSkillProfileDocument {
  const occurrences = extractSkillEvidenceOccurrences(facts, options);

  const byConcept = new Map<string, SkillEvidenceOccurrence[]>();
  for (const occ of occurrences) {
    if (!occ.conceptId) continue;
    const list = byConcept.get(occ.conceptId) ?? [];
    list.push(occ);
    byConcept.set(occ.conceptId, list);
  }

  const profiles: CandidateSkillProfile[] = [...byConcept.entries()].map(
    ([conceptId, list]) => {
      // Keep non-role occurrences here as well: an explicit claim such as
      // "5 years of Python" may live in the summary/skills section and is
      // valid duration evidence even without a role interval. Ordinary
      // declarations still contribute zero duration inside the calculator.
      const relevantDuration = computeRelevantDuration(list, facts.referenceDate);
      return {
        conceptId,
        canonicalName: list[0]!.canonicalName ?? conceptId,
        occurrences: list,
        evidenceKinds: [...new Set(list.map((o) => o.evidenceKind))],
        roleIds: relevantDuration.sourceRoleIds,
        relevantDuration,
        currentlyUsed: relevantDuration.isCurrentEvidence,
        lastUsedMonthsAgo: relevantDuration.lastUsedMonthsAgo,
        lastEvidenceDate: relevantDuration.lastEvidenceDate,
      };
    },
  );

  const unresolvedDeclaredTerms = facts.declaredSkills
    .filter((s) => matchSkillConceptsInText(s.name, options?.recruiterAliases).length === 0)
    .map((s) => s.name);

  return {
    schemaVersion: 2,
    referenceDate: facts.referenceDate,
    occurrences,
    profiles,
    unresolvedDeclaredTerms,
  };
}

/**
 * Looks up the relevant duration evidence for a specific target concept,
 * keeping related-but-not-equivalent concepts strictly separate.
 */
export function relevantDurationForConcept(
  document: CandidateSkillProfileDocument,
  conceptId: string,
): RelevantDurationResult | null {
  const profile = document.profiles.find((p) => p.conceptId === conceptId);
  return profile?.relevantDuration ?? null;
}

// Re-export for matcher convenience without circular imports.
export { unionWorkIntervals };
