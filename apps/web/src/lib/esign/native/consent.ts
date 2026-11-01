/**
 * Electronic-signature disclosure shown to every external signer before they
 * sign. The version string is stored with the (server-stamped) consent
 * timestamp so an auditor can tell exactly which wording was accepted.
 *
 * This file is imported by client components: keep it free of server-only code.
 */
export const ESIGN_CONSENT_VERSION = "esign-2026-10";

export const ESIGN_DISCLOSURE_TITLE = "Sign electronically";

export const ESIGN_DISCLOSURE_POINTS = [
  "Your electronic signature has the same legal effect as a handwritten one where the law allows it.",
  "You can ask the sender for a paper copy, or to sign on paper instead. If you do, stop here and decline below.",
  "You can withdraw your consent before you sign by closing this page or choosing Decline. Withdrawing after you have signed does not undo the signature.",
  "You need a device with a modern browser and an email address to receive your copy.",
  "Harly records the time, your IP address and browser, the document fingerprint and what you entered, as evidence of your signature.",
] as const;

export const ESIGN_CONSENT_STATEMENT =
  "I have read the disclosure above. I agree to use an electronic signature and to receive this document electronically, and I confirm that the signature I add is mine.";

/** Public legal pages (served by the workspace's public site). */
export const ESIGN_TERMS_PATH = "/legal/terms-of-service";
export const ESIGN_PRIVACY_PATH = "/legal/privacy-policy";
