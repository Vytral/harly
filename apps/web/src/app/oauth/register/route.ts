import { DcrError, purgeExpiredClients, registerDcrClient } from "@/lib/mcp/oauth/clients";
import { corsPreflight, jsonResponse, limitByIp, oauthError } from "@/lib/mcp/oauth/http";
import { getInstanceMcpSettings } from "@/lib/mcp/settings";
import { createLogger } from "@/lib/logger";

const log = createLogger("mcp-oauth");

// RFC 7591 Dynamic Client Registration (public clients only, no secrets issued).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Claude and ChatGPT register from a small pool of shared egress IPs, and every
// retry of "add connector" registers again, so a tight per-IP cap locks out
// real users. Registrations are cheap, expire unused and are capped in size.
const REGISTRATIONS_PER_HOUR = 300;

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const limited = await limitByIp(request, "register", REGISTRATIONS_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const settings = await getInstanceMcpSettings();
  if (!settings.enabled || !settings.allowDcr) {
    log.warn({ enabled: settings.enabled, allowDcr: settings.allowDcr }, "oauth registration refused: disabled in AI agent settings");
    return oauthError("access_denied", "Dynamic client registration is disabled on this server.", 403);
  }

  const raw = await request.text();
  if (raw.length > 32 * 1024) return oauthError("invalid_client_metadata", "Request body is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    log.warn({ contentType: request.headers.get("content-type") }, "oauth registration refused: body is not JSON");
    return oauthError("invalid_client_metadata", "Request body must be JSON.");
  }

  try {
    void purgeExpiredClients().catch(() => undefined);
    const client = await registerDcrClient(body);
    return jsonResponse(
      {
        client_id: client.clientId,
        client_id_issued_at: client.issuedAt,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DcrError) {
      log.warn({ code: error.code, reason: error.message.slice(0, 200) }, "oauth registration refused: invalid metadata");
      return oauthError(error.code, error.message);
    }
    throw error;
  }
}
