import { describe, expect, it } from "vitest";

import { parseDocumentFacts, parseResumeFacts } from "../ats-parser";
import { assessTextReadability, fromPlainText } from "./document";

describe("Phase 4 preparation — document provider seam (§6)", () => {
  it("wraps plain text as ordered blocks with stable ids", () => {
    const doc = fromPlainText({ fileName: "cv.pdf", text: "Ana Torres\n\nSenior Backend Engineer\nPython" });
    expect(doc.extractionMethod).toBe("text_layer");
    expect(doc.extractionConfidence).toBe(1);
    expect(doc.plainText).toContain("Ana Torres");
    expect(doc.blocks.map((b) => b.text)).toEqual([
      "Ana Torres",
      "Senior Backend Engineer",
      "Python",
    ]);
    expect(doc.blocks.map((b) => b.id)).toEqual(["block:0", "block:1", "block:2"]);
    expect(doc.blocks.map((b) => b.order)).toEqual([0, 1, 2]);
    expect(doc.diagnostics).toEqual([]);
  });

  it("reports empty input honestly instead of fabricating blocks", () => {
    const doc = fromPlainText({ text: "   \n  \n" });
    expect(doc.blocks).toEqual([]);
    expect(doc.extractionConfidence).toBe(0);
    expect(doc.diagnostics.length).toBeGreaterThan(0);
  });

  it("leaves language detection undefined until Phase 4 provides it", () => {
    const doc = fromPlainText({ text: "EXPERIENCIA\nIngeniero Backend" });
    expect(doc.detectedLanguage).toBeUndefined();
  });
});

describe("Phase 4 — text-layer readability gate (§6.3)", () => {
  const readableResume = `Ana Torres
Senior Backend Engineer

EXPERIENCE
Backend Developer — ShopLine (2019-2022)
• Built REST APIs in Python.
`;
  it("accepts normal extracted resumes", () => {
    expect(assessTextReadability(readableResume)).toEqual({ readable: true, reasons: [] });
  });
  it("rejects empty output with reasons", () => {
    const result = assessTextReadability("   \n ");
    expect(result.readable).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
  it("rejects garbled binary extraction", () => {
    const garbage = "\u0000\u0001\u0002 %%% <<<>>> /// \\\\ {{{}}} ### $$$ ??? @@ ~~~ *** +++ === |||";
    expect(garbage.trim().length).toBeGreaterThanOrEqual(50);
    expect(assessTextReadability(garbage).readable).toBe(false);
  });
});

describe("Phase 4 — document parse path (§6.1, §6.2)", () => {
  const resumeText = `Sam Dev
sam@example.com

EXPERIENCE
Backend Developer — Acme Corp (2020 - 2023)
• Built APIs using Python.

SKILLS
• Python, Docker
`;
  it("parses identically to the text path on single-column content", () => {
    const fromText = parseResumeFacts(resumeText, "2024-06-01");
    const fromDoc = parseDocumentFacts(fromPlainText({ text: resumeText }), "2024-06-01");
    expect(fromDoc.workHistory.map((r) => [r.title, r.company, r.startYear, r.endYear])).toEqual(
      fromText.workHistory.map((r) => [r.title, r.company, r.startYear, r.endYear]),
    );
    expect(fromDoc.totalWorkDurationMonths).toBe(fromText.totalWorkDurationMonths);
    expect(fromDoc.declaredSkills.map((s) => s.name)).toEqual(
      fromText.declaredSkills.map((s) => s.name),
    );
    expect(fromDoc.extractionMethod).toBe("text_layer");
  });
  it("attaches block/page provenance to every fact", () => {
    const fromDoc = parseDocumentFacts(fromPlainText({ text: resumeText }), "2024-06-01");
    const role = fromDoc.workHistory[0]!;
    expect(role.provenance.blockId).toMatch(/^block:\d+$/);
    expect(role.provenance.pageNumber).toBe(1);
    expect(role.achievements[0]!.provenance.blockId).toBeDefined();
    expect(fromDoc.declaredSkills[0]!.provenance.blockId).toBeDefined();
  });

  it("persists provider diagnostics and lowers timeline confidence for unreadable input", () => {
    const doc = {
      ...fromPlainText({ text: "" }),
      plainText: "",
      blocks: [],
      extractionMethod: "profile_only" as const,
      extractionConfidence: 0,
      diagnostics: ["ocr unavailable"],
    };
    const facts = parseDocumentFacts(doc, "2024-06-01");
    expect(facts.documentDiagnostics).toEqual(["ocr unavailable"]);
    expect(facts.workTimelineConfidence).toBe("low");
    expect(facts.workHistory).toEqual([]);
  });
  it("honors block order regardless of input order (reading order, §6.2)", () => {
    const doc = fromPlainText({ text: resumeText });
    const shuffled = { ...doc, blocks: [...doc.blocks].reverse() };
    const ordered = parseDocumentFacts(doc, "2024-06-01");
    const fromShuffled = parseDocumentFacts(shuffled, "2024-06-01");
    expect(JSON.stringify(fromShuffled)).toBe(JSON.stringify(ordered));
  });
});
