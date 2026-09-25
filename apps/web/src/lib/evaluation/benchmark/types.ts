/**
 * ATS Evaluation Bench — types (Audit doc §19.2).
 *
 * Gold annotations are human-reviewed expected facts. Where an answer is
 * genuinely ambiguous, the gold label may explicitly be "unknown" rather
 * than forcing certainty.
 */

import type { CriterionStatus, CriterionType } from "../types";

export interface GoldPosition {
  title: string;
  company: string;
  startYear: number;
  endYear?: number;
  isCurrent: boolean;
}

export interface GoldEducation {
  degreeName: string;
  levelRank: number; // 1-5
}

export interface GoldSkill {
  /** Canonical concept ID from the taxonomy (e.g. "skill:react"). */
  conceptId: string;
  /** How the skill is evidenced in this fixture. */
  evidenceKinds: Array<"declared" | "demonstrated_role" | "credentialed" | "application_answer">;
}

export interface GoldCriterionExpectation {
  /** Criterion label as it appears in the job/rubric. */
  label: string;
  type: CriterionType;
  /** Expected status. "unknown" is a valid gold label when genuinely ambiguous. */
  expectedStatus: CriterionStatus;
  /** Optional: expected relevant duration in months (exact, when bounded). */
  expectedRelevantMonths?: number;
}

export interface GoldAnnotation {
  positions: GoldPosition[];
  education: GoldEducation[];
  skills: GoldSkill[];
  /** Union of non-overlapping work intervals in months. */
  timelineMonths: number;
  criterionExpectations: GoldCriterionExpectation[];
}

export interface BenchmarkJobInput {
  title: string;
  description: string;
  requirements: string | null;
  experienceLevel: string | null;
  education: string | null;
  keywords: string[];
}

export interface BenchmarkFixture {
  id: string;
  /** Category tags from §19.1 (role/domain, seniority, language, layout, edge cases). */
  tags: string[];
  description: string;
  resumeText: string;
  /** Application Q&A, when the fixture exercises that source. */
  answers?: Array<{ question: string; answer: string }>;
  job: BenchmarkJobInput;
  gold: GoldAnnotation;
}
