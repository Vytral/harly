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

/**
 * Validates a portal submission against the persisted job configuration.
 * The client is never trusted to decide which fields/questions are valid.
 */
export function validatePortalApplication(input: PortalApplicationInput):
  | { ok: true; answers: Record<string, string> }
  | { ok: false; error: string } {
  if (input.resumeRequired && !input.resumeKey) {
    return { ok: false, error: "Resume is required." };
  }

  if (
    input.resumeKey &&
    !isWorkspaceStorageKey(input.workspaceId, input.resumeKey, "resumes")
  ) {
    return { ok: false, error: "Resume upload is invalid." };
  }

  const answers: Record<string, string> = {};
  for (const question of input.questions) {
    const value = input.answers[question.key]?.trim() ?? "";
    if (question.required && !value) {
      return { ok: false, error: "This question is required." };
    }
    if (question.minLength && value && value.length < question.minLength) {
      return {
        ok: false,
        error: `Enter at least ${question.minLength} characters.`,
      };
    }
    if (question.type === "url" && value) {
      try {
        if (new URL(value).protocol !== "https:") throw new Error();
      } catch {
        return { ok: false, error: "Enter a valid URL." };
      }
    }
    if (question.type === "select" && value) {
      const options = Array.isArray(question.options)
        ? question.options.filter((option): option is string => typeof option === "string")
        : [];
      if (!options.includes(value)) {
        return { ok: false, error: "Select a valid option." };
      }
    }
    if (value) answers[question.key] = value;
  }

  return { ok: true, answers };
}
