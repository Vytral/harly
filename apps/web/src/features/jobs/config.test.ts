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
      // Legacy `profileLinksEnabled: true` is migrated to per-link booleans.
      profileLinks: { linkedin: true, github: true, website: true },
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
