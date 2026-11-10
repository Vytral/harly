/**
 * Electronic-signature disclosure shown to every external signer before they
 * sign. The version string is stored with the (server-stamped) consent
 * timestamp so an auditor can tell exactly which wording was accepted. The
 * wording itself lives in the `labels.esign.consent` catalog; the version
 * string does not change when a translation is updated.
 *
 * This file is imported by client components: keep it free of server-only code.
 */
export const ESIGN_CONSENT_VERSION = "esign-2026-10";

/** Message keys under `labels.esign.consent.points`, in display order. */
export const ESIGN_DISCLOSURE_POINT_IDS = [
  "legalEffect",
  "paperCopy",
  "withdraw",
  "requirements",
  "evidence",
] as const;

export type EsignDisclosurePointId = (typeof ESIGN_DISCLOSURE_POINT_IDS)[number];

/** Public legal pages (served by the workspace's public site). */
export const ESIGN_TERMS_PATH = "/legal/terms-of-service";
export const ESIGN_PRIVACY_PATH = "/legal/privacy-policy";
