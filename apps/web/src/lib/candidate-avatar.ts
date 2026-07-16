import "server-only";

import { githubAvatarUrl } from "@/lib/github";
import { gravatarUrl } from "@/lib/gravatar";

export function candidateAvatarFallbackSrcs(email: string | null, githubUrl: string | null) {
  return [
    email ? gravatarUrl(email) : null,
    githubAvatarUrl(githubUrl),
  ].filter((value): value is string => Boolean(value));
}
