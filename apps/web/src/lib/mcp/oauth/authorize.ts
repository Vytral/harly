import "server-only";

import { randomUUID } from "node:crypto";

import { db, mcpAuthorizationCodes, mcpGrants } from "@harly/db";

import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

import {
  MCP_AUTH_CODE_PREFIX,
  MCP_AUTH_CODE_TTL_S,
  MCP_GRANT_MAX_TTL_S,
  mcpIssuer,
  mcpResource,
} from "./config";
import { explainClientFailure, markClientUsed, resolveOAuthClient, type ResolvedOAuthClient } from "./clients";
import { generateOpaqueToken, isValidCodeChallenge, sha256Hex } from "./crypto";
import { buildRedirect, matchRedirectUri, redirectDisplayHost } from "./redirect";
import { parseRequestedScopes } from "./scopes";
import type { McpScope } from "../types";

const log = createLogger("mcp-oauth");

export type ValidAuthorizeRequest = {
  client: ResolvedOAuthClient;
  redirectUri: string;
  state: string | undefined;
  scopes: McpScope[];
  resource: string;
  codeChallenge: string;
};

export type AuthorizeFailure =
  /**
   * client_id / redirect_uri are untrusted: show an error page, never redirect
   * (RFC 6749 section 4.1.2.1). `reason` is a fixed code the page maps to copy.
   */
  | { kind: "page"; error: string; description: string; reason: AuthorizePageReason }
  /** Safe to report back to the client's redirect_uri. */
  | { kind: "redirect"; redirectUri: string; state: string | undefined; error: string; description: string };

export type AuthorizePageReason =
  | "client_id_missing"
  | "client_unknown"
  | "client_expired"
  | "client_blocked"
  | "client_metadata_unverifiable"
  | "redirect_uri_missing"
  | "redirect_uri_mismatch";

export type AuthorizeValidation =
  | { ok: true; request: ValidAuthorizeRequest }
  | ({ ok: false } & AuthorizeFailure);

