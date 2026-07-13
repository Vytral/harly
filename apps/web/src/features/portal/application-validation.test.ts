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
});
