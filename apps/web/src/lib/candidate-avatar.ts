import "server-only";

import { githubAvatarUrl } from "@/lib/github";
import { gravatarUrl } from "@/lib/gravatar";

/**
 * Fallback picture URLs for a candidate without an uploaded photo, in the order
 * they are tried. The Gravatar URL is only built, and so the email hash only
 * leaves the server, when the workspace has opted in.
 */
export function candidateAvatarFallbackSrcs(
  email: string | null,
  githubUrl: string | null,
  options: { gravatarEnabled: boolean },
) {
  return [
    options.gravatarEnabled && email ? gravatarUrl(email) : null,
    githubAvatarUrl(githubUrl),
  ].filter((value): value is string => Boolean(value));
}
