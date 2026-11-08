import "server-only";

import { isBlockedHost } from "@/lib/ssrf";

import { isLocalLlmAllowed } from "./local-llm";
import { getProvider } from "./providers";

function isLoopbackName(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

function hostAllowed(hostname: string, allowed: string[]): boolean {
  return allowed.some((entry) => {
    if (entry === "*") return true;
    if (entry.startsWith(".")) return hostname.endsWith(entry);
    return hostname === entry;
  });
}

/**
 * Validate a user-supplied AI `baseUrl`. This is the only gate between a
 * workspace admin and the server's outbound network, so it stays strict:
 *
 * - Hosted providers only accept their own domain(s), so prompts and candidate
 *   data can't be pointed at an arbitrary server.
 * - Generic providers (OpenAI-compatible, Ollama) accept any public https host.
 * - Loopback / private / link-local / metadata hosts are blocked unless the
 *   operator sets HARLY_ALLOW_LOCAL_LLM=1. Private LAN addresses are further
 *   limited to providers that declare `allowPrivateHosts`.
 *
 * `undefined` / empty means "use the provider default". Messages are shown
 * verbatim in the settings UI, so they say what to do next.
 */
export function assertSafeAiBaseUrl(
  provider: string,
  baseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!baseUrl) return;

  const info = getProvider(provider);
  if (!info) throw new Error("Unknown AI provider.");

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Invalid endpoint. Enter a full URL such as https://llm.example.com/v1.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Endpoint must start with https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Remove the username and password from the endpoint URL.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const localAllowed = isLocalLlmAllowed(env);

  if (isLoopbackName(hostname)) {
    if (localAllowed) return;
    throw new Error(
      "Local endpoints are disabled. Set HARLY_ALLOW_LOCAL_LLM=1 on the server to use localhost.",
    );
  }

  if (isBlockedHost(hostname)) {
    if (info.allowPrivateHosts && localAllowed) return;
    if (info.allowPrivateHosts) {
      throw new Error(
        "Private network endpoints are disabled. Set HARLY_ALLOW_LOCAL_LLM=1 on the server to use a LAN address.",
      );
    }
    throw new Error(
      `Host not allowed for ${info.label}: private and internal addresses are blocked. Use the OpenAI-compatible provider for a LAN server.`,
    );
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Endpoint must use https:// (plain http is only allowed for local servers).");
  }

  if (!hostAllowed(hostname, info.allowedHosts)) {
    const examples = info.allowedHosts.join(", ");
    throw new Error(
      `Host not allowed for ${info.label} (${hostname}). Expected ${examples}. To use your own gateway or proxy, choose the OpenAI-compatible provider.`,
    );
  }
}
