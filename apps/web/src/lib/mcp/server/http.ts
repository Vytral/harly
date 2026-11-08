import { MCP_SCOPES } from "../types";

/**
 * HTTP-level helpers for the MCP endpoint: bearer parsing, the RFC 6750 / RFC
 * 9728 challenge responses and CORS for browser-based clients. Pure, so the
 * header formats are unit tested.
 */

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" } as const;

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function quote(value: string): string {
  return value.replace(/["\\]/g, "");
}

export function unauthorizedResponse(resourceMetadataUrl: string, options: { invalidToken?: boolean; description?: string } = {}): Response {
  const parts = [`resource_metadata="${quote(resourceMetadataUrl)}"`];
  if (options.invalidToken) {
    parts.unshift('error="invalid_token"');
    if (options.description) parts.push(`error_description="${quote(options.description)}"`);
  }
  return jsonResponse(
    401,
    {
      error: options.invalidToken ? "invalid_token" : "unauthorized",
      error_description: options.description ?? "Sign in to Harly to use this MCP server.",
    },
    { "www-authenticate": `Bearer ${parts.join(", ")}` },
  );
}

export function insufficientScopeResponse(requiredScope: string, resourceMetadataUrl: string): Response {
  return jsonResponse(
    403,
    {
      error: "insufficient_scope",
      error_description: `This connection was not granted the "${requiredScope}" scope.`,
      scope: requiredScope,
    },
    {
      "www-authenticate": `Bearer error="insufficient_scope", scope="${quote(requiredScope)}", resource_metadata="${quote(resourceMetadataUrl)}"`,
    },
  );
}

export function forbiddenResponse(code: string, message: string): Response {
  return jsonResponse(403, { error: code, error_description: message });
}

/** Scopes worth advertising in challenges and metadata. */
export const ADVERTISED_SCOPES: readonly string[] = MCP_SCOPES;

/**
 * Browser-based clients (MCP Inspector, web playgrounds) send an Origin. Auth
 * is a bearer token, never a cookie, so there is no ambient credential to
 * abuse, but we still only answer same-origin, loopback and explicitly listed
 * origins (MCP_ALLOWED_ORIGINS, comma separated).
 */
/**
 * Hosted AI apps whose connector UIs (test connection, tool pickers) can call
 * the server from the browser. Auth is a bearer token, never a cookie, so
 * answering them exposes nothing a token holder could not already reach.
 */
const HOSTED_CLIENT_ORIGINS = new Set([
  "https://claude.ai",
  "https://claude.com",
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://platform.openai.com",
]);

export function isAllowedOrigin(origin: string, publicOrigin: string, extra: string | undefined = process.env.MCP_ALLOWED_ORIGINS): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin === new URL(publicOrigin).origin) return true;
  if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return true;
  if (HOSTED_CLIENT_ORIGINS.has(parsed.origin)) return true;
  return (extra ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .includes(parsed.origin);
}

export function corsHeaders(origin: string | null, allowed: boolean): Record<string, string> {
  if (!origin || !allowed) return {};
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-expose-headers": "WWW-Authenticate, Mcp-Session-Id",
  };
}

export function preflightResponse(origin: string | null, allowed: boolean): Response {
  if (!origin || !allowed) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin, true),
      "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
      "access-control-allow-headers":
        "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name, last-event-id",
      "access-control-max-age": "600",
    },
  });
}

/** A JSON-RPC result carrying a tool error, for refusals decided before the SDK sees the call. */
export function jsonRpcToolError(id: string | number | null, text: string): Response {
  return jsonResponse(200, {
    jsonrpc: "2.0",
    id,
    result: { isError: true, content: [{ type: "text", text }] },
  });
}
