import "server-only";

import { randomUUID } from "node:crypto";

import { db, mcpAuthorizationCodes, mcpGrants } from "@harly/db";

import { logAuditEvent } from "@/lib/audit-log";

import {
  MCP_AUTH_CODE_PREFIX,
  MCP_AUTH_CODE_TTL_S,
  MCP_GRANT_MAX_TTL_S,
  mcpIssuer,
  mcpResource,
} from "./config";
import { markClientUsed, resolveOAuthClient, type ResolvedOAuthClient } from "./clients";
import { generateOpaqueToken, isValidCodeChallenge, sha256Hex } from "./crypto";
import { buildRedirect, matchRedirectUri, redirectDisplayHost } from "./redirect";
import { parseRequestedScopes } from "./scopes";
import type { McpScope } from "../types";

export type ValidAuthorizeRequest = {
  client: ResolvedOAuthClient;
  redirectUri: string;
  state: string | undefined;
  scopes: McpScope[];
  resource: string;
  codeChallenge: string;
};

export type AuthorizeFailure =
  /** client_id / redirect_uri are untrusted: show an error page, never redirect. */
  | { kind: "page"; error: string; description: string }
  /** Safe to report back to the client's redirect_uri. */
  | { kind: "redirect"; redirectUri: string; state: string | undefined; error: string; description: string };

export type AuthorizeValidation =
  | { ok: true; request: ValidAuthorizeRequest }
  | ({ ok: false } & AuthorizeFailure);

/** Trailing slash is not significant for the audience. */
export function normalizeResource(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function validateAuthorizeRequest(
  params: URLSearchParams,
  deps: { resolveClient?: (clientId: string) => Promise<ResolvedOAuthClient | null>; resource?: string } = {},
): Promise<AuthorizeValidation> {
  const resolveClient = deps.resolveClient ?? resolveOAuthClient;
  const canonicalResource = deps.resource ?? mcpResource();
  const get = (key: string) => params.get(key) ?? undefined;

  const clientId = get("client_id");
  if (!clientId) return { ok: false, kind: "page", error: "invalid_request", description: "client_id is required." };
  const client = await resolveClient(clientId);
  if (!client) {
    return { ok: false, kind: "page", error: "invalid_client", description: "This application is not registered or its metadata could not be verified." };
  }
  const redirectUri = get("redirect_uri");
  if (!redirectUri || !matchRedirectUri(redirectUri, client.redirectUris)) {
    return { ok: false, kind: "page", error: "invalid_request", description: "redirect_uri does not match the application's registration." };
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
  if (resource !== undefined && normalizeResource(resource) !== normalizeResource(canonicalResource)) {
    return fail("invalid_target", "resource must be this server's MCP endpoint.");
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
