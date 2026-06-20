"use client";

import { Turnstile } from "@marsidev/react-turnstile";

/**
 * Renders the Cloudflare Turnstile challenge. The site key is resolved
 * server-side (workspace key, falling back to the global env var) and passed in;
 * when null, nothing renders and the form submits without a challenge.
 *
 * The widget injects a hidden `cf-turnstile-response` input into the enclosing
 * form, so the token rides along on normal submit — no callback needed.
 */
export function TurnstileWidget({ siteKey }: { siteKey: string | null }) {
  if (!siteKey) return null;
  return <Turnstile siteKey={siteKey} />;
}
