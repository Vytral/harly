import type { CandidateScore } from "@/lib/ai/schemas";
import { extractResumeAutofillFields } from "@/features/applications/resume-autofill";
import type { EvaluationMode } from "./mode";

/** Immutable engine identifier persisted with every deterministic evaluation. */
export const RULES_EVALUATION_VERSION = "rules-v3";

export type RulesCriterion = {
  key: string;
  label: string;
  type: "skill" | "experience_years" | "education";
  importance: "required" | "preferred";
  weight: number;
  aliases: string[];
  minimumValue?: number;
};

export type RulesRubric = {
  version: string;
  criteria: RulesCriterion[];
};

export type RuleCriterionResult = {
  key: string;
  label: string;
  status: "met" | "not_met" | "unknown";
  score: number | null;
  weight: number;
  evidence: string | null;
  evidenceSource: "resume" | "profile" | "evaluation" | null;
  confidence: number;
  missingReason: string | null;
};

export type RulesEvaluation = {
  result: CandidateScore;
  rubric: RulesRubric;
  criterionResults: RuleCriterionResult[];
  evidenceCoverage: number;
  confidence: number;
  requiresHumanReview: boolean;
};

export type RulesInput = {
  job: {
    title: string;
    description: string;
    requirements: string | null;
    experienceLevel: string | null;
    education: string | null;
    keywords: string[];
    evaluationMode?: EvaluationMode;
  };
  candidate: {
    resumeText: string | null;
    answers: Array<{ question: string; answer: string }>;
    skills?: string[];
    experienceYears?: number | null;
  };
  /** Optional recruiter-approved rubric. If absent, derive a conservative one. */
  rubric?: RulesRubric;
};

