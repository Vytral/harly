import {
  type CandidateFactDocument,
  type TextProvenance,
  unionWorkIntervals,
} from "./ats-parser";
import type { StructuredCriterion } from "./criteria-builder";
import { buildCandidateSkillProfiles } from "./skill-profiler";
import {
  applySemanticThresholds,
  resolveSemanticThresholds,
  type SemanticAssistResult,
  type SemanticAssistThresholds,
} from "./matching/semantic-assist";
import {
  isRelatedOccupationNotEquivalent,
  isSameOccupationFamily,
  normalizeJobTitle,
} from "./taxonomy/occupation-concepts";
import {
  isRelatedButNotEquivalent,
  relatedSkillLabels,
} from "./taxonomy/skill-concepts";
import type {
  CriterionEvidenceFragment,
  CriterionStatus,
  MatchMethod,
  StructuredCriterionResult,
} from "./types";

function escapeRegExp(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function supportingEvidenceForRoles(
  matches: Array<{ role: { company: string; title: string }; snippet: string; provenance: TextProvenance; method: MatchMethod }>,
): CriterionEvidenceFragment[] {
  return matches.map((match, index) => ({
    id: `role-evidence:${index + 1}`,
    verbatimSnippet: `${match.role.company} (${match.role.title}): "${match.snippet}"`,
    strength: "demonstrated",
    method: match.method,
    confidence: 95,
    provenance: match.provenance,
  }));
}

/** Version of the deterministic criterion matcher (Audit doc §5.1). Bump on matching-behavior changes. */
export const CRITERION_MATCHER_VERSION = "matcher-v3";

/** Check if text includes a skill/keyword token honoring word boundaries and tech symbols (+, #) */
function textMatchesToken(text: string, token: string): boolean {
  const cleanToken = token.trim();
  if (!cleanToken) return false;
  // Match with word boundaries, taking care of trailing punctuation
  const pattern = new RegExp(
    `(?<![a-z0-9+#])${escapeRegExp(cleanToken)}(?![a-z0-9+#])`,
    "i",
  );
  return pattern.test(text);
}

/**
 * Conservative negation detector (§20.2 adversarial / §27).
 * A token occurrence preceded by an explicit negation cue in its immediate
 * window ("no Java development", "sin experiencia en X") must NOT be treated
 * as positive evidence.
 */
function isNegatedOccurrence(text: string, token: string): boolean {
  const cleanToken = token.trim();
  if (!cleanToken) return false;
  const pattern = new RegExp(
    `(?<![a-z0-9+#])${escapeRegExp(cleanToken)}(?![a-z0-9+#])`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    if (/\b(no|not|never|without|nunca|except|excluding|lacking|lack)\b/.test(before)) {
      return true;
    }
    if (/\bsin\b/.test(before)) return true;
  }
  return false;
}

/**
 * Finds a real source fragment evidencing a semantic-assist concept.
 * A provider claim with no verifiable fragment is not evidence (§2.1) —
 * callers must fall through to `not_demonstrated` when this returns null.
 */
function findFragmentForConcept(
  concept: string,
  facts: CandidateFactDocument,
  additionalContext?: {
    answers?: Array<{ question: string; answer: string }>;
    profileSkills?: string[];
  },
): { snippet: string; provenance: TextProvenance } | null {
  for (const role of facts.workHistory) {
    if (textMatchesToken(role.title, concept)) {
      return { snippet: `Held role: ${role.title}`, provenance: role.provenance };
    }
    for (const ach of role.achievements) {
      if (textMatchesToken(ach.text, concept) && !isNegatedOccurrence(ach.text, concept)) {
        return { snippet: ach.text, provenance: ach.provenance };
      }
    }
  }
  for (const skill of facts.declaredSkills) {
    if (textMatchesToken(skill.name, concept)) {
      return { snippet: `Declared in Skills section: "${skill.name}"`, provenance: skill.provenance };
    }
  }
  const profileHit = additionalContext?.profileSkills?.find((term) => textMatchesToken(term, concept));
  if (profileHit) {
    return {
      snippet: `Candidate profile skill: "${profileHit}"`,
      provenance: { sourceType: "candidate_profile", rawText: profileHit },
    };
  }
  if (additionalContext?.answers) {
    for (const qa of additionalContext.answers) {
      if (textMatchesToken(qa.answer, concept)) {
        return {
          snippet: `Application response to "${qa.question}": "${qa.answer}"`,
          provenance: { sourceType: "application_qa", rawText: qa.answer },
        };
      }
    }
  }
  return null;
}

/**
 * Builds a criterion result from an engine-thresholded semantic resolution.
 * Knockout gates demand certainty: only a semantic `met` passes; a semantic
 * `partially_met` on a knockout fails the gate (uncertain identity must not
 * satisfy a hard constraint) and always escalates to human review downstream.
 */
function buildSemanticAssistResult(
  criterion: StructuredCriterion,
  resolution: SemanticAssistResult,
  fragment: { snippet: string; provenance: TextProvenance },
  applied: { status: "met" | "partially_met"; rawScore: number },
): StructuredCriterionResult {
  // A1: never invent similarity=1. Authority already required a real similarity
  // via applySemanticThresholds; surface the numeric value only when finite.
  const similarity =
    typeof resolution.similarity === "number" && Number.isFinite(resolution.similarity)
      ? resolution.similarity
      : undefined;
  return {
    criterionId: criterion.id,
    label: criterion.label,
    type: criterion.type,
    status: applied.status,
    rawScore: applied.rawScore,
    weight: criterion.weight,
    importance: criterion.importance,
    isKnockout: criterion.isKnockout,
    knockoutFailed: criterion.isKnockout && applied.status !== "met",
    evidence: {
      verbatimSnippet: `${fragment.snippet} — semantically aligned with "${criterion.canonicalName ?? criterion.label}" (model ${resolution.modelId}).`,
      strength: "inferred_assist",
      method: "semantic_assist",
      confidence: Math.max(1, Math.min(99, Math.round((similarity ?? 0.7) * 100))),
      provenance: fragment.provenance,
      canonicalSkillName: criterion.canonicalName,
      aiResolutionDetails: {
        modelId: resolution.modelId,
        rationale: resolution.rationale ?? "",
        rawEquivalenceConfidence: similarity ?? 0,
        targetConcept: resolution.targetConcept,
        modelVersion: resolution.modelVersion,
        similarity,
        decision: resolution.decision,
      },
    },
    missingReason:
      applied.status === "met"
        ? null
        : `Semantically related but not equivalent — review recommended.`,
  };
}

/**
 * Phase 6 assist attempt shared by skill and title criteria. Returns a result
 * when the resolution survives thresholds AND cites a real fragment;
 * otherwise null (caller falls through to `not_demonstrated`).
 */
function trySemanticAssist(
  criterion: StructuredCriterion,
  facts: CandidateFactDocument,
  additionalContext: {
    answers?: Array<{ question: string; answer: string }>;
    profileSkills?: string[];
    semanticResolutions?: Map<string, SemanticAssistResult>;
    semanticThresholds?: SemanticAssistThresholds;
  } | undefined,
): StructuredCriterionResult | null {
  const resolution = additionalContext?.semanticResolutions?.get(criterion.id);
  if (!resolution) return null;
  const applied = applySemanticThresholds(
    resolution,
    resolveSemanticThresholds(additionalContext?.semanticThresholds),
  );
  if (!applied) return null;
  const fragment = findFragmentForConcept(resolution.targetConcept, facts, additionalContext);
  if (!fragment) return null;
  return buildSemanticAssistResult(criterion, resolution, fragment, applied);
}

/**
 * Matches structured criteria against candidate facts deterministically.
 * Returns criterion results with explicit status, evidence strength, full snippet, and provenance.
 */
export function matchCriteriaAgainstFacts(
  criteria: StructuredCriterion[],
  facts: CandidateFactDocument,
  additionalContext?: {
    answers?: Array<{ question: string; answer: string }>;
    profileSkills?: string[];
    /**
     * Phase 6 (§14): precomputed semantic resolutions keyed by criterion id.
     * Data, not I/O — safe to apply synchronously. Absent map = purely
     * deterministic evaluation.
     */
    semanticResolutions?: Map<string, SemanticAssistResult>;
    semanticThresholds?: SemanticAssistThresholds;
  },
): StructuredCriterionResult[] {
  // Skill profiles are derived once per evaluation and reused for every
  // criterion. This keeps skill-specific duration aligned with the canonical
  // evidence/timeline layer while preserving the legacy role-union fallback
  // for unresolved custom criteria.
  const skillProfiles = buildCandidateSkillProfiles(facts, additionalContext);

  return criteria.map((criterion) => {
    // 0. EXCLUDED CONSTRAINT (§3.4 Taleo-style, recruiter-governed).
    // Inverted semantics: evidence of the excluded skill = violation (disqualify);
    // absence of evidence = constraint satisfied. Never auto-created (§2.3).
    if (criterion.excluded) {
      const searchTokens = [
        criterion.label,
        criterion.canonicalName ?? criterion.label,
        ...criterion.targetTokens,
        ...criterion.recruiterAliases,
      ]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

      let violation: { snippet: string; provenance: TextProvenance } | null = null;
      for (const role of facts.workHistory) {
        for (const ach of role.achievements) {
          for (const token of searchTokens) {
            if (textMatchesToken(ach.text, token) && !isNegatedOccurrence(ach.text, token)) {
              violation = { snippet: ach.text, provenance: ach.provenance };
              break;
            }
          }
          if (violation) break;
        }
        if (violation) break;
      }
      if (!violation) {
        for (const skill of facts.declaredSkills) {
          for (const token of searchTokens) {
            if (textMatchesToken(skill.name, token)) {
              violation = { snippet: skill.name, provenance: skill.provenance };
              break;
            }
          }
          if (violation) break;
        }
      }

      if (violation) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          type: criterion.type,
          status: "not_met",
          rawScore: 0,
          weight: criterion.weight,
          importance: criterion.importance,
          isKnockout: criterion.isKnockout,
          excluded: true,
          knockoutFailed: true, // violated an excluded constraint -> disqualify
          evidence: {
            verbatimSnippet: violation.snippet,
            strength: "demonstrated",
            method: "deterministic_exact",
            confidence: 90,
            provenance: violation.provenance,
            canonicalSkillName: criterion.canonicalName,
          },
          missingReason: `Excluded skill "${criterion.label}" was found in the candidate's evidence.`,
        };
      }
      return {
        criterionId: criterion.id,
        label: criterion.label,
        type: criterion.type,
        status: "met",
        rawScore: 100,
        weight: criterion.weight,
        importance: criterion.importance,
        isKnockout: criterion.isKnockout,
        excluded: true,
        knockoutFailed: false, // excluded skill absent -> constraint satisfied
        evidence: null,
        missingReason: null,
      };
    }

    // 1. EXPERIENCE DURATION CRITERION
    if (criterion.type === "experience_duration" || criterion.type === "experience_years") {
      const requiredMonths = criterion.minimumMonths ?? 0;
      const actualMonths = facts.totalWorkDurationMonths;
      const actualYears = facts.totalExperienceYears;
      const requiredYears = Math.round((requiredMonths / 12) * 10) / 10;

      if (actualMonths === 0 && facts.workHistory.length === 0) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          type: criterion.type,
          status: "unknown",
          rawScore: null,
          weight: criterion.weight,
          importance: criterion.importance,
          isKnockout: criterion.isKnockout,
          knockoutFailed: false,
          evidence: null,
          missingReason: "No work experience timeline could be determined from the resume.",
        };
      }

      const roleSummary = facts.workHistory
        .map((r) => `${r.company}${r.durationMonths ? ` (${Math.round(r.durationMonths / 12)} yrs)` : ""}`)
        .slice(0, 4)
        .join(", ");

      if (actualMonths >= requiredMonths) {
        const snippet = `${actualYears} years of experience verified across ${facts.workHistory.length} positions (meets ${requiredYears}+ yrs requirement): ${roleSummary}.`;
        const firstRoleProvenance = facts.workHistory[0]?.provenance ?? {
          sourceType: "resume",
          section: "experience",
          rawText: snippet,
        };

        return {
          criterionId: criterion.id,
          label: criterion.label,
          type: criterion.type,
          status: "met",
          rawScore: 100,
          weight: criterion.weight,
          importance: criterion.importance,
          isKnockout: criterion.isKnockout,
          knockoutFailed: false,
          evidence: {
            verbatimSnippet: snippet,
            strength: "demonstrated",
            method: "structural_date_calc",
            confidence: facts.workTimelineConfidence === "high" ? 95 : 80,
            provenance: firstRoleProvenance,
          },
          missingReason: null,
        };
      }

      // Less experience than required
      const ratio = requiredMonths > 0 ? actualMonths / requiredMonths : 0;
      const rawScore = Math.max(10, Math.round(ratio * 100));
      const snippet = `${actualYears} years of experience found across ${facts.workHistory.length} roles (${requiredYears}+ yrs required): ${roleSummary}.`;

      return {
        criterionId: criterion.id,
        label: criterion.label,
        type: criterion.type,
        status: ratio >= 0.75 ? "partially_met" : "not_met",
        rawScore,
        weight: criterion.weight,
        importance: criterion.importance,
        isKnockout: criterion.isKnockout,
        knockoutFailed: criterion.isKnockout,
        evidence: {
          verbatimSnippet: snippet,
          strength: "demonstrated",
          method: "structural_date_calc",
          confidence: 85,
          provenance: facts.workHistory[0]?.provenance ?? {
            sourceType: "resume",
            section: "experience",
            rawText: snippet,
          },
        },
        missingReason: `${requiredYears}+ years required, but only ${actualYears} years verified.`,
      };
    }

    // 2. EDUCATION CRITERION
    if (criterion.type === "education") {
      const highest = facts.highestEducation;
      // C2: use rubric/job rank when provided; never invent bachelor (rank 3).
      const minRank = criterion.minimumEducationLevelRank;

      if (!highest) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          type: criterion.type,
          status: "unknown",
          rawScore: null,
          weight: criterion.weight,
          importance: criterion.importance,
          isKnockout: criterion.isKnockout,
          knockoutFailed: false,
          evidence: null,
          missingReason: "No formal education history detected in the resume.",
        };
      }

      const eduSnippet = highest.institution
        ? `${highest.degreeName} — ${highest.institution}`
        : highest.degreeName;

      // C1: unrecognized education lines stay unknown — not a false bachelor met.
      if (highest.normalizedLevel === "unknown" || highest.levelRank <= 0) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          type: criterion.type,
          status: "unknown",
          rawScore: null,
          weight: criterion.weight,
          importance: criterion.importance,
          isKnockout: criterion.isKnockout,
          knockoutFailed: false,
          evidence: {
            verbatimSnippet: `Education line detected but degree level is unrecognized: ${eduSnippet}.`,
            strength: "declared",
            method: "deterministic_exact",
            confidence: 40,
            provenance: highest.provenance,
          },
          missingReason: "Education was found but the degree level could not be determined.",
        };
      }

      // No configured minimum → any recognized credential satisfies the criterion.
      if (minRank == null) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          type: criterion.type,
          status: "met",
          rawScore: 100,
          weight: criterion.weight,
          importance: criterion.importance,
          isKnockout: criterion.isKnockout,
          knockoutFailed: false,
          evidence: {
            verbatimSnippet: `Education detected: ${eduSnippet}.`,
            strength: "credentialed",
            method: "deterministic_exact",
            confidence: 90,
            provenance: highest.provenance,
          },
          missingReason: null,
        };
      }

      if (highest.levelRank >= minRank) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          type: criterion.type,
          status: "met",
          rawScore: 100,
          weight: criterion.weight,
          importance: criterion.importance,
          isKnockout: criterion.isKnockout,
          knockoutFailed: false,
          evidence: {
            verbatimSnippet: `Education detected: ${eduSnippet} (meets requirement).`,
            strength: "credentialed",
            method: "deterministic_exact",
            confidence: 95,
            provenance: highest.provenance,
          },
          missingReason: null,
        };
      }

      return {
        criterionId: criterion.id,
        label: criterion.label,
        type: criterion.type,
        status: "not_met",
        rawScore: 50,
        weight: criterion.weight,
        importance: criterion.importance,
        isKnockout: criterion.isKnockout,
        knockoutFailed: criterion.isKnockout,
        evidence: {
          verbatimSnippet: `Education detected: ${eduSnippet} (below required level).`,
          strength: "credentialed",
          method: "deterministic_exact",
          confidence: 90,
          provenance: highest.provenance,
        },
        missingReason: "Highest detected education does not meet required degree rank.",
      };
    }

    // 2.5 DOMAIN TITLE / OCCUPATION CRITERION (Phase 3).
    if (criterion.type === "domain_title") {
      const target = normalizeJobTitle(criterion.canonicalName ?? criterion.label);

      if (!target.occupationId) {
        return {
          criterionId: criterion.id, label: criterion.label, type: criterion.type,
          status: "unknown", rawScore: null, weight: criterion.weight,
          importance: criterion.importance, isKnockout: criterion.isKnockout,
          knockoutFailed: false, evidence: null,
          missingReason: `Target title "${criterion.label}" could not be normalized to a known occupation.`,
        };
      }

      let bestRole: {
        company: string; title: string;
        kind: "exact" | "family" | "related";
        confidence: number; provenance: TextProvenance;
      } | null = null;

      for (const role of facts.workHistory) {
        const cand = normalizeJobTitle(role.title);
        if (!cand.occupationId) continue;
        if (cand.occupationId === target.occupationId) {
          bestRole = { company: role.company, title: role.title, kind: "exact", confidence: 95, provenance: role.provenance };
          break;
        }
        if (isRelatedOccupationNotEquivalent(target.occupationId, cand.occupationId)) {
          if (!bestRole || bestRole.kind === "family") {
            bestRole = { company: role.company, title: role.title, kind: "related", confidence: 55, provenance: role.provenance };
          }
          continue;
        }
        if (isSameOccupationFamily(target.occupationId, cand.occupationId)) {
          if (!bestRole) {
            bestRole = { company: role.company, title: role.title, kind: "family", confidence: 70, provenance: role.provenance };
          }
        }
      }

      if (!bestRole) {
        // Phase 6: semantic assist is the last resort before absence. Runs
        // only when no deterministic occupation evidence exists (§14.1).
        const assisted = trySemanticAssist(criterion, facts, additionalContext);
        if (assisted) return assisted;
        return {
          criterionId: criterion.id, label: criterion.label, type: criterion.type,
          status: "not_demonstrated", rawScore: null, weight: criterion.weight,
          importance: criterion.importance, isKnockout: criterion.isKnockout,
          knockoutFailed: criterion.isKnockout, evidence: null,
          missingReason: `No work history aligns with the target occupation "${target.canonicalName}".`,
        };
      }

      const statusMap = { exact: "met", family: "partially_met", related: "partially_met" } as const;
      const scoreMap = { exact: 100, family: 60, related: 45 } as const;
      const status = statusMap[bestRole.kind];
      const rawScore = scoreMap[bestRole.kind];
      const snippet =
        bestRole.kind === "exact"
          ? `${bestRole.company} (${bestRole.title}) — occupation matches target "${target.canonicalName}".`
          : bestRole.kind === "family"
            ? `${bestRole.company} (${bestRole.title}) — same occupation family as "${target.canonicalName}" (partial alignment).`
            : `${bestRole.company} (${bestRole.title}) — related but not equivalent to "${target.canonicalName}" (§8.4).`;

      return {
        criterionId: criterion.id, label: criterion.label, type: criterion.type,
        status, rawScore, weight: criterion.weight,
        importance: criterion.importance, isKnockout: criterion.isKnockout,
        knockoutFailed: criterion.isKnockout && status !== "met",
        evidence: {
          verbatimSnippet: snippet,
          strength: bestRole.kind === "exact" ? "demonstrated" : "inferred_assist",
          method: bestRole.kind === "exact" ? "deterministic_exact" : "deterministic_stem",
          confidence: bestRole.confidence,
          provenance: bestRole.provenance,
        },
        missingReason: status === "met" ? null : `Title aligns only partially with target occupation "${target.canonicalName}".`,
      };
    }

    // 3. SKILL / EXTENSIBLE CRITERIA MATCHING
    const searchTokens = [
      criterion.label,
      criterion.canonicalName ?? criterion.label,
      ...criterion.targetTokens,
      ...criterion.recruiterAliases,
    ]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    // Priority A: Search work experience achievements and titles
    const matchingRoles: Array<{
      role: (typeof facts.workHistory)[number];
      snippet: string;
      provenance: TextProvenance;
      method: MatchMethod;
    }> = [];

    for (const role of facts.workHistory) {
      let matchedInRole = false;
      for (const ach of role.achievements) {
        for (const token of searchTokens) {
          if (textMatchesToken(ach.text, token) && !isNegatedOccurrence(ach.text, token)) {
            const method: MatchMethod =
              token.toLowerCase() === criterion.label.toLowerCase()
                ? "deterministic_exact"
                : criterion.recruiterAliases.some((a) => a.toLowerCase() === token.toLowerCase())
                ? "recruiter_alias"
                : "built_in_alias";
            matchingRoles.push({
              role,
              snippet: ach.text,
              provenance: ach.provenance,
              method,
            });
            matchedInRole = true;
            break;
          }
        }
        if (matchedInRole) break;
      }

      if (!matchedInRole) {
        for (const token of searchTokens) {
          if (textMatchesToken(role.title, token)) {
            matchingRoles.push({
              role,
              snippet: `Held role: ${role.title}`,
              provenance: role.provenance,
              method:
                token.toLowerCase() === criterion.label.toLowerCase()
                  ? "deterministic_exact"
                  : "built_in_alias",
            });
            break;
          }
        }
      }
    }

    // A1. Skill with specific duration requirement (e.g. "3+ years Python")
    if (criterion.minimumMonths && criterion.minimumMonths > 0) {
      const requiredMonths = criterion.minimumMonths;
      const requiredYears = Math.round((requiredMonths / 12) * 10) / 10;

      if (matchingRoles.length > 0) {
        const profileDuration = criterion.conceptId
          ? skillProfiles.profiles.find((profile) => profile.conceptId === criterion.conceptId)?.relevantDuration
          : undefined;
        const provenDurationMonths =
          profileDuration?.exactMonths ?? profileDuration?.lowerBoundMonths ?? 0;
        const possibleDurationMonths =
          profileDuration?.upperBoundMonths ?? unionWorkIntervals(matchingRoles.map((m) => m.role));
        const hasExactDuration = profileDuration?.exactMonths !== null && profileDuration?.exactMonths !== undefined;
        const actualYears = Math.round((provenDurationMonths / 12) * 10) / 10;
        const possibleYears = Math.round((possibleDurationMonths / 12) * 10) / 10;
        const roleSummary = matchingRoles.map((m) => m.role.company).slice(0, 3).join(", ");
        const first = matchingRoles[0]!;

        if (provenDurationMonths >= requiredMonths) {
          const snippet = hasExactDuration
            ? `${actualYears} years of ${criterion.label} experience verified across ${matchingRoles.length} role(s) (${roleSummary}) (meets ${requiredYears}+ yrs requirement).`
            : `At least ${actualYears} years of ${criterion.label} evidence is established across ${matchingRoles.length} role(s) (${roleSummary}) (meets ${requiredYears}+ yrs requirement).`;
          return {
            criterionId: criterion.id,
            label: criterion.label,
            type: criterion.type,
            status: "met",
            rawScore: 100,
            weight: criterion.weight,
            importance: criterion.importance,
            isKnockout: criterion.isKnockout,
            knockoutFailed: false,
            evidence: {
              verbatimSnippet: snippet,
              strength: "demonstrated",
              method: first.method,
              confidence: 95,
              provenance: first.provenance,
              canonicalSkillName: criterion.canonicalName,
              relevantDurationMonths: provenDurationMonths,
              relevantDurationUpperBoundMonths: possibleDurationMonths,
              lastEvidenceDate: profileDuration?.lastEvidenceDate,
              supportingEvidence: supportingEvidenceForRoles(matchingRoles),
            },
            missingReason: null,
          };
        }

        // Less duration than required for this specific skill
        const ratio = requiredMonths > 0 ? Math.min(1, possibleDurationMonths / requiredMonths) : 0;
        const status: CriterionStatus = criterion.isKnockout && possibleDurationMonths < requiredMonths
          ? "not_met"
          : "partially_met";
        const rawScore = Math.max(25, Math.round(ratio * 90));
        const snippet = hasExactDuration
          ? `${actualYears} years of ${criterion.label} evidence verified across ${matchingRoles.length} role(s) (${roleSummary}) (${requiredYears}+ yrs required).`
          : `Evidence appears in roles spanning up to ${possibleYears} years of ${criterion.label} (${roleSummary}), but continuous skill duration is not established (${requiredYears}+ yrs required).`;

        return {
          criterionId: criterion.id,
          label: criterion.label,
          type: criterion.type,
          status,
          rawScore,
          weight: criterion.weight,
          importance: criterion.importance,
          isKnockout: criterion.isKnockout,
          knockoutFailed: criterion.isKnockout,
          evidence: {
            verbatimSnippet: snippet,
            strength: "demonstrated",
            method: first.method,
            confidence: 85,
            provenance: first.provenance,
            canonicalSkillName: criterion.canonicalName,
            relevantDurationMonths: provenDurationMonths,
            relevantDurationUpperBoundMonths: possibleDurationMonths,
            lastEvidenceDate: profileDuration?.lastEvidenceDate,
            supportingEvidence: supportingEvidenceForRoles(matchingRoles),
          },
          missingReason: possibleDurationMonths >= requiredMonths
            ? `${requiredYears}+ years of ${criterion.label} may be covered by the role window, but continuous duration is not established; review the source evidence.`
            : `${requiredYears}+ years of ${criterion.label} required, but the documented evidence window reaches at most ${possibleYears} years.`,
        };
      }

      // Check if skill was declared in skills section without work tenure
      for (const skill of facts.declaredSkills) {
        for (const token of searchTokens) {
          if (textMatchesToken(skill.name, token)) {
            const explicitDuration = criterion.conceptId
              ? skillProfiles.profiles.find((profile) => profile.conceptId === criterion.conceptId)?.relevantDuration
              : undefined;
            if (explicitDuration?.exactMonths !== null && explicitDuration?.exactMonths !== undefined && explicitDuration.exactMonths >= requiredMonths) {
              const years = Math.round((explicitDuration.exactMonths / 12) * 10) / 10;
              return {
                criterionId: criterion.id,
                label: criterion.label,
                type: criterion.type,
                status: "met",
                rawScore: 100,
                weight: criterion.weight,
                importance: criterion.importance,
                isKnockout: criterion.isKnockout,
                knockoutFailed: false,
                evidence: {
                  verbatimSnippet: `Declared in Skills section: "${skill.name}" with an explicit ${years}-year duration claim.`,
                  strength: "declared",
                  method: token.toLowerCase() === criterion.label.toLowerCase() ? "deterministic_exact" : "built_in_alias",
                  confidence: 80,
                  provenance: skill.provenance,
                  canonicalSkillName: criterion.canonicalName,
                  relevantDurationMonths: explicitDuration.exactMonths,
                  relevantDurationUpperBoundMonths: explicitDuration.upperBoundMonths ?? undefined,
                  lastEvidenceDate: explicitDuration.lastEvidenceDate,
                },
                missingReason: null,
              };
            }
            return {
              criterionId: criterion.id,
              label: criterion.label,
              type: criterion.type,
              status: "partially_met",
              rawScore: 40,
              weight: criterion.weight,
              importance: criterion.importance,
              isKnockout: criterion.isKnockout,
              knockoutFailed: criterion.isKnockout,
              evidence: {
                verbatimSnippet: `Declared in Skills section: "${skill.name}" (requires ${requiredYears}+ yrs of verified experience).`,
                strength: "declared",
                method:
                  token.toLowerCase() === criterion.label.toLowerCase()
                    ? "deterministic_exact"
                    : "built_in_alias",
                confidence: 75,
                provenance: skill.provenance,
                canonicalSkillName: criterion.canonicalName,
                relevantDurationMonths: 0,
              },
              missingReason: `${requiredYears}+ years of ${criterion.label} required, but only declared as a skill without verified work tenure.`,
            };
          }
        }
      }
    }

    // A2. Standard skill matching (no minimum duration constraint)
    if (matchingRoles.length > 0) {
      const first = matchingRoles[0]!;
      const profileDuration = criterion.conceptId
        ? skillProfiles.profiles.find((profile) => profile.conceptId === criterion.conceptId)?.relevantDuration
        : undefined;
      const relevantDurationMonths =
        profileDuration?.exactMonths ??
        profileDuration?.upperBoundMonths ??
        unionWorkIntervals(matchingRoles.map((m) => m.role));
      const snippet = `${first.role.company} (${first.role.title}): "${first.snippet}"`;

      return {
        criterionId: criterion.id,
        label: criterion.label,
        type: criterion.type,
        status: "met",
        rawScore: 100, // Demonstrated in work
        weight: criterion.weight,
        importance: criterion.importance,
        isKnockout: criterion.isKnockout,
        knockoutFailed: false,
        evidence: {
          verbatimSnippet: snippet,
          strength: "demonstrated",
          method: first.method,
          confidence: 95,
          provenance: first.provenance,
          canonicalSkillName: criterion.canonicalName,
          relevantDurationMonths,
          relevantDurationUpperBoundMonths: profileDuration?.upperBoundMonths ?? relevantDurationMonths,
          lastEvidenceDate: profileDuration?.lastEvidenceDate,
          supportingEvidence: supportingEvidenceForRoles(matchingRoles),
        },
        missingReason: null,
      };
    }

    // Priority B: Declared in Skills section
    for (const skill of facts.declaredSkills) {
      for (const token of searchTokens) {
        if (textMatchesToken(skill.name, token)) {
          const method: MatchMethod =
            token.toLowerCase() === criterion.label.toLowerCase()
              ? "deterministic_exact"
              : criterion.recruiterAliases.some((a) => a.toLowerCase() === token.toLowerCase())
              ? "recruiter_alias"
              : "built_in_alias";

          return {
            criterionId: criterion.id,
            label: criterion.label,
            type: criterion.type,
            status: "met",
            rawScore: 80, // Declared presence, meets requirement honestly
            weight: criterion.weight,
            importance: criterion.importance,
            isKnockout: criterion.isKnockout,
            knockoutFailed: false,
            evidence: {
              verbatimSnippet: `Declared in Skills section: "${skill.name}"`,
              strength: "declared",
              method,
              confidence: 85,
              provenance: skill.provenance,
              canonicalSkillName: criterion.canonicalName,
            },
            missingReason: null,
          };
        }
      }
    }

    // Priority C: Application Answers or Profile Skills
    if (additionalContext?.answers) {
      for (const qa of additionalContext.answers) {
        for (const token of searchTokens) {
          if (textMatchesToken(qa.answer, token)) {
            return {
              criterionId: criterion.id,
              label: criterion.label,
              type: criterion.type,
              status: "met",
              rawScore: 75,
              weight: criterion.weight,
              importance: criterion.importance,
              isKnockout: criterion.isKnockout,
              knockoutFailed: false,
              evidence: {
                verbatimSnippet: `Application response to "${qa.question}": "${qa.answer}"`,
                strength: "declared",
                method: "deterministic_exact",
                confidence: 80,
                provenance: {
                  sourceType: "application_qa",
                  rawText: qa.answer,
                },
                canonicalSkillName: criterion.canonicalName,
              },
              missingReason: null,
            };
          }
        }
      }
    }

    // Related-but-not-equivalent taxonomy hit (§8.4 / C3):
    // broader/narrower/related concepts MUST NOT produce automatic `met` or
    // silent `partially_met` — related evidence is not demonstration.
    const relatedLabels = relatedSkillLabels(criterion.canonicalName ?? criterion.label);
    if (relatedLabels.length > 0) {
      const relatedTokens = relatedLabels
        .flatMap((label) => [label, ...relatedSkillLabels(label)])
        .filter(Boolean);
      const uniqueRelated = [...new Set(relatedTokens)].sort((a, b) => b.length - a.length);
      for (const role of facts.workHistory) {
        for (const ach of role.achievements) {
          for (const token of uniqueRelated) {
            if (
              textMatchesToken(ach.text, token) &&
              !isNegatedOccurrence(ach.text, token) &&
              isRelatedButNotEquivalent(criterion.canonicalName ?? criterion.label, token)
            ) {
              return {
                criterionId: criterion.id,
                label: criterion.label,
                type: criterion.type,
                // Related ≠ equivalent (§8.4): never silent partial credit.
                status: "not_demonstrated",
                rawScore: null,
                weight: criterion.weight,
                importance: criterion.importance,
                isKnockout: criterion.isKnockout,
                knockoutFailed: criterion.isKnockout,
                evidence: null,
                missingReason: `Found related skill evidence ("${token}") but not an equivalent match for ${criterion.label}.`,
              };
            }
          }
        }
      }
      for (const skill of facts.declaredSkills) {
        for (const token of uniqueRelated) {
          if (
            textMatchesToken(skill.name, token) &&
            isRelatedButNotEquivalent(criterion.canonicalName ?? criterion.label, token)
          ) {
            return {
              criterionId: criterion.id,
              label: criterion.label,
              type: criterion.type,
              // Related ≠ equivalent (§8.4): never silent partial credit.
              status: "not_demonstrated",
              rawScore: null,
              weight: criterion.weight,
              importance: criterion.importance,
              isKnockout: criterion.isKnockout,
              knockoutFailed: criterion.isKnockout,
              evidence: null,
              missingReason: `Found related skill "${skill.name}" but not an equivalent match for ${criterion.label}.`,
            };
          }
        }
      }
    }

    // Not found in any section: try semantic assist before declaring absence.
    // Absence of evidence != failure — and an unverifiable provider claim
    // is absence, not evidence (§2.1, §14.3).
    const assisted = trySemanticAssist(criterion, facts, additionalContext);
    if (assisted) return assisted;

    return {
      criterionId: criterion.id,
      label: criterion.label,
      type: criterion.type,
      status: "not_demonstrated",
      rawScore: null, // Neutral: excluded from score denominator
      weight: criterion.weight,
      importance: criterion.importance,
      isKnockout: criterion.isKnockout,
      knockoutFailed: criterion.isKnockout, // If explicit knockout was unmentioned, it fails gate
      evidence: null,
      missingReason: `No explicit evidence found for ${criterion.label} in work experience or skills.`,
    };
  });
}
