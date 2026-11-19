import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { outputLanguageRule, withOutputLanguage } from "./guardrails";

describe("output language rule", () => {
  it("names the source and forbids defaulting to English", () => {
    const rule = outputLanguageRule("the job posting");
    expect(rule).toContain("same language as the job posting");
    expect(rule).toMatch(/Do not switch to English/);
    expect(withOutputLanguage("Base prompt.", "the resume")).toBe(
      `Base prompt.\n\n${outputLanguageRule("the resume")}`,
    );
  });

  // Every AI surface that returns text for people must follow the source
  // language (#135). A new surface that forgets the rule fails here.
  it.each([
    "detect-duplicates",
    "draft-email",
    "generate-interview-brief",
    "generate-job",
    "generate-questions",
    "mailbox-assistance",
    "parse-resume",
    "refine-scorecard",
    "score-candidate",
    "suggest-scorecard-attributes",
    "summarize-interview-notes",
    "summarize-pipeline",
  ])("%s applies the output language rule", (surface) => {
    const source = readFileSync(
      path.join(__dirname, "..", "surfaces", `${surface}.ts`),
      "utf8",
    );
    expect(source).toMatch(/withOutputLanguage\(|outputLanguageRule\(/);
  });
});