function plain(value: string | null): string {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function includesTerm(haystack: string, term: string): boolean {
  const value = normalized(term);
  if (!value) return false;
  const source = ` ${normalized(haystack)} `;
  return source.includes(` ${value} `);
}

function evidenceFor(text: string, aliases: string[]): string | null {
  const source = text.replace(/\s+/g, " ").trim();
  for (const alias of aliases) {
    const index = normalized(source).indexOf(normalized(alias));
    if (index < 0) continue;
    const start = Math.max(0, index - 60);
    const end = Math.min(source.length, index + alias.length + 120);
    return source.slice(start, end).trim();
  }
  return null;
}

function level(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = normalized(value);
  if (/intern|trainee|entry|junior|jr/.test(text)) return 1;
  if (/senior|sr|lead|principal|staff/.test(text)) return 3;
  if (/mid|intermediate|semi/.test(text)) return 2;
  return null;
}

function requiredExperience(value: string | null, requirements: string | null): number | null {
  const explicit = plain(requirements).match(/(\d{1,2})\s*\+?\s*(?:years|yrs|year|años|año)/i);
  if (explicit) return Number(explicit[1]);
  const role = level(value);
  if (role === 1) return 0;
  if (role === 2) return 2;
  if (role === 3) return 5;
  return null;
}

function educationLevel(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = normalized(value);
  if (/ph d|phd|doctor/.test(text)) return 5;
  if (/master|msc|mba|magister|maestria|postgrad/.test(text)) return 4;
  if (/bachelor|bsc|ba|b eng|licenc|ingenier|undergraduate/.test(text)) return 3;
  if (/associate|tecnico|technician/.test(text)) return 2;
  if (/high school|secondary|bachillerato|secundaria/.test(text)) return 1;
  return null;
}

function hasRequiredMarker(text: string, term: string): boolean {
  const normalizedText = normalized(text);
  const index = normalizedText.indexOf(normalized(term));
  if (index < 0) return false;
  const window = normalizedText.slice(Math.max(0, index - 80), index + term.length + 80);
  return /required|must|mandatory|essential|requisito|obligatorio|excluyente/.test(window);
}

function defaultRubric(input: RulesInput): RulesRubric {
  const requirements = plain(input.job.requirements);
  const skills = [...new Set(input.job.keywords.map((keyword) => keyword.trim()).filter(Boolean))]
    .slice(0, 30);
  const criteria: RulesCriterion[] = skills.map((skill) => ({
    key: `skill:${normalized(skill).replace(/\s+/g, "-")}`,
    label: skill,
    type: "skill",
    importance: hasRequiredMarker(requirements, skill) ? "required" : "preferred",
    weight: 50,
    aliases: [skill],
  }));
  const minimumExperience = requiredExperience(input.job.experienceLevel, requirements);
  if (minimumExperience !== null) {
    criteria.push({
      key: "experience-years",
      label: "Experience",
      type: "experience_years",
      importance: "required",
      weight: 25,
      aliases: [],
      minimumValue: minimumExperience,
    });
  }
  if (input.job.education) {
    criteria.push({
      key: "education",
      label: "Education",
      type: "education",
      importance: "required",
      weight: 15,
      aliases: [],
    });
  }
  return { version: RULES_EVALUATION_VERSION, criteria };
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function missingEvidenceScore(
  criterion: RulesCriterion,
  mode: EvaluationMode,
): number {
  if (criterion.importance === "required") {
    return mode === "relaxed" ? 35 : mode === "balanced" ? 20 : 0;
  }
  return mode === "relaxed" ? 55 : mode === "balanced" ? 35 : 20;
}

function resultCriterion(
  label: string,
  score: number,
  evidence: string | null,
): CandidateScore["criteria"][number] {
  return { label, score: clamp(score), evidence };
}

/**
 * Explainable, conservative evaluation. Unknown evidence is not scored as a
 * failure, but it lowers coverage and forces human review.
 */
export function evaluateCandidateWithRules(input: RulesInput): RulesEvaluation {
  const rubric = input.rubric ?? defaultRubric(input);
  const resumeText = input.candidate.resumeText ?? "";
  const profileText = [resumeText, ...(input.candidate.skills ?? [])].join(" ");
  const extracted = extractResumeAutofillFields({ fileName: "resume.txt", text: resumeText });
  const candidateEducation = educationLevel(extracted.education);
  const criterionResults: RuleCriterionResult[] = rubric.criteria.map((criterion) => {
    if (criterion.type === "skill") {
      const aliases = criterion.aliases.length > 0 ? criterion.aliases : [criterion.label];
      const matched = aliases.some((alias) => includesTerm(profileText, alias));
      return {
        key: criterion.key,
        label: criterion.label,
        status: matched ? "met" : "unknown",
        score: matched ? 100 : null,
        weight: criterion.weight,
        evidence: matched ? evidenceFor(profileText, aliases) : null,
        evidenceSource: matched ? (includesTerm(resumeText, aliases[0] ?? "") ? "resume" : "profile") : null,
        confidence: matched ? 90 : 0,
        missingReason: matched ? null : "No explicit evidence found in the available profile or resume.",
      };
    }

    if (criterion.type === "experience_years") {
      const actual = input.candidate.experienceYears;
      if (actual == null || criterion.minimumValue == null) {
        return {
          key: criterion.key, label: criterion.label, status: "unknown", score: null,
          weight: criterion.weight, evidence: null, evidenceSource: null, confidence: 0,
          missingReason: "Experience duration could not be established.",
        };
      }
      const score = criterion.minimumValue === 0
        ? 100
        : clamp((actual / criterion.minimumValue) * 100);
      return {
        key: criterion.key, label: criterion.label,
        status: actual >= criterion.minimumValue ? "met" : "not_met",
        score, weight: criterion.weight,
        evidence: `${actual} years found; ${criterion.minimumValue}+ expected.`,
        evidenceSource: input.candidate.experienceYears != null && resumeText ? "resume" : "profile",
        confidence: 80, missingReason: null,
      };
    }

    if (candidateEducation == null) {
      return {
        key: criterion.key, label: criterion.label, status: "unknown", score: null,
        weight: criterion.weight, evidence: null, evidenceSource: null, confidence: 0,
        missingReason: "Education level could not be established.",
      };
    }
    const required = educationLevel(input.job.education);
    const score = required == null ? 100 : candidateEducation >= required ? 100 : 50;
    return {
      key: criterion.key, label: criterion.label,
      status: required == null || candidateEducation >= required ? "met" : "not_met",
      score, weight: criterion.weight,
      evidence: required == null ? "Education level detected in resume." : "Detected education compared with the job requirement.",
      evidenceSource: "resume", confidence: 75, missingReason: null,
    };
  });

  const criterionByKey = new Map(rubric.criteria.map((criterion) => [criterion.key, criterion]));
  const known = criterionResults.filter((criterion) => criterion.score !== null);
  const denominator = rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const score = denominator === 0
    ? 0
    : criterionResults.reduce((sum, criterion) => {
        const definition = criterionByKey.get(criterion.key);
        const fallback = definition
          ? missingEvidenceScore(definition, input.job.evaluationMode ?? "balanced")
          : 0;
        return sum + (criterion.score ?? fallback) * (definition?.weight ?? criterion.weight);
      }, 0) / denominator;
  const coverage = rubric.criteria.length === 0
    ? 0
    : Math.round((known.length / rubric.criteria.length) * 100);
  const confidence = known.length === 0
    ? 0
    : Math.round(known.reduce((sum, criterion) => sum + criterion.confidence, 0) / known.length);
  const roundedScore = clamp(score);
  const mode = input.job.evaluationMode ?? "balanced";
  const requiredGap = criterionResults.some((criterion) => {
    const definition = criterionByKey.get(criterion.key);
    return definition?.importance === "required" && criterion.status !== "met";
  });
  const requiredFailure = criterionResults.some((criterion) => {
    const definition = criterionByKey.get(criterion.key);
    return definition?.importance === "required" && criterion.status === "not_met";
  });
  const strongBlocked = mode === "strict" ? requiredGap : requiredFailure;
  const yesBlocked = mode === "strict" ? requiredGap : requiredFailure;
  const recommendation =
    roundedScore >= 85 && !strongBlocked && coverage >= (mode === "relaxed" ? 60 : 80) && confidence >= (mode === "relaxed" ? 60 : 75)
      ? "strong_yes"
      : roundedScore >= (mode === "strict" ? 80 : 70) && !yesBlocked && coverage >= (mode === "strict" ? 80 : 60)
        ? "yes"
        : roundedScore >= 45
          ? "maybe"
          : "no";
  const requiredUnknown = criterionResults.some((criterion) => criterion.status === "unknown" && rubric.criteria.find((item) => item.key === criterion.key)?.importance === "required");
  const requiresHumanReview = requiredUnknown || coverage < 80 || confidence < 70;
  const criteria = criterionResults.map((criterion) => resultCriterion(criterion.label, criterion.score ?? 0, criterion.evidence));

  return {
    rubric,
    criterionResults,
    evidenceCoverage: coverage,
    confidence,
    requiresHumanReview,
    result: {
      score: roundedScore,
      recommendation,
      summary: requiresHumanReview
        ? `Automatic evaluation found ${known.length}/${rubric.criteria.length} criteria with evidence. Human review is required because information is incomplete or uncertain.`
        : `Automatic evaluation matched ${known.length}/${rubric.criteria.length} job-related criteria. Review the evidence before deciding.`,
      strengths: criterionResults.filter((criterion) => criterion.score !== null && criterion.score >= 80).map((criterion) => `${criterion.label}: ${criterion.evidence ?? "strong match"}`).slice(0, 8),
      gaps: criterionResults.filter((criterion) => criterion.status !== "met" || (criterion.score ?? 0) < 60).map((criterion) => `${criterion.label}: ${criterion.missingReason ?? criterion.evidence ?? "below requirement"}`).slice(0, 8),
      criteria: criteria.slice(0, 8),
    },
  };
}

/** Backwards-compatible result used by existing AI/rules call sites. */
export function scoreCandidateWithRules(input: RulesInput): CandidateScore {
  return evaluateCandidateWithRules(input).result;
}

export function defaultRulesRubric(input: RulesInput): RulesRubric {
  return defaultRubric(input);
}
