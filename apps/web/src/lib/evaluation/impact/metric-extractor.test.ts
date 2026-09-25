import { describe, expect, it } from "vitest";

import {
  extractAchievementImpacts,
  extractImpactMetrics,
  topQuantifiedAchievements,
} from "./metric-extractor";
import { parseResumeFacts } from "../ats-parser";
import type { TextProvenance } from "../ats-parser";

const provenance: TextProvenance = { sourceType: "resume", rawText: "test" };

describe("Phase 5 — metric patterns (§13.1)", () => {
  it("extracts percentages with direction from verb cues", () => {
    const [metric] = extractImpactMetrics("Cut blended CAC 28% by reallocating spend.", provenance);
    expect(metric).toMatchObject({ type: "percentage", rawText: "28%", numericValue: 28, unit: "%", direction: "decrease" });
  });
  it("extracts multipliers", () => {
    const [metric] = extractImpactMetrics("Grew pipeline 3.2x in 18 months.", provenance);
    expect(metric).toMatchObject({ type: "multiplier", rawText: "3.2x", numericValue: 3.2, direction: "increase" });
  });
  it("extracts currency scale as neutral, not as success", () => {
    const [metric] = extractImpactMetrics("Managed a $2M budget across channels.", provenance);
    expect(metric).toMatchObject({ type: "currency", numericValue: 2_000_000, direction: "neutral" });
  });
  it("extracts volumes, counts, and timeframes", () => {
    const text = "Handling 2M requests/day with 80k users; shipped in 18 months; managed 12 engineers.";
    const types = extractImpactMetrics(text, provenance).map((m) => m.type);
    expect(types).toContain("volume");
    expect(types).toContain("count");
    expect(types).toContain("duration");
  });
  it("records quantified movement without claiming goodness (§13.3)", () => {
    // Negative outcome, honestly quantified: direction describes movement only.
    const [metric] = extractImpactMetrics("Errors increased by 40% after launch.", provenance);
    expect(metric).toMatchObject({ type: "percentage", direction: "increase" });
    expect(metric).not.toHaveProperty("positive");
    expect(metric).not.toHaveProperty("good");
  });
  it("returns no metrics for metric-free prose (no fabrication)", () => {
    expect(extractImpactMetrics("Coordinated warehouse scheduling and vendor follow-ups.", provenance)).toEqual([]);
  });
  it("collapses overlapping spans to the most specific pattern", () => {
    // "3.2x in 18 months" must not double-count the timeframe number as a count.
    const metrics = extractImpactMetrics("Grew pipeline 3.2x in 18 months.", provenance);
    expect(metrics.map((m) => m.type).sort()).toEqual(["duration", "multiplier"]);
  });
});

describe("Phase 5 — achievement facts (§13.2)", () => {
  const resume = `Isabella Rossi
isabella@example.com

EXPERIENCE
Growth Marketing Manager — Nimbus Labs (2023-Present)
• Grew pipeline 3.2x in 18 months through SEO.
• Cut blended CAC 28% by reallocating spend.
• Launched a content engine with weekly posts.
`;
  it("links metrics to positions with provenance", () => {
    const impacts = extractAchievementImpacts(parseResumeFacts(resume, "2024-06-01"));
    expect(impacts.length).toBe(3);
    expect(impacts[0]!.metrics.length).toBe(2);
    expect(impacts[0]!.positionId).toBe("role:1");
    expect(impacts[0]!.metrics[0]!.provenance.sourceType).toBe("resume");
    expect(impacts[2]!.metrics).toEqual([]);
  });
  it("topQuantifiedAchievements keeps document order, capped", () => {
    const impacts = extractAchievementImpacts(parseResumeFacts(resume, "2024-06-01"));
    const top = topQuantifiedAchievements(impacts, 1);
    expect(top.length).toBe(1);
    expect(top[0]!.text).toContain("3.2x");
  });
});
