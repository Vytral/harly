import { describe, expect, it } from "vitest";

import {
  ANONYMIZATION_BLOCKED_MESSAGES,
  ANONYMIZED_CANDIDATE_LABEL,
  AiAnonymizationBlockedError,
  assertAnonymizationAllows,
  buildCandidateAiContext,
  isAiAnonymizationBlockedError,
  redactForAi,
  resolveCandidateIdentity,
} from "./candidate-context";

const candidate = {
  fullName: "Ada Lovelace",
  headline: "Analyst at Ada Lovelace Labs, ada@labs.example",
  location: "Lisbon, Portugal",
  skills: ["React", "Ada Lovelace"],
  experienceYears: 7,
  resumeText:
    "Ada Lovelace\nada@example.com | +44 20 7946 0958\nlinkedin.com/in/ada-lovelace\n221B Baker Street\nLed Ada's analytics team 2019-2021.",
  answers: [{ question: "Why us?", answer: "Ada: I admire the mission. Email me at ada@example.com." }],
};

describe("buildCandidateAiContext", () => {
  it("passes everything through unchanged when anonymization is off", () => {
    const ctx = buildCandidateAiContext(candidate, { anonymize: false });
    expect(ctx.label).toBe("Ada Lovelace");
    expect(ctx.anonymized).toBe(false);
    expect(ctx.location).toBe("Lisbon, Portugal");
    expect(ctx.resumeText).toContain("ada@example.com");
    expect(ctx.answers[0]?.answer).toContain("ada@example.com");
  });

  it("replaces the name with the stable alias and drops location when anonymized", () => {
    const ctx = buildCandidateAiContext(candidate, { anonymize: true });
    expect(ctx.label).toBe(ANONYMIZED_CANDIDATE_LABEL);
    expect(ctx.anonymized).toBe(true);
    expect(ctx.location).toBeNull();
  });

  it("removes every identity string from the anonymized context", () => {
    const ctx = buildCandidateAiContext(candidate, { anonymize: true });
    // `identity` is kept for redacting other text and is never placed in a prompt.
    const promptVisible = { ...ctx, identity: undefined };
    const everything = JSON.stringify(promptVisible);
    for (const forbidden of [
      "Ada",
      "Lovelace",
      "ada@",
      "example.com",
      "labs.example",
      "7946",
      "linkedin",
      "Baker Street",
      "Lisbon",
    ]) {
      expect(everything).not.toContain(forbidden);
    }
  });

  it("keeps skills, experience and the non-identifying parts of the résumé", () => {
    const ctx = buildCandidateAiContext(candidate, { anonymize: true });
    expect(ctx.skills).toEqual(["React", expect.stringMatching(/^•+$/)]);
    expect(ctx.experienceYears).toBe(7);
    expect(ctx.resumeText).toContain("Led");
    expect(ctx.resumeText).toContain("analytics team");
    expect(ctx.resumeText).toContain("2019-2021");
  });

  it("redacts the answers' question and answer text", () => {
    const ctx = buildCandidateAiContext(candidate, { anonymize: true });
    expect(ctx.answers[0]?.answer).not.toMatch(/Ada|ada@/);
    expect(ctx.answers[0]?.answer).toContain("I admire the mission.");
  });

  it("derives the identity from fullName when first and last name are missing", () => {
    expect(resolveCandidateIdentity({ fullName: "Maria de la Cruz" })).toEqual({
      firstName: "Maria",
      lastName: "Cruz",
      fullName: "Maria de la Cruz",
    });
    expect(resolveCandidateIdentity({ firstName: "Grace", lastName: "Hopper" })).toEqual({
      firstName: "Grace",
      lastName: "Hopper",
      fullName: "Grace Hopper",
    });
  });
});

describe("redactForAi", () => {
  it("returns the text untouched when anonymization is off", () => {
    expect(redactForAi("Ada wrote it", { fullName: "Ada Lovelace" }, false)).toBe("Ada wrote it");
  });

  it("redacts the text when anonymization is on", () => {
    expect(redactForAi("Ada wrote it", { fullName: "Ada Lovelace" }, true)).not.toContain("Ada");
  });
});

describe("assertAnonymizationAllows", () => {
  it("allows the call when anonymization is off or unset", () => {
    expect(() => assertAnonymizationAllows({}, "blocked")).not.toThrow();
    expect(() => assertAnonymizationAllows({ resumeAnonymization: false }, "blocked")).not.toThrow();
  });

  it("throws a user-facing error when anonymization is on", () => {
    let caught: unknown;
    try {
      assertAnonymizationAllows({ resumeAnonymization: true }, ANONYMIZATION_BLOCKED_MESSAGES.emailDraft);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AiAnonymizationBlockedError);
    expect(isAiAnonymizationBlockedError(caught)).toBe(true);
    expect((caught as Error).message).toBe(ANONYMIZATION_BLOCKED_MESSAGES.emailDraft);
  });
});
