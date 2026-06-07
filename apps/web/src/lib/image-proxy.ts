/**
 * Routes external image URLs (e.g. Google OAuth avatars) through our own
 * `/api/image-proxy`, so the browser loads them same-origin. Some providers
 * (notably Google's photo CDN) return responses that Chrome's Opaque
 * Response Blocking rejects when fetched cross-origin from an `<img>`.
 * Same-origin / relative URLs (our own storage) are returned unchanged.
 */
export function proxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.protocol !== "https:") return url;

  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
