import "server-only";

import { isBlockedHost, safeFetchHttp } from "@/lib/ssrf";

import { MAX_REDIRECT_URIS, validateRedirectUriForRegistration } from "./redirect";

/**
 * Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document):
 * the client_id is an https URL; we fetch the JSON it serves and treat it as
 * the client's registration. The URL is attacker-chosen, so the fetch goes
 * through the SSRF-safe pinned transport, never follows redirects, is size and
 * time bounded, and the document must name itself.
 */

export const CIMD_MAX_BYTES = 64 * 1024;
export const CIMD_TIMEOUT_MS = 5_000;

export type ClientMetadata = {
  clientId: string;
  name: string;
  redirectUris: string[];
  logoUri: string | null;
  clientUri: string | null;
};

export class ClientMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientMetadataError";
  }
}

export function isCimdClientId(clientId: string): boolean {
  return clientId.startsWith("https://");
}

/** Syntactic + host checks that need no network. Throws ClientMetadataError. */
export function assertValidCimdClientId(clientId: string): URL {
  if (clientId.length > 2048) throw new ClientMetadataError("client_id URL is too long");
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new ClientMetadataError("client_id is not a valid URL");
  }
  if (url.protocol !== "https:") throw new ClientMetadataError("client_id URL must use https");
  if (url.username || url.password) throw new ClientMetadataError("client_id URL must not contain credentials");
  if (url.hash) throw new ClientMetadataError("client_id URL must not contain a fragment");
  if (url.pathname === "/" || url.pathname === "") {
    throw new ClientMetadataError("client_id URL must include a path");
  }
  if (url.pathname.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new ClientMetadataError("client_id URL must not contain dot segments");
  }
  if (url.port && url.port !== "443") throw new ClientMetadataError("client_id URL must use the default https port");
  if (isBlockedHost(url.hostname)) throw new ClientMetadataError("client_id host is not allowed");
  // Bare IP literals have no reputation to display; require a DNS name.
  if (/^[\d.]+$/.test(url.hostname) || url.hostname.startsWith("[")) {
    throw new ClientMetadataError("client_id host must be a domain name");
  }
  // Must round-trip: guards against normalisation tricks (case, dot segments).
  if (url.href !== clientId) throw new ClientMetadataError("client_id URL must be in canonical form");
  return url;
}

function optionalHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Validate a parsed metadata document against the URL it was served from. */
export function parseClientMetadataDocument(clientId: string, doc: unknown): ClientMetadata {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new ClientMetadataError("metadata document must be a JSON object");
  }
  const body = doc as Record<string, unknown>;
  if (body.client_id !== clientId) {
    throw new ClientMetadataError("metadata client_id does not match the document URL");
  }
  for (const forbidden of ["client_secret", "client_secret_expires_at", "registration_access_token"]) {
    if (forbidden in body) throw new ClientMetadataError(`metadata must not contain ${forbidden}`);
  }
  const method = body.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") {
    throw new ClientMetadataError("only token_endpoint_auth_method \"none\" is supported");
  }
  // Real documents list grants this server never issues (Claude: jwt-bearer,
  // VS Code: device_code). As with DCR (RFC 7591 section 2) we ignore what we
  // don't support; the token endpoint only ever runs code + refresh anyway.
  // The client must still be able to use the authorization code flow.
  const grantTypes = body.grant_types;
  if (grantTypes !== undefined) {
    if (!Array.isArray(grantTypes) || !grantTypes.every((g) => typeof g === "string")) {
      throw new ClientMetadataError("grant_types must be an array of strings");
    }
    if (grantTypes.length > 0 && !grantTypes.includes("authorization_code")) {
      throw new ClientMetadataError("grant_types must include authorization_code");
    }
  }
  const responseTypes = body.response_types;
  if (responseTypes !== undefined) {
    if (!Array.isArray(responseTypes) || !responseTypes.every((t) => typeof t === "string")) {
      throw new ClientMetadataError("response_types must be an array of strings");
    }
    if (responseTypes.length > 0 && !responseTypes.includes("code")) {
      throw new ClientMetadataError("response_types must include code");
    }
  }
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
    throw new ClientMetadataError(`redirect_uris must list 1 to ${MAX_REDIRECT_URIS} URIs`);
  }
  for (const uri of redirectUris) {
    if (typeof uri !== "string") throw new ClientMetadataError("redirect_uris must be strings");
    const problem = validateRedirectUriForRegistration(uri);
    if (problem) throw new ClientMetadataError(problem);
  }
  const rawName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const fallbackName = new URL(clientId).hostname;
  return {
    clientId,
    name: sanitizeClientName(rawName) || fallbackName,
    redirectUris: [...new Set(redirectUris as string[])],
    logoUri: optionalHttpsUrl(body.logo_uri),
    clientUri: optionalHttpsUrl(body.client_uri),
  };
}

/** Single line, no control/bidi characters, bounded: shown on the consent page. */
export function sanitizeClientName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export async function fetchClientMetadataDocument(clientId: string): Promise<ClientMetadata> {
  assertValidCimdClientId(clientId);
  let response: Response;
  try {
    response = await safeFetchHttp(clientId, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": "Harly-MCP-AS/1" },
      signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
    });
  } catch {
    throw new ClientMetadataError("client metadata document could not be fetched");
  }
  if (response.status !== 200) {
    throw new ClientMetadataError(`client metadata document returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType)) {
    throw new ClientMetadataError("client metadata document must be application/json");
  }
  const text = await readBounded(response, CIMD_MAX_BYTES);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ClientMetadataError("client metadata document is not valid JSON");
  }
  return parseClientMetadataDocument(clientId, json);
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ClientMetadataError("client metadata document is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
