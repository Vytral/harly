/**
 * Quantified impact extraction — Phase 5 (Audit doc §13, §24 Phase 5).
 *
 * Extracts objective metric patterns from achievement prose and classifies
 * their descriptive direction. This layer enriches recruiter evidence ONLY:
 * it never influences scores, tiers, or gates.
 *
 * Hard rule (§13.3, §23): a number in a sentence does not prove success.
 * `direction` describes the metric's movement ("reduced", "grew"), never a
 * quality judgment. "Managed a $2M budget" is scale (neutral); "Errors
 * increased by 40%" is quantified movement in a negative context — still
 * recorded as direction "increase" with no positivity claim.
 */

import type { CandidateFactDocument, TextProvenance } from "../ats-parser";

export type ImpactMetricType =
  | "percentage"
  | "multiplier"
  | "currency"
  | "count"
  | "volume"
  | "duration"
  | "other";

export type ImpactDirection = "increase" | "decrease" | "neutral" | "unknown";

export interface ImpactMetric {
  type: ImpactMetricType;
  rawText: string;
  numericValue?: number;
  unit?: string;
  direction: ImpactDirection;
  provenance: TextProvenance;
}

export interface AchievementFact {
  text: string;
  metrics: ImpactMetric[];
  positionId: string;
  provenance: TextProvenance;
}

const NUMBER = "\\d[\\d,]*(?:\\.\\d+)?\\s?[kKmMbB]?";

const INCREASE_CUES =
  /\b(grew|grow|growth|growing|increased?|increasing|improved?|improving|improvement|boosted?|lifted?|lift|raised?|raising|accelerated?|scaled?|scaling|doubled?|tripled?|expanded?|exceeded?|beat|outperformed?|up\s+by|higher|more)\b/i;
const DECREASE_CUES =
  /\b(reduced?|reducing|reduction|cut|cutting|cuts|decreased?|decreasing|lowered?|lowering|dropped?|dropping|drop|shrunk|shrink|shortened?|saved?|saving|fewer|less|down\s+by|eliminated?)\b/i;
const SCALE_CUES =
  /\b(managed?|managing|handling|handled|oversaw|overseeing|responsible\s+for|budget|portfolio|team\s+of|across|serving|supporting|processing)\b/i;

function directionFromContext(before: string, after: string): ImpactDirection {
  const window = `${before.slice(-48)} ${after.slice(0, 24)}`;
  const up = INCREASE_CUES.test(window);
  const down = DECREASE_CUES.test(window);
  if (up && !down) return "increase";
  if (down && !up) return "decrease";
  if (SCALE_CUES.test(window)) return "neutral";
  return "unknown";
}

function parseNumber(raw: string): number | undefined {
  const compact = raw.replace(/,/g, "");
  const match = compact.match(/(\d+(?:\.\d+)?)\s*([kmb])?/i);
  if (!match) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const suffix = (match[2] ?? "").toLowerCase();
  const factor = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return base * factor;
}

interface MetricPattern {
  type: ImpactMetricType;
  regex: RegExp;
  unit: (match: RegExpMatchArray) => string | undefined;
  value: (match: RegExpMatchArray) => number | undefined;
}

const COUNT_UNITS =
  "users|customers|clients|accounts|leads|deals|followers|subscribers|members|visitors|downloads|requests|transactions|orders|tickets|engineers|reports|hires|tests|candidates|interviews|projects|releases|deployments|incidents|posts|articles|campaigns|calls|meetings|workshops|vendors|partners|stores";

// Order matters: most specific first. All patterns are global; collapsing
// overlaps happens in extractImpactMetrics by source span.
const PATTERNS: MetricPattern[] = [
  {
    type: "percentage",
    regex: new RegExp(`(${NUMBER})\\s*%`, "gi"),
    unit: () => "%",
    value: (m) => parseNumber(m[1]!),
  },
  {
    type: "multiplier",
    regex: new RegExp(`(${NUMBER})\\s*x\\b`, "gi"),
    unit: () => "x",
    value: (m) => parseNumber(m[1]!),
  },
  {
    type: "currency",
    regex: new RegExp(`([$€£]\\s?${NUMBER}\\s?[kKmMbB]?(?:\\+)?|\\b(?:USD|EUR|GBP)\\s?${NUMBER}\\s?[kKmMbB]?)`, "g"),
    unit: (m) => m[0]!.trim().match(/^([$€£]|[A-Z]{3})/)?.[0],
    value: (m) => parseNumber(m[0]!),
  },
  {
    type: "volume",
    regex: new RegExp(`(${NUMBER}(?:\\s*[a-z]+)?)\\s*\\/\\s*(day|week|month|year|hour|second)\\b`, "gi"),
    unit: (m) => `/${m[2]!.toLowerCase()}`,
    value: (m) => parseNumber(m[1]!),
  },
  {
    type: "duration",
    regex: new RegExp(
      `\\b(?:in|over|within|per|every)\\s+(${NUMBER})\\s*(months?|years?|weeks?|days?|hrs?|hours?)\\b`,
      "gi",
    ),
    unit: (m) => m[2]!.toLowerCase(),
    value: (m) => parseNumber(m[1]!),
  },
  {
    type: "count",
    regex: new RegExp(`(${NUMBER})\\s*\\+?\\s*(${COUNT_UNITS})\\b`, "gi"),
    unit: (m) => m[2]!.toLowerCase(),
    value: (m) => parseNumber(m[1]!),
  },
];

/**
 * Extracts quantified metrics from a single achievement sentence.
 * Pure and deterministic; overlapping spans collapse to the first (most
 * specific) pattern match.
 */
export function extractImpactMetrics(text: string, provenance: TextProvenance): ImpactMetric[] {
  const claimed: Array<{ start: number; end: number }> = [];
  const metrics: ImpactMetric[] = [];

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (claimed.some((span) => start < span.end && end > span.start)) continue;
      claimed.push({ start, end });
      const before = text.slice(0, start);
      const after = text.slice(end);
      metrics.push({
        type: pattern.type,
        rawText: match[0],
        numericValue: pattern.value(match),
        unit: pattern.unit(match),
        direction: directionFromContext(before, after),
        provenance,
      });
    }
  }

  return metrics.sort((a, b) => text.indexOf(a.rawText) - text.indexOf(b.rawText));
}

/**
 * Derives achievement facts for every work-history bullet. Achievements
 * without metrics are kept with an empty list — absence of a number is
 * information, not a defect.
 */
export function extractAchievementImpacts(facts: CandidateFactDocument): AchievementFact[] {
  const out: AchievementFact[] = [];
  for (const role of facts.workHistory) {
    for (const achievement of role.achievements) {
      out.push({
        text: achievement.text,
        metrics: extractImpactMetrics(achievement.text, achievement.provenance),
        positionId: role.id,
        provenance: achievement.provenance,
      });
    }
  }
  return out;
}

/** Top quantified achievements in document order (Phase 5 recruiter UX). */
export function topQuantifiedAchievements(impacts: AchievementFact[], limit = 5): AchievementFact[] {
  return impacts.filter((item) => item.metrics.length > 0).slice(0, limit);
}
