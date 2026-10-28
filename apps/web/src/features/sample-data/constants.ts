/**
 * Sample data is clearly synthetic on purpose. Candidate emails use a reserved
 * `.invalid` domain (RFC 2606), which can never receive mail, and the job title
 * carries a visible "Sample ·" prefix so it can not be mistaken for a real role.
 */
export const SAMPLE_EMAIL_DOMAIN = "sample.invalid";

export const SAMPLE_JOB_TITLE = "Sample · Senior Product Engineer";
export const SAMPLE_JOB_SLUG_BASE = "sample-senior-product-engineer";
export const SAMPLE_SOURCE = "Sample data";

/** Entity types written by a sample batch, in the order removal must respect. */
export const SAMPLE_ENTITY_TYPES = [
  "job",
  "job_stage",
  "candidate",
  "application",
  "application_stage_history",
  "candidate_note",
  "interview",
] as const;

export type SampleEntityType = (typeof SAMPLE_ENTITY_TYPES)[number];

export function isSampleEmailAddress(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${SAMPLE_EMAIL_DOMAIN}`);
}
