import { describe, expect, it } from "vitest";

import { extractResumeAutofillFields } from "./resume-autofill";

describe("extractResumeAutofillFields", () => {
  it("extracts basic contact fields from resume text", () => {
    const result = extractResumeAutofillFields({
      fileName: "ada-lovelace-resume.pdf",
      text: `
        Ada Lovelace
        ada@example.com
        +56 9 1234 5678
        Santiago, Chile
        https://linkedin.com/in/ada
        https://github.com/ada
        https://ada.dev
      `,
    });

    expect(result).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+56 9 1234 5678",
      location: "Santiago, Chile",
      linkedinUrl: "https://linkedin.com/in/ada",
      githubUrl: "https://github.com/ada",
      websiteUrl: "https://ada.dev",
    });
  });

  it("falls back to filename for candidate name", () => {
    const result = extractResumeAutofillFields({
      fileName: "grace-hopper-cv.pdf",
      text: "",
    });

    expect(result.firstName).toBe("Grace");
    expect(result.lastName).toBe("Hopper");
  });

  it("extracts skills from the lexicon and job keywords without false positives", () => {
    const result = extractResumeAutofillFields({
      fileName: "dev.pdf",
      text: "Built apps with React, TypeScript, Drizzle and PostgreSQL. Also C++ and .NET.",
      jobKeywords: ["Drizzle", "Kubernetes"],
    });

    expect(result.skills).toContain("React");
    expect(result.skills).toContain("TypeScript");
    expect(result.skills).toContain("PostgreSQL");
    expect(result.skills).toContain("C++");
    expect(result.skills).toContain(".NET");
    // Job keyword present in text is detected; absent one is not.
    expect(result.skills).toContain("Drizzle");
    expect(result.skills).not.toContain("Kubernetes");
    // "TypeScript" must not also register a bare "Java" match.
    expect(result.skills).not.toContain("Java");
  });

  it("infers experience from an explicit phrase", () => {
    const result = extractResumeAutofillFields({
      fileName: "x.pdf",
      text: "Senior engineer with 7+ years of experience leading teams.",
    });

    expect(result.experienceYears).toBe(7);
  });

  it("infers experience from a date range when no phrase exists", () => {
    const result = extractResumeAutofillFields({
      fileName: "x.pdf",
      text: "Software Engineer, Acme Corp (2018 - present).",
      referenceYear: 2025,
    });

    expect(result.experienceYears).toBe(7);
  });

  it("detects the highest education level (ES/EN)", () => {
    expect(
      extractResumeAutofillFields({
        fileName: "x.pdf",
        text: "Master of Science in Computer Science, MIT.",
      }).education,
    ).toBe("Master's degree");

    expect(
      extractResumeAutofillFields({
        fileName: "x.pdf",
        text: "Licenciatura en Ingeniería Informática.",
      }).education,
    ).toBe("Bachelor's degree");
  });

  it("returns no enriched fields for empty text", () => {
    const result = extractResumeAutofillFields({ fileName: "x.pdf", text: "" });
    expect(result.skills).toBeUndefined();
    expect(result.experienceYears).toBeUndefined();
    expect(result.education).toBeUndefined();
  });
});
