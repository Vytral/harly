import "server-only";

import { isBlockedHost } from "@/lib/ssrf";

/**
 * Allowed `baseUrl` hosts per provider. A custom `baseUrl` must live on the
 * provider's own domain (or localhost when explicitly opted in) so a workspace
 * admin can't point the model client at an arbitrary server to exfiltrate
 * prompts/PII, nor at an internal/metadata endpoint (SSRF). See IA-03.
 */
const PROVIDER_HOSTS: Record<string, string[]> = {
  openai: ["api.openai.com"],
  anthropic: ["api.anthropic.com"],
  google: ["generativelanguage.googleapis.com"],
  xai: ["api.x.ai"],
  openrouter: ["openrouter.ai"],
};

/**
 * Validate a user-supplied AI `baseUrl`. Throws on any value that is not a
 * https URL on the provider's own host, points at a blocked (loopback /
 * private / link-local / metadata) host, or , unless local LLMs are enabled ,
 * resolves to localhost. `undefined` is allowed (use the provider default).
 */
export function assertSafeAiBaseUrl(provider: string, baseUrl: string | undefined): void {
  if (!baseUrl) return;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Invalid AI baseUrl.");
  }

  const hostname = parsed.hostname.toLowerCase();

  // SSRF guard first: reject loopback / private / link-local / metadata hosts
  // regardless of protocol. Local LLMs are only permitted when explicitly opted
  // in, and bypass this block.
  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    hostname === "::1";
  if (isLocal) {
    if (process.env.HARLY_ALLOW_LOCAL_LLM === "1") return;
    throw new Error("Local AI baseUrl requires HARLY_ALLOW_LOCAL_LLM=1.");
  }

  if (isBlockedHost(hostname)) {
    throw new Error("AI baseUrl points to a blocked host.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("AI baseUrl must use https.");
  }

  const allowed = PROVIDER_HOSTS[provider];
  if (allowed && !allowed.includes(hostname)) {
    throw new Error(`AI baseUrl must be a ${provider} host (e.g. ${allowed[0]}).`);
  }
}
