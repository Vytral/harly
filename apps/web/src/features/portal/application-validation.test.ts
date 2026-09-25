import { describe, expect, it } from "vitest";

import { validatePortalApplication } from "./application-validation";

const workspaceId = "workspace_1";
const questions = [
  {
    id: "question-1",
    key: "work_authorization",
    type: "select",
    required: true,
    minLength: null,
    options: ["Yes", "No"],
  },
];

describe("validatePortalApplication", () => {
  it("rejects a required resume when no workspace-scoped upload was supplied", () => {
    expect(
      validatePortalApplication({
        workspaceId,
        resumeRequired: true,
        resumeKey: undefined,
        answers: { work_authorization: "Yes" },
        questions,
      }),
    ).toEqual({ ok: false, error: "Resume is required." });
  });

  it("rejects unknown answers and invalid select values", () => {
    expect(
      validatePortalApplication({
        workspaceId,
        resumeRequired: false,
        answers: { work_authorization: "Maybe", injected: "value" },
        questions,
      }),
    ).toEqual({ ok: false, error: "Select a valid option." });
  });

  it("accepts only configured answers and a workspace-scoped resume", () => {
    expect(
      validatePortalApplication({
        workspaceId,
        resumeRequired: true,
        resumeKey: "workspaces/workspace_1/resumes/upload/cv.pdf",
        answers: { work_authorization: "Yes" },
        questions,
      }),
    ).toEqual({ ok: true, answers: { work_authorization: "Yes" } });
  });

  it("requires agreement for a required consent question and ignores info blocks", () => {
    const consentQuestions = [
      {
        id: "agreement-row",
        key: "agreement",
        type: "consent",
        required: true,
        minLength: null,
        options: ["agree", "disagree"],
      },
      {
        id: "info-row",
        key: "mission",
        type: "info",
        required: true,
        minLength: null,
        options: [],
      },
    ];

    expect(
      validatePortalApplication({
        workspaceId,
        resumeRequired: false,
        answers: { agreement: "disagree" },
        questions: consentQuestions,
      }),
    ).toEqual({
      ok: false,
      error: "You must agree to continue with your application.",
    });
    expect(
      validatePortalApplication({
        workspaceId,
        resumeRequired: false,
        answers: { agreement: "agree" },
        questions: consentQuestions,
      }),
    ).toEqual({ ok: true, answers: { agreement: "agree" } });
  });
});
