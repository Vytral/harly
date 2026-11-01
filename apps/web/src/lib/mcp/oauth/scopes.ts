import { MCP_SCOPES, type McpScope } from "../types";

/** Scopes that carry no data access; accepted and ignored. */
const PASSTHROUGH_SCOPES = new Set(["offline_access", "openid", "profile", "email"]);

export const MCP_SCOPES_SUPPORTED: readonly string[] = [...MCP_SCOPES, "offline_access"];

/**
 * Parse the space-delimited `scope` parameter. No scope requested = every scope
 * the workspace allows. Unknown names are dropped; a request that names scopes
 * but none we support is rejected (`null`).
 */
export function parseRequestedScopes(raw: string | null | undefined): McpScope[] | null {
  const tokens = (raw ?? "").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...MCP_SCOPES];
  const known = new Set<McpScope>();
  for (const token of tokens) {
    if ((MCP_SCOPES as readonly string[]).includes(token)) known.add(token as McpScope);
  }
  if (known.size === 0 && tokens.every((t) => PASSTHROUGH_SCOPES.has(t))) return [...MCP_SCOPES];
  return known.size === 0 ? null : MCP_SCOPES.filter((s) => known.has(s));
}

/** Intersect with the workspace policy; scopes can only narrow. */
export function clampScopes(requested: readonly McpScope[], allowed: readonly McpScope[]): McpScope[] {
  return requested.filter((scope) => allowed.includes(scope));
}
