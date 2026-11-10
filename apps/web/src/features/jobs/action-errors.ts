/**
 * Stable codes for job action failures. Server code returns the code next to a
 * translated message (`jobs.errors.<code>`); the UI branches on the code and
 * never on the message text.
 */
export const JOB_ACTION_ERROR_CODES = [
  "jobNotFound",
  "jobNotInTrash",
  "hasApplications",
  "pendingApproval",
  "invalidHiringTeamRole",
  "memberNotInWorkspace",
  "addMemberFailed",
  "updateRoleFailed",
  "removeMemberFailed",
  "titleRequired",
  "aiDraftNotConfigured",
  "aiQuestionsNotConfigured",
  "aiGenerationFailed",
  "descriptionRequired",
] as const;

export type JobActionErrorKey = (typeof JOB_ACTION_ERROR_CODES)[number];

/** Narrow a returned or thrown job action code to a known message key. */
export function getJobActionErrorKey(
  code: string | null | undefined,
): JobActionErrorKey | null {
  if (!code) return null;
  return (JOB_ACTION_ERROR_CODES as readonly string[]).includes(code)
    ? (code as JobActionErrorKey)
    : null;
}
