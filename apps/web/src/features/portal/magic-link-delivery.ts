/**
 * How a portal magic link leaves the server. The console fallback exists only
 * so local development works without a mail provider; it must be impossible in
 * production, where a link in the logs would be a working sign-in credential.
 */
export type MagicLinkDelivery = "send" | "log" | "drop";

/** RFC 2606 / 6761 reserved domains never receive real mail. */
export function isReservedTestEmail(email: string): boolean {
  return /\.(test|example|invalid|localhost)$/i.test(email.split("@")[1] ?? "");
}

export function magicLinkDelivery(input: {
  nodeEnv: string | undefined;
  hasSender: boolean;
  email: string;
}): MagicLinkDelivery {
  const production = input.nodeEnv === "production";
  if (!production && (!input.hasSender || isReservedTestEmail(input.email))) return "log";
  if (input.hasSender) return "send";
  return "drop";
}
