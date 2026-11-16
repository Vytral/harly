/**
 * Honeypot for public application forms. Real people never see or fill the
 * hidden field; naive bots fill every input. Shared by the hosted forms, the
 * embed widget and the server-side checks so the field name cannot drift.
 */
export const HONEYPOT_FIELD = "_hp";

export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