/** Trailing slash is not significant for the audience. */
export function normalizeResource(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Does the client's `resource` name this server's MCP endpoint? The host is
 * case-insensitive, and the bare origin counts too: some clients send the
 * server origin they were pointed at instead of the full /mcp URL.
 */
export function resourceMatches(requested: string, canonical: string): boolean {
  if (normalizeResource(requested) === normalizeResource(canonical)) return true;
  try {
    const want = new URL(canonical);
    const got = new URL(requested);
    if (got.search || got.hash || got.origin.toLowerCase() !== want.origin.toLowerCase()) return false;
    const path = normalizeResource(got.pathname);
    return path === "" || path === normalizeResource(want.pathname);
  } catch {
    return false;
  }
}

function pageFailure(reason: AuthorizePageReason, error: string, description: string, extra: Record<string, unknown> = {}): AuthorizeValidation {
  log.warn({ reason, ...extra }, "oauth authorize refused");
  return { ok: false, kind: "page", error, description, reason };
}

const CLIENT_FAILURE_COPY: Record<string, string> = {
  client_unknown: "This application is not registered with this Harly instance. Remove the connection in the app and add it again so it registers itself.",
  client_expired: "This application's registration expired. Remove the connection in the app and add it again.",
  client_blocked: "This application has been blocked by an administrator.",
  client_metadata_unverifiable: "This application's client metadata document could not be fetched or verified.",
};

export async function validateAuthorizeRequest(
  params: URLSearchParams,
  deps: { resolveClient?: (clientId: string) => Promise<ResolvedOAuthClient | null>; resource?: string } = {},
): Promise<AuthorizeValidation> {
  const resolveClient = deps.resolveClient ?? resolveOAuthClient;
  const canonicalResource = deps.resource ?? mcpResource();
  const get = (key: string) => params.get(key) ?? undefined;

  const clientId = get("client_id");
  if (!clientId) return pageFailure("client_id_missing", "invalid_request", "client_id is required.");
  const client = await resolveClient(clientId);
  if (!client) {
    const reason = deps.resolveClient ? "client_unknown" : await explainClientFailure(clientId).catch(() => "client_unknown" as const);
    // The client_id is public (it travels in the URL); it is safe to log, truncated.
    return pageFailure(reason, "invalid_client", CLIENT_FAILURE_COPY[reason] ?? CLIENT_FAILURE_COPY.client_unknown!, { clientId: clientId.slice(0, 80) });
  }
  const redirectUri = get("redirect_uri");
  if (!redirectUri) return pageFailure("redirect_uri_missing", "invalid_request", "redirect_uri is required.", { clientId: clientId.slice(0, 80) });
  if (!matchRedirectUri(redirectUri, client.redirectUris)) {
    return pageFailure(
      "redirect_uri_mismatch",
      "invalid_request",
      "redirect_uri does not match the application's registration.",
      { clientId: clientId.slice(0, 80), requestedHost: redirectDisplayHost(redirectUri), registeredHosts: client.redirectUris.map(redirectDisplayHost) },
    );
  }
  const state = get("state");
  const fail = (error: string, description: string): AuthorizeValidation => ({
    ok: false,
    kind: "redirect",
    redirectUri,
    state,
    error,
    description,
  });

  if (get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  const codeChallenge = get("code_challenge");
  if (!codeChallenge || !isValidCodeChallenge(codeChallenge)) {
    return fail("invalid_request", "A valid PKCE code_challenge is required.");
  }
  if (get("code_challenge_method") !== "S256") return fail("invalid_request", "code_challenge_method must be S256.");

  const resource = get("resource");
  if (resource !== undefined && !resourceMatches(resource, canonicalResource)) {
    log.warn({ reason: "resource_mismatch", clientId: client.clientId.slice(0, 80), resource: resource.slice(0, 200), expected: canonicalResource }, "oauth authorize refused");
    return fail("invalid_target", `resource must be ${canonicalResource}.`);
  }
  const scopes = parseRequestedScopes(get("scope"));
  if (!scopes) return fail("invalid_scope", "None of the requested scopes are supported.");

  return { ok: true, request: { client, redirectUri, state, scopes, resource: canonicalResource, codeChallenge } };
}

/** Errors are returned on the redirect URI with `iss` (RFC 9207). */
export function failureRedirectUrl(failure: Extract<AuthorizeFailure, { kind: "redirect" }>): string {
  return buildRedirect(failure.redirectUri, {
    error: failure.error,
    error_description: failure.description,
    state: failure.state,
    iss: mcpIssuer(),
  });
}

export function deniedRedirectUrl(request: ValidAuthorizeRequest): string {
  return buildRedirect(request.redirectUri, {
    error: "access_denied",
    error_description: "The user denied the request.",
    state: request.state,
    iss: mcpIssuer(),
  });
}

/**
 * Persist the user's approval as a grant plus a single-use code and return the
 * URL to send the browser to. Callers have already checked the user's session,
 * workspace policy and `mcp:use`.
 */
export async function approveAuthorization(input: {
  request: ValidAuthorizeRequest;
  grantedScopes: McpScope[];
  workspaceId: string;
  userId: string;
  ip?: string;
}): Promise<string> {
  const { request } = input;
  const now = Date.now();
  const grantId = randomUUID();
  const code = generateOpaqueToken(MCP_AUTH_CODE_PREFIX);

  await db.insert(mcpGrants).values({
    id: grantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    clientId: request.client.clientId,
    clientName: request.client.name,
    clientHost: redirectDisplayHost(request.redirectUri),
    scopes: input.grantedScopes,
    expiresAt: new Date(now + MCP_GRANT_MAX_TTL_S * 1000),
  });
  await db.insert(mcpAuthorizationCodes).values({
    codeHash: sha256Hex(code),
    grantId,
    clientId: request.client.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    scopes: input.grantedScopes,
    expiresAt: new Date(now + MCP_AUTH_CODE_TTL_S * 1000),
  });
  await markClientUsed(request.client.clientId);
  await logAuditEvent({
    workspaceId: input.workspaceId,
    actorId: input.userId,
    action: "mcp.consent.granted",
    resourceType: "mcp_grant",
    resourceId: grantId,
    ipAddress: input.ip,
    metadata: {
      clientId: request.client.clientId,
      clientName: request.client.name,
      redirectHost: redirectDisplayHost(request.redirectUri),
      scopes: input.grantedScopes.join(" "),
      verifiedClient: request.client.known?.label ?? null,
    },
  });

  return buildRedirect(request.redirectUri, { code, state: request.state, iss: mcpIssuer() });
}

export async function recordConsentDenied(input: {
  request: ValidAuthorizeRequest;
  workspaceId: string;
  userId: string;
  ip?: string;
  reason?: string;
}) {
  await logAuditEvent({
    workspaceId: input.workspaceId,
    actorId: input.userId,
    action: "mcp.consent.denied",
    resourceType: "mcp_client",
    resourceId: input.request.client.clientId,
    ipAddress: input.ip,
    severity: input.reason ? "warning" : "info",
    metadata: {
      clientId: input.request.client.clientId,
      clientName: input.request.client.name,
      reason: input.reason ?? "user_denied",
    },
  });
}
