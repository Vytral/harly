import { describe, expect, it } from "vitest";

import {
  defaultJobApplicationConfig,
  normalizeJobApplicationConfig,
  parseJobApplicationQuestions,
} from "./config";

describe("normalizeJobApplicationConfig", () => {
  it("uses safe defaults when no config exists", () => {
    expect(normalizeJobApplicationConfig(null)).toEqual(
      defaultJobApplicationConfig,
    );
  });

  it("keeps enabled profile links and optional resume setting", () => {
    expect(
      normalizeJobApplicationConfig({
        resumeRequired: false,
        profileLinksEnabled: true,
        questions: [],
      }),
    ).toMatchObject({
      resumeRequired: false,
      // Legacy `profileLinksEnabled: true` migrates to per-link {enabled, required}.
      profileLinks: {
        linkedin: { enabled: true, required: false },
        github: { enabled: true, required: false },
        website: { enabled: true, required: false },
      },
      sections: {
        profile: {
          resume: { visibility: "optional" },
          education: { visibility: "optional" },
          experience: { visibility: "optional" },
        },
      },
    });
  });

  it("accepts the new sections shape", () => {
    expect(
      normalizeJobApplicationConfig({
        sections: {
          personal: {
            phone: "required",
            address: "optional",
            photo: "disabled",
            headline: "optional",
          },
          profile: {
            resume: "required",
            education: "optional",
            experience: "required",
            linkedinUrl: "disabled",
            githubUrl: "optional",
            websiteUrl: "required",
          },
          details: {
            coverLetter: "required",
          },
        },
        questions: [],
      }),
    ).toMatchObject({
      sections: {
        personal: {
          phone: { visibility: "required" },
        },
        profile: {
          education: { visibility: "optional" },
          experience: { visibility: "required" },
          websiteUrl: { visibility: "required" },
        },
        details: {
          coverLetter: { visibility: "required" },
        },
      },
      profileLinks: {
        linkedin: { enabled: false, required: false },
        github: { enabled: true, required: false },
        website: { enabled: true, required: true },
      },
    });
  });
});

describe("parseJobApplicationQuestions", () => {
  it("parses configured questions from JSON", () => {
    const questions = parseJobApplicationQuestions(
      JSON.stringify([
        {
          id: "portfolio",
          label: "Portfolio URL",
          type: "url",
          required: true,
          placeholder: "https://example.com",
        },
        {
          id: "level",
          label: "Seniority",
          type: "select",
          required: false,
          options: ["Junior", "Senior"],
        },
      ]),
    );

    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      id: "portfolio",
      type: "url",
      required: true,
    });
  });

  it("drops invalid select questions without options", () => {
    const questions = parseJobApplicationQuestions(
      JSON.stringify([
        {
          id: "level",
          label: "Seniority",
          type: "select",
          required: true,
          options: [],
        },
      ]),
    );

    expect(questions).toEqual([]);
  });
});
