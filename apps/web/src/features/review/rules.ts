/**
 * Review-queue rules: pure, no I/O, safe to import from client components.
 *
 * "My review queue" is the set of ACTIVE applications that sit in a
 * review-type stage (stage kind `screening` or `interview`, never the display
 * name) where the CURRENT USER has not submitted a scorecard for that
 * application at its CURRENT stage. Other people's scorecards do not clear it.
 * An interview-stage application with no interview on the books has nothing to
 * give feedback on yet; it needs scheduling instead and is not in the queue.
 */

export const REVIEW_STAGE_KINDS = ["screening", "interview"] as const;
export type ReviewStageKind = (typeof REVIEW_STAGE_KINDS)[number];

/** An active application currently in a review-type stage. */
export type ReviewStageRow = {
  applicationId: string;
  stageId: string;
  stageName: string;
  kind: ReviewStageKind;
  /** At least one non-canceled interview exists for the application. */
  hasInterview: boolean;
};

/** A scorecard the current user authored. */
export type MyScorecard = {
  applicationId: string | null;
  stageId: string | null;
  stageName: string | null;
};

const byStageId = (applicationId: string, stageId: string) => `${applicationId}::id:${stageId}`;
// Scorecards written before stage ids were stored (or whose stage row was
// later removed) only carry the stage name.
const byStageName = (applicationId: string, stageName: string) =>
  `${applicationId}::name:${stageName}`;

/** Index of the scorecards the current user already submitted. */
export function indexMyScorecards(scorecards: readonly MyScorecard[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const card of scorecards) {
    if (!card.applicationId) continue;
    if (card.stageId) keys.add(byStageId(card.applicationId, card.stageId));
    else if (card.stageName) keys.add(byStageName(card.applicationId, card.stageName));
  }
  return keys;
}

function reviewedByMe(row: ReviewStageRow, mine: ReadonlySet<string>): boolean {
  return (
    mine.has(byStageId(row.applicationId, row.stageId)) ||
    mine.has(byStageName(row.applicationId, row.stageName))
  );
}

/** The current user owes a review: screening, or interview with something to review. */
export function isPendingMyReview(row: ReviewStageRow, mine: ReadonlySet<string>): boolean {
  if (row.kind === "interview" && !row.hasInterview) return false;
  return !reviewedByMe(row, mine);
}

/** Interview stage, but no interview has been scheduled yet. */
export function needsScheduling(row: ReviewStageRow): boolean {
  return row.kind === "interview" && !row.hasInterview;
}

/** The review queue itself. Candidates open in queue mode from here. */
export const REVIEW_QUEUE_HREF = "/dashboard/candidates?queue=review";

/** A candidate's application, opened in queue mode. */
export function reviewApplicationHref(candidateId: string, applicationId: string): string {
  return `/dashboard/candidates/${candidateId}?queue=review&application=${applicationId}`;
}
