import { describe, expect, it } from "vitest";

import { buildQuestionAnswerRows } from "./questions";

describe("buildQuestionAnswerRows", () => {
  it("maps configured question answers to persisted rows", () => {
    const rows = buildQuestionAnswerRows({
      applicationId: "00000000-0000-0000-0000-000000000001",
      workspaceId: "00000000-0000-0000-0000-000000000002",
      questions: [
        {
          id: "portfolio",
          label: "Portfolio",
          type: "url",
          required: true,
          dbId: "00000000-0000-0000-0000-000000000003",
        },
      ],
      answers: {
        portfolio: "https://example.com",
      },
    });

    expect(rows).toEqual([
      {
        applicationId: "00000000-0000-0000-0000-000000000001",
        workspaceId: "00000000-0000-0000-0000-000000000002",
        questionId: "00000000-0000-0000-0000-000000000003",
        answer: "https://example.com",
      },
    ]);
  });
});
