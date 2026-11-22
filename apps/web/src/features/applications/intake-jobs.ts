import "server-only";

import { scheduleAutoDuplicateCheck } from "@/features/applications/auto-duplicates";
import { scheduleApplicationResumeParse } from "@/features/applications/auto-resume-parse";
import { scheduleAutoScore } from "@/features/applications/auto-score";

/**
 * How long auto-scoring waits for the resume parse. The intake routes run
 * `after()` work inside a 60 second budget, so scoring must start well before
 * that even when the AI provider is slow.
 */
export const RESUME_PARSE_WAIT_MS = 20_000;

/**
 * Background work after a public application is stored. The duplicate check
 * starts right away. Auto-scoring waits for the resume parse so the score can
 * use the parsed profile, but never longer than `RESUME_PARSE_WAIT_MS`.
 */
export async function runApplicationIntakeJobs(input: {
  applicationId: string;
  candidateId: string;
  workspaceId: string;
}): Promise<void> {
  const parse = scheduleApplicationResumeParse(input.candidateId, input.workspaceId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const parseOrDeadline = Promise.race([
    parse,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, RESUME_PARSE_WAIT_MS);
    }),
  ]).finally(() => clearTimeout(timer));

  await Promise.allSettled([
    parse,
    scheduleAutoDuplicateCheck(input.candidateId, input.workspaceId),
    parseOrDeadline.then(() =>
      scheduleAutoScore(input.applicationId, input.workspaceId),
    ),
  ]);
}
