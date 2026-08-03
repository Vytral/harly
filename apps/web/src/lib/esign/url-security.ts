import type { EsignConfigLike } from "@/lib/esign/client";

/**
 * DocuSeal returns artifact URLs in the submission payload. They are data, not
 * trusted destinations: only the configured DocuSeal origin may receive the
 * workspace API token. Relative URLs are resolved against that same origin.
 */
export function trustedDocusealArtifactUrl(
  ctx: Pick<EsignConfigLike, "baseUrl" | "apiUrl">,
  value: string,
): string | null {
  let candidate: URL;
  let base: URL;
  try {
    base = new URL(ctx.baseUrl);
    candidate = new URL(value, base);
  } catch {
    return null;
  }

  if (
    (candidate.protocol !== "https:" && candidate.protocol !== "http:") ||
    candidate.username ||
    candidate.password ||
    candidate.origin !== base.origin
  ) {
    return null;
  }

  return candidate.toString();
}
