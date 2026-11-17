/** Kinds of AI-drafted candidate email, shared by the drawer and its server action. */
export const EMAIL_DRAFT_TYPES = [
  "screening",
  "interview_invite",
  "rejection",
  "offer",
  "followup",
] as const;

export type EmailDraftType = (typeof EMAIL_DRAFT_TYPES)[number];
