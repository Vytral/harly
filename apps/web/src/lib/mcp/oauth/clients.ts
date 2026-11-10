import "server-only";

import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";

import { db, mcpOauthClients } from "@harly/db";

import { MCP_CIMD_CACHE_TTL_S, MCP_DCR_CLIENT_PREFIX, MCP_DCR_UNUSED_TTL_S } from "./config";
import {
  ClientMetadataError,
  assertValidCimdClientId,
  fetchClientMetadataDocument,
  isCimdClientId,
  sanitizeClientName,
  type ClientMetadata,
} from "./cimd";
import { createLogger } from "@/lib/logger";

import { generateOpaqueToken } from "./crypto";
import { matchKnownClient, type KnownClientMatch } from "./known-clients";
import { MAX_REDIRECT_URIS, validateRedirectUriForRegistration } from "./redirect";

const log = createLogger("mcp-oauth");

export type ResolvedOAuthClient = ClientMetadata & {
  source: "dcr" | "cimd";
  known: KnownClientMatch;
};

function toResolved(
  source: "dcr" | "cimd",
  meta: ClientMetadata,
): ResolvedOAuthClient {
  return { ...meta, source, known: matchKnownClient(meta) };
}

/**
 * Resolve a client_id to its registration: a CIMD URL is fetched (SSRF-safe)
 * and cached for an hour, anything else must be a live DCR registration.
 * Returns null when the client is unknown, expired, blocked or invalid.
 */
export async function resolveOAuthClient(clientId: string): Promise<ResolvedOAuthClient | null> {
  if (!clientId || clientId.length > 2048) return null;
  const now = new Date();

  const [cached] = await db
    .select()
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.clientId, clientId))
    .limit(1);
  if (cached?.blockedAt) return null;

  if (isCimdClientId(clientId)) {
    if (cached && cached.expiresAt && cached.expiresAt > now) {
      return toResolved("cimd", {
        clientId,
        name: cached.name,
        redirectUris: cached.redirectUris,
        logoUri: cached.logoUri,
        clientUri: cached.clientUri,
      });
    }
    try {
      assertValidCimdClientId(clientId);
      const meta = await fetchClientMetadataDocument(clientId);
      const expiresAt = new Date(now.getTime() + MCP_CIMD_CACHE_TTL_S * 1000);
      await db
        .insert(mcpOauthClients)
        .values({
          clientId,
          source: "cimd",
          name: meta.name,
          redirectUris: meta.redirectUris,
          logoUri: meta.logoUri,
          clientUri: meta.clientUri,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: mcpOauthClients.clientId,
          set: {
            name: meta.name,
            redirectUris: meta.redirectUris,
            logoUri: meta.logoUri,
            clientUri: meta.clientUri,
            expiresAt,
          },
        });
      return toResolved("cimd", meta);
    } catch (error) {
      if (error instanceof ClientMetadataError) {
        // The page shows fixed copy; the log carries the real reason.
        log.warn({ clientId: clientId.slice(0, 200), reason: error.message }, "oauth client metadata document rejected");
        return null;
      }
      throw error;
    }
  }

  if (!cached || cached.source !== "dcr") return null;
  if (cached.expiresAt && cached.expiresAt <= now) return null;
  return toResolved("dcr", {
    clientId,
    name: cached.name,
    redirectUris: cached.redirectUris,
    logoUri: cached.logoUri,
    clientUri: cached.clientUri,
  });
}

export type DcrRegistration = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  issuedAt: number;
};

export class DcrError extends Error {
  constructor(
    readonly code: "invalid_redirect_uri" | "invalid_client_metadata",
    message: string,
  ) {
    super(message);
    this.name = "DcrError";
  }
}

