import "server-only";

import { createMcpHandler } from "@modelcontextprotocol/server";

import { isDemoMode } from "@harly/config";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getActorPermissions } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { enforceRateLimit, rateLimitResultFromError } from "@/server/api/ratelimit";
import { getTrustedClientIp } from "@/server/security/policy";

import { runAsMcpActor, type McpActor } from "../actor";
import { mcpResourceMetadataUrl } from "../oauth/config";
import { verifyMcpAccessToken } from "../oauth/verify";
import { isMcpEnabledForWorkspace } from "../settings";
import { MCP_TOOLS } from "../tools";
import { createHarlyMcpServer } from "./build-server";
import {
  corsHeaders,
  extractBearerToken,
  forbiddenResponse,
  insufficientScopeResponse,
  isAllowedOrigin,
  jsonResponse,
  jsonRpcToolError,
  preflightResponse,
  unauthorizedResponse,
} from "./http";
import { AUTH_FAILURES_PER_MINUTE, MAX_REQUEST_BYTES, RATE_WINDOW_MS } from "./limits";
import { evaluateToolAccess } from "./policy";
import { buildWorkspaceSummary } from "./workspace-summary";

const log = createLogger("mcp");

export const MCP_VERSION = process.env.HARLY_VERSION ?? "0.1.0-dev";

function withCors(response: Response, origin: string | null, allowed: boolean): Response {
  const extra = corsHeaders(origin, allowed);
  for (const [key, value] of Object.entries(extra)) response.headers.set(key, value);
  return response;
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown; bytes: Buffer } | { ok: false; response: Response }> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    return { ok: false, response: jsonResponse(413, { error: "payload_too_large" }) };
  }
  // Count bytes while streaming and stop at the cap, so a body without a
  // Content-Length is never buffered past MAX_REQUEST_BYTES. This reads the
  // original stream (a tee'd clone would wait on the unread branch); the
  // transport gets a request rebuilt from these bytes.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, response: jsonResponse(413, { error: "payload_too_large" }) };
      }
      chunks.push(value);
    }
  }
  const bytes = Buffer.concat(chunks);
  const text = bytes.toString("utf8");
  if (!text) return { ok: true, body: undefined, bytes };
  try {
    return { ok: true, body: JSON.parse(text), bytes };
  } catch {
    return { ok: true, body: undefined, bytes };
  }
}

/** The tools/call target of a single JSON-RPC request, if the body is one. */
function toolCallTarget(body: unknown): { id: string | number | null; name: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const message = body as { id?: unknown; method?: unknown; params?: { name?: unknown } };
  if (message.method !== "tools/call" || typeof message.params?.name !== "string") return null;
  const id = typeof message.id === "string" || typeof message.id === "number" ? message.id : null;
  return { id, name: message.params.name };
}

export async function handleMcpOptions(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  return preflightResponse(origin, origin ? isAllowedOrigin(origin, getHarlyPublicOrigin()) : false);
}

