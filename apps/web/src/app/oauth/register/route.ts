import { DcrError, purgeExpiredClients, registerDcrClient } from "@/lib/mcp/oauth/clients";
import { corsPreflight, jsonResponse, limitByIp, oauthError } from "@/lib/mcp/oauth/http";
import { getInstanceMcpSettings } from "@/lib/mcp/settings";

// RFC 7591 Dynamic Client Registration (public clients only, no secrets issued).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const limited = await limitByIp(request, "register", 20, 60 * 60 * 1000);
  if (limited) return limited;

  const settings = await getInstanceMcpSettings();
  if (!settings.enabled || !settings.allowDcr) {
    return oauthError("access_denied", "Dynamic client registration is disabled on this server.", 403);
  }

  const raw = await request.text();
  if (raw.length > 32 * 1024) return oauthError("invalid_client_metadata", "Request body is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
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
    if (error instanceof DcrError) return oauthError(error.code, error.message);
    throw error;
  }
}
