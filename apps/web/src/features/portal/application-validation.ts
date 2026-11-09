import { isWorkspaceStorageKey } from "@/lib/storage-validation";

type PortalQuestion = {
  id: string;
  key: string;
  type: string;
  required: boolean;
  minLength: number | null;
  options: unknown;
};

type PortalApplicationInput = {
  workspaceId: string;
  resumeRequired: boolean;
  resumeKey?: string;
  answers: Record<string, string>;
  questions: readonly PortalQuestion[];
};

/** Stable codes; the caller turns them into localized messages. */
export type PortalApplicationValidationError =
  | { ok: false; code: "resumeRequired" | "resumeInvalid" | "questionRequired" | "consentRequired" | "invalidUrl" | "invalidOption" }
  | { ok: false; code: "minLength"; min: number };

/**
 * Validates a portal submission against the persisted job configuration.
 * The client is never trusted to decide which fields/questions are valid.
 */
export function validatePortalApplication(input: PortalApplicationInput):
  | { ok: true; answers: Record<string, string> }
  | PortalApplicationValidationError {
  if (input.resumeRequired && !input.resumeKey) {
    return { ok: false, code: "resumeRequired" };
  }

  if (
    input.resumeKey &&
    !isWorkspaceStorageKey(input.workspaceId, input.resumeKey, "resumes")
  ) {
    return { ok: false, code: "resumeInvalid" };
  }

  const answers: Record<string, string> = {};
  for (const question of input.questions) {
    if (question.type === "info") continue;

    const value = input.answers[question.key]?.trim() ?? "";
    if (question.required && !value) {
      return { ok: false, code: "questionRequired" };
    }
    if (question.type === "consent" && question.required && value !== "agree") {
      return { ok: false, code: "consentRequired" };
    }
    if (question.minLength && value && value.length < question.minLength) {
      return { ok: false, code: "minLength", min: question.minLength };
    }
    if (question.type === "url" && value) {
      try {
        if (new URL(value).protocol !== "https:") throw new Error();
      } catch {
        return { ok: false, code: "invalidUrl" };
      }
    }
    if (question.type === "select" && value) {
      const options = Array.isArray(question.options)
        ? question.options.filter((option): option is string => typeof option === "string")
        : [];
      if (!options.includes(value)) {
        return { ok: false, code: "invalidOption" };
      }
    }
    if (value) answers[question.key] = value;
  }

  return { ok: true, answers };
}
