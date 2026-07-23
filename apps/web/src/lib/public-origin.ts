import "server-only";

const DEFAULT_PUBLIC_ORIGIN = "http://localhost:3000";

/**
 * Return the canonical origin that external providers must redirect to.
 *
 * HARLY_URL is the source of truth for production. The legacy public alias is
 * retained only for older deployments while they migrate their environment.
 */
export function getHarlyPublicOrigin(): string {
  const configured =
    process.env.HARLY_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    DEFAULT_PUBLIC_ORIGIN;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("HARLY_URL must be an absolute HTTP(S) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("HARLY_URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("HARLY_URL must be a public origin without credentials or query parameters.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("HARLY_URL must use HTTPS in production.");
  }

  return url.origin;
}

/** Inbound DocuSeal webhook base. `?ws=` + `?secret=` are appended per workspace. */
export function getEsignWebhookBaseUrl(): string {
  return `${getHarlyPublicOrigin()}/api/integrations/docuseal/webhook`;
}
