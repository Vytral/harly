import "server-only";

import { createHash } from "crypto";

/**
 * Gravatar URL for an email. Uses `d=404` so missing avatars fail to load,
 * letting <UserAvatar> fall back to initials.
 */
export function gravatarUrl(email: string, size = 80): string {
  const hash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
}