/**
 * The `/mcp` endpoint. Order matters: cheap rejections first (method, origin,
 * demo mode, missing token), then token verification, then live membership and
 * permissions, and only then the SDK handler with the user's tools.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  const publicOrigin = getHarlyPublicOrigin();
  const origin = request.headers.get("origin");
  const originAllowed = origin ? isAllowedOrigin(origin, publicOrigin) : true;
  const finish = (response: Response) => withCors(response, origin, Boolean(origin) && originAllowed);

  if (origin && !originAllowed) {
    return forbiddenResponse("origin_not_allowed", "Requests from this origin are not allowed.");
  }
  if (request.method === "OPTIONS") return handleMcpOptions(request);
  if (request.method !== "POST") {
    // Stateless server: no GET event stream, no sessions to DELETE.
    return finish(
      new Response("Method not allowed. Send MCP requests with POST.", {
        status: 405,
        headers: { allow: "POST, OPTIONS", "cache-control": "no-store" },
      }),
    );
  }
  if (isDemoMode()) {
    return finish(forbiddenResponse("mcp_unavailable", "The MCP server is not available on the public demo."));
  }

  const resourceMetadataUrl = mcpResourceMetadataUrl();
  const token = extractBearerToken(request);
  if (!token) return finish(unauthorizedResponse(resourceMetadataUrl));

  const ip = getTrustedClientIp(request);
  const verified = await verifyMcpAccessToken(token);
  if (!verified) {
    // Bound brute-force probing of the token space before it costs more queries.
    try {
      await enforceRateLimit(`mcp:auth-fail:${ip ?? "unknown"}`, { limit: AUTH_FAILURES_PER_MINUTE, windowMs: RATE_WINDOW_MS });
    } catch (error) {
      if (rateLimitResultFromError(error)) {
        return finish(jsonResponse(429, { error: "rate_limited" }, { "retry-after": "60" }));
      }
      throw error;
    }
    return finish(unauthorizedResponse(resourceMetadataUrl, { invalidToken: true, description: "The access token is invalid, expired or revoked." }));
  }

  if (!(await isMcpEnabledForWorkspace(verified.workspaceId))) {
    return finish(forbiddenResponse("mcp_disabled", "An administrator has turned off AI agent access (MCP) for this Harly workspace."));
  }

  const actor: McpActor = {
    userId: verified.userId,
    workspaceId: verified.workspaceId,
    grantId: verified.grantId,
    clientId: verified.clientId,
    clientName: verified.clientName,
    scopes: verified.scopes,
    requestId: crypto.randomUUID(),
  };

  const identity = await runAsMcpActor(actor, async () => {
    const context = await getWorkspaceContextOrNull();
    if (!context) return null;
    const permissions = await getActorPermissions(actor.workspaceId, actor.userId);
    return { context, permissions };
  });
  if (!identity) {
    return finish(unauthorizedResponse(resourceMetadataUrl, { invalidToken: true, description: "The account behind this token is no longer a member of the workspace." }));
  }
  if (!identity.permissions.includes("mcp:use")) {
    return finish(forbiddenResponse("mcp_not_permitted", "Your Harly role does not allow connecting AI agents. Ask a workspace admin for the \"Connect AI agents\" permission."));
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return finish(parsed.response);

  // A call to a real tool this connection can't use gets a precise answer
  // instead of "unknown tool": 403 insufficient_scope (clients can step up) or
  // a readable refusal for a missing Harly permission.
  const target = toolCallTarget(parsed.body);
  if (target) {
    const tool = MCP_TOOLS.find((candidate) => candidate.name === target.name);
    if (tool) {
      const access = evaluateToolAccess(tool, { scopes: actor.scopes, permissions: identity.permissions });
      if (access === "missing_scope") return finish(insufficientScopeResponse(tool.scope, resourceMetadataUrl));
      if (access === "missing_permission") {
        return finish(jsonRpcToolError(target.id, "Error (forbidden): Your Harly role does not allow this action."));
      }
    }
  }

  const server = () =>
    createHarlyMcpServer({
      actor,
      appOrigin: publicOrigin,
      ipAddress: ip,
      version: MCP_VERSION,
      workspaceName: identity.context.organization.name,
      workspaceLogo: identity.context.organization.logo,
      permissions: identity.permissions,
      tools: MCP_TOOLS,
      workspaceSummary: () => buildWorkspaceSummary({ actor, appOrigin: publicOrigin }),
    });

  const handler = createMcpHandler(server, {
    legacy: "stateless",
    maxRequestBodySize: MAX_REQUEST_BYTES,
    onerror: (error) => log.warn({ requestId: actor.requestId, err: error.message.slice(0, 300) }, "mcp transport error"),
  });

  try {
    const response = await runAsMcpActor(actor, () =>
      handler.fetch(new Request(request.url, { method: request.method, headers: request.headers, body: new Uint8Array(parsed.bytes) }), {
        authInfo: { token: "", clientId: actor.clientId, scopes: [...actor.scopes] },
        parsedBody: parsed.body,
      }),
    );
    response.headers.set("cache-control", "no-store");
    return finish(response);
  } catch (error) {
    log.error({ requestId: actor.requestId, err: error instanceof Error ? error.message.slice(0, 300) : "unknown" }, "mcp request failed");
    return finish(jsonResponse(500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: `Internal error (request ${actor.requestId})` } }));
  }
}
