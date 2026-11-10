import type { LegalPageKey } from "@/features/workspaces/legal-settings-actions";

/** Keys under `labels.workspaces.legal.pages`, resolved with `t` at render. */
export const LEGAL_PAGE_LABEL_KEYS: Record<LegalPageKey, string> = {
  privacyPolicy: "privacyPolicy",
  termsOfService: "termsOfService",
  cookiePolicy: "cookiePolicy",
  candidateNotice: "candidateNotice",
  aiTransparencyNotice: "aiTransparencyNotice",
};