/** Pure validation of an RFC 7591 request body into storable values. */
export function parseDcrRequest(body: unknown): { name: string; redirectUris: string[]; logoUri: string | null; clientUri: string | null } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DcrError("invalid_client_metadata", "Request body must be a JSON object.");
  }
  const input = body as Record<string, unknown>;
  const uris = input.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    throw new DcrError("invalid_redirect_uri", `redirect_uris must list 1 to ${MAX_REDIRECT_URIS} URIs.`);
  }
  for (const uri of uris) {
    if (typeof uri !== "string") throw new DcrError("invalid_redirect_uri", "redirect_uris must be strings.");
    const problem = validateRedirectUriForRegistration(uri);
    if (problem) throw new DcrError("invalid_redirect_uri", problem);
  }
  // RFC 7591 section 2: a server may ignore or substitute metadata it does not
  // support instead of refusing. Real clients send extras (client_credentials,
  // implicit, client_secret_post...); we always answer with what we actually
  // do (public client, code + refresh), and the token endpoint enforces it.
  for (const field of ["grant_types", "response_types"] as const) {
    const value = input[field];
    if (value !== undefined && !Array.isArray(value)) {
      throw new DcrError("invalid_client_metadata", `${field} must be an array of strings.`);
    }
  }
  const grantTypes = input.grant_types as unknown[] | undefined;
  if (grantTypes && grantTypes.length > 0 && !grantTypes.includes("authorization_code")) {
    throw new DcrError("invalid_client_metadata", "grant_types must include authorization_code; this server only issues tokens through the authorization code flow.");
  }
  const responseTypes = input.response_types as unknown[] | undefined;
  if (responseTypes && responseTypes.length > 0 && !responseTypes.includes("code")) {
    throw new DcrError("invalid_client_metadata", "response_types must include code.");
  }
  const rawName = typeof input.client_name === "string" ? sanitizeClientName(input.client_name) : "";
  const https = (value: unknown) => {
    if (typeof value !== "string" || value.length > 2048) return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
    } catch {
      return null;
    }
  };
  return {
    name: rawName || "Unnamed application",
    redirectUris: [...new Set(uris as string[])],
    logoUri: https(input.logo_uri),
    clientUri: https(input.client_uri),
  };
}

export async function registerDcrClient(body: unknown): Promise<DcrRegistration> {
  const parsed = parseDcrRequest(body);
  const clientId = generateOpaqueToken(MCP_DCR_CLIENT_PREFIX);
  const now = new Date();
  await db.insert(mcpOauthClients).values({
    clientId,
    source: "dcr",
    name: parsed.name,
    redirectUris: parsed.redirectUris,
    logoUri: parsed.logoUri,
    clientUri: parsed.clientUri,
    // Dropped if nobody ever completes an authorization with it.
    expiresAt: new Date(now.getTime() + MCP_DCR_UNUSED_TTL_S * 1000),
  });
  return {
    clientId,
    clientName: parsed.name,
    redirectUris: parsed.redirectUris,
    issuedAt: Math.floor(now.getTime() / 1000),
  };
}

/** A used DCR client no longer expires; it is kept while grants reference it. */
export async function markClientUsed(clientId: string): Promise<void> {
  await db
    .update(mcpOauthClients)
    .set({ lastUsedAt: new Date(), expiresAt: null })
    .where(and(eq(mcpOauthClients.clientId, clientId), eq(mcpOauthClients.source, "dcr")));
  await db
    .update(mcpOauthClients)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(mcpOauthClients.clientId, clientId), eq(mcpOauthClients.source, "cimd")));
}

/** Opportunistic cleanup, called when new clients register. */
export async function purgeExpiredClients(): Promise<void> {
  const now = new Date();
  await db
    .delete(mcpOauthClients)
    .where(
      and(
        eq(mcpOauthClients.source, "dcr"),
        isNotNull(mcpOauthClients.expiresAt),
        lt(mcpOauthClients.expiresAt, now),
        isNull(mcpOauthClients.lastUsedAt),
      ),
    );
  // Stale CIMD cache rows are harmless but pointless after a day.
  await db
    .delete(mcpOauthClients)
    .where(
      and(
        eq(mcpOauthClients.source, "cimd"),
        or(lt(mcpOauthClients.expiresAt, new Date(now.getTime() - 24 * 3600 * 1000))),
      ),
    );
}

export type ClientFailureReason = "client_unknown" | "client_expired" | "client_blocked" | "client_metadata_unverifiable";

/**
 * Why a client_id did not resolve, for logs and the (fixed-copy) error page.
 * Only called after `resolveOAuthClient` returned null.
 */
export async function explainClientFailure(clientId: string): Promise<ClientFailureReason> {
  if (isCimdClientId(clientId)) return "client_metadata_unverifiable";
  const [row] = await db
    .select({ source: mcpOauthClients.source, expiresAt: mcpOauthClients.expiresAt, blockedAt: mcpOauthClients.blockedAt })
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.clientId, clientId))
    .limit(1);
  if (!row || row.source !== "dcr") return "client_unknown";
  if (row.blockedAt) return "client_blocked";
  if (row.expiresAt && row.expiresAt <= new Date()) return "client_expired";
  return "client_unknown";
}
