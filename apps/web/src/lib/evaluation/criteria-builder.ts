import type { CriterionImportance, CriterionOrigin, CriterionType } from "./types";
import type { TextProvenance } from "./ats-parser";
import type { RulesInput } from "./rules";
import { resolveSkillConcept } from "./taxonomy/skill-concepts";
import { normalizeJobTitle } from "./taxonomy/occupation-concepts";

export interface StructuredCriterion {
  id: string;
  label: string;
  canonicalName?: string;
  conceptId?: string;
  type: CriterionType;
  importance: CriterionImportance;
  isKnockout: boolean;
  /** Taleo-style governed exclusion (§3.4). When true, forces knockout semantics. */
  excluded?: boolean;
  weight: number;
  origin: CriterionOrigin;
  sourceProvenance?: TextProvenance;
  minimumMonths?: number;
  minimumEducationLevelRank?: number;
  targetTokens: string[];
  recruiterAliases: string[];
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function plain(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseExperienceMonths(
  levelValue: string | null | undefined,
  reqsValue: string | null | undefined,
): number | null {
  const reqText = plain(reqsValue);
  const explicit = reqText.match(/(\d{1,2})\s*\+?\s*(?:years|yrs|year|años|año)/i);
  if (explicit) return Number(explicit[1]) * 12;

  const levelText = normalized(levelValue ?? "");
  const levelMatch = levelText.match(/(\d{1,2})\s*\+?\s*(?:years|yrs|year|años|año)/);
  if (levelMatch) return Number(levelMatch[1]) * 12;

  if (/intern|trainee|entry|junior|jr/.test(levelText)) return 0;
  if (/mid|intermediate|semi/.test(levelText)) return 24;
  if (/senior|sr|lead|principal|staff/.test(levelText)) return 60;
  return null;
}

function parseEducationRank(eduValue: string | null | undefined): number | null {
  if (!eduValue) return null;
  const text = normalized(eduValue);
  if (/ph d|phd|doctor/.test(text)) return 5;
  if (/master|msc|mba|magister|maestria|postgrad/.test(text)) return 4;
  if (/bachelor|bsc|ba|b eng|licenc|ingenier|undergraduate/.test(text)) return 3;
  if (/associate|tecnico|technician/.test(text)) return 2;
  if (/high school|secondary|bachillerato|secundaria/.test(text)) return 1;
  return null;
}

function hasRequiredMarker(text: string, term: string): boolean {
  const norm = normalized(text);
  const idx = norm.indexOf(normalized(term));
  if (idx < 0) return false;
  const window = norm.slice(Math.max(0, idx - 80), idx + term.length + 80);
  return /required|must|mandatory|essential|requisito|obligatorio|excluyente/.test(window);
}

/**
 * Builds structured criteria from either an explicit workspace rubric or the job profile.
 * Notice: isKnockout is strictly false by default unless explicitly configured in rubric.
 */
export function buildStructuredCriteria(input: RulesInput): StructuredCriterion[] {
  if (input.rubric && input.rubric.criteria.length > 0) {
    return input.rubric.criteria.map((c) => {
      const resolved = resolveSkillConcept(c.label, c.aliases ?? []);
      const canonicalName = c.canonicalName ?? resolved.canonicalName;
      const conceptId = c.conceptId ?? resolved.conceptId;
      const targetTokens = c.targetTokens ?? resolved.searchTokens;
      // §3.4 / §2.3: an excluded constraint forces knockout semantics and is
      // always treated as required. Knockout can only come from explicit config.
      const excluded = Boolean(c.excluded);
      return {
        id: c.key,
        label: c.label,
        canonicalName,
        conceptId,
        type: c.type,
        importance: excluded ? "required" : c.importance,
        isKnockout: excluded || Boolean(c.isKnockout),
        excluded,
        weight: c.weight,
        origin: c.origin ?? "recruiter_rubric",
        sourceProvenance: c.sourceProvenance,
        // Education uses minimumValue / explicit rank as degree rank (1–5).
        // Experience uses minimumValue as years → months. Never hardcode bachelor.
        minimumMonths:
          c.type === "education"
            ? undefined
            : c.minimumValue
              ? c.minimumValue * 12
              : undefined,
        minimumEducationLevelRank:
          c.type === "education"
            ? (typeof c.minimumEducationLevelRank === "number"
                ? c.minimumEducationLevelRank
                : typeof c.minimumValue === "number"
                  ? c.minimumValue
                  : undefined)
            : undefined,
        targetTokens,
        recruiterAliases: c.aliases ?? [],
      };
    });
  }

  const criteria: StructuredCriterion[] = [];
  const reqText = plain(input.job.requirements);
  const keywords = [...new Set(input.job.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 20);

  for (const skill of keywords) {
    const isRequired = hasRequiredMarker(reqText, skill);
    const resolved = resolveSkillConcept(skill);

    // Check if requirements explicitly state duration for this skill (e.g. "3+ years Python" or "5 yrs React")
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tenureRegex = new RegExp(
      `(\\d{1,2})\\+?\\s*(?:years?|yrs?|años?)\\s*(?:of\\s+)?(?:experience\\s+in\\s+)?${escaped}`,
      "i",
    );
    const tenureMatch = reqText.match(tenureRegex);
    const minimumMonths = tenureMatch ? Number(tenureMatch[1]) * 12 : undefined;

    criteria.push({
      id: `crit:skill:${normalized(skill).replace(/\s+/g, "-")}`,
      label: skill,
      canonicalName: resolved.canonicalName,
      conceptId: resolved.conceptId,
      type: "skill",
      importance: isRequired ? "required" : "preferred",
      isKnockout: false,
      weight: 50,
      origin: "structured_job_field",
      excluded: false,
      minimumMonths,
      targetTokens: resolved.searchTokens,
      recruiterAliases: [],
    });
  }

  const expMonths = parseExperienceMonths(input.job.experienceLevel, reqText);
  if (expMonths !== null) {
    criteria.push({
      id: "crit:exp-duration",
      label: "Experience",
      canonicalName: "Experience",
      type: "experience_duration",
      importance: "required",
      isKnockout: false, // Explicit correction: structured job field creates required, NOT knockout
      weight: 25,
      origin: "structured_job_field",
      excluded: false,
      minimumMonths: expMonths,
      targetTokens: ["experience"],
      recruiterAliases: [],
    });
  }

  // Phase 3: target-title / occupation relevance (Audit doc §11, §24 Phase 3).
  // The structured job title becomes a preferred, non-gating domain_title
  // criterion — a relevance signal, never a quality judgment (§11.2, §16.4).
  // Unresolvable titles emit no criterion: absence of signal is not a penalty
  // and keeps coverage semantics clean (every emitted criterion is evaluable).
  const jobTitle = input.job.title?.trim() ?? "";
  if (jobTitle.length > 0) {
    const normalizedTarget = normalizeJobTitle(jobTitle);
    if (normalizedTarget.occupationId) {
      criteria.push({
        id: "crit:domain-title",
        label: jobTitle,
        canonicalName: normalizedTarget.canonicalName,
        conceptId: undefined,
        type: "domain_title",
        importance: "preferred",
        isKnockout: false,
        weight: 20,
        origin: "structured_job_field",
        excluded: false,
        targetTokens: [],
        recruiterAliases: [],
      });
    }
  }

  // Free-text job-description requirements are intentionally not added to the
  // authoritative evaluation here. `extractRequirementCandidates` and the
  // governed job-intent workflow expose them as suggestions; only a published
  // recruiter rubric may turn one into a scored criterion (§9, §24 Phase 2).
  // This prevents a sentence such as "Kubernetes required" from silently
  // changing coverage, score, or knockout behavior.

  if (input.job.education) {
    const rank = parseEducationRank(input.job.education);
    criteria.push({
      id: "crit:education",
      label: "Education",
      type: "education",
      importance: "required",
      isKnockout: false,
      weight: 15,
      origin: "structured_job_field",
      excluded: false,
      // Only set a rank when the job education string parses; never invent bachelor.
      minimumEducationLevelRank: rank ?? undefined,
      targetTokens: [input.job.education],
      recruiterAliases: [],
    });
  }

  return criteria;
}
