import "server-only";

import { getHarlyPublicOrigin } from "@/lib/public-origin";

/** Access tokens are short-lived; clients refresh 5 minutes before expiry. */
export const MCP_ACCESS_TOKEN_TTL_S = 15 * 60;
/** Refresh token lifetime per rotation (idle timeout). */
export const MCP_REFRESH_IDLE_TTL_S = 30 * 24 * 60 * 60;
/** Absolute cap on a grant, however often it refreshes. */
export const MCP_GRANT_MAX_TTL_S = 90 * 24 * 60 * 60;
export const MCP_AUTH_CODE_TTL_S = 60;
/** DCR registrations never used for an authorization expire after this. */
export const MCP_DCR_UNUSED_TTL_S = 30 * 24 * 60 * 60;
/** CIMD metadata cache lifetime. */
export const MCP_CIMD_CACHE_TTL_S = 60 * 60;
/**
 * A rotated refresh token replayed within this window is a client retry after a
 * lost response, not theft: refuse it without killing the grant.
 */
export const MCP_REFRESH_REPLAY_LEEWAY_MS = 10_000;

export const MCP_ACCESS_TOKEN_PREFIX = "hmat_";
export const MCP_REFRESH_TOKEN_PREFIX = "hmrt_";
export const MCP_AUTH_CODE_PREFIX = "hmac_";
export const MCP_DCR_CLIENT_PREFIX = "hmc_";

/** The instance's issuer: the public origin (no path), never the Host header. */
export function mcpIssuer(): string {
  return getHarlyPublicOrigin();
}

/** Canonical protected resource (RFC 8707 audience) for the MCP endpoint. */
export function mcpResource(): string {
  return `${getHarlyPublicOrigin()}/mcp`;
}

export function mcpResourceMetadataUrl(): string {
  return `${getHarlyPublicOrigin()}/.well-known/oauth-protected-resource/mcp`;
}
