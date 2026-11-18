/**
 * Sample data is clearly synthetic on purpose. Candidate emails use a reserved
 * `.invalid` domain (RFC 2606), which can never receive mail. Sample rows
 * are tracked separately so they can be removed safely.
 */
export const SAMPLE_EMAIL_DOMAIN = "careers.example";
const LEGACY_SAMPLE_EMAIL_DOMAIN = "sample.invalid";

/** Legacy prefix remains recognized when removing older sample batches. */
export const SAMPLE_TITLE_PREFIX = "Sample ·";
export const SAMPLE_JOB_TITLE = "Senior Product Engineer";

export function isSampleJobTitle(title: string): boolean {
  return title === SAMPLE_JOB_TITLE || title.startsWith(SAMPLE_TITLE_PREFIX);
}
export const SAMPLE_JOB_SLUG_BASE = "sample-senior-product-engineer";
export const SAMPLE_SOURCE = "Referral";

/** Entity types written by a sample batch, in the order removal must respect. */
export const SAMPLE_ENTITY_TYPES = [
  "job",
  "job_stage",
  "candidate",
  "application",
  "application_stage_history",
  "candidate_note",
  "candidate_file",
  "candidate_evaluation",
  "interview",
] as const;

export type SampleEntityType = (typeof SAMPLE_ENTITY_TYPES)[number];

export function isSampleEmailAddress(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").at(-1);
  return domain === SAMPLE_EMAIL_DOMAIN || domain === LEGACY_SAMPLE_EMAIL_DOMAIN;
}
