import type { useTranslations } from "next-intl";

export type GraphValidationIssue = {
  nodeId: string;
  fieldPath: string;
  /** English fallback. Stored with the graph and used by agents and logs. */
  message: string;
  /** Stable key under `graphValidation.` for the UI to translate `message`. */
  code?: string;
  values?: Record<string, string | number>;
};

/**
 * Renders a validation issue for people. Pass a translator rooted at
 * `labels.automations`. Issues without a code keep their English message.
 */
export function translateIssueMessage(
  issue: { message: string; code?: string; values?: Record<string, string | number> },
  t: ReturnType<typeof useTranslations>,
): string {
  return issue.code ? t(`graphValidation.${issue.code}`, issue.values) : issue.message;
}
