export type TemplateType =
  | "general"
  | "interview_invite"
  | "rejection"
  | "offer"
  | "screening"
  | "stage_change";

/** Template types that map 1:1 to a system auto-email trigger (can be "activated"). */
export const SYSTEM_TEMPLATE_TYPES = [
  "stage_change",
  "rejection",
  "offer",
  "interview_invite",
] as const satisfies readonly TemplateType[];

export type EmailTemplateItem = {
  id: string;
  name: string;
  type: TemplateType;
  subject: string;
  body: string;
  isActive: boolean;
  updatedAt: string;
};
