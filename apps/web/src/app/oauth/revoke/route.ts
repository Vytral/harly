import { revokeToken } from "@/lib/mcp/oauth/token";
import { corsPreflight, jsonResponse, limitByIp, oauthError, readOAuthBody } from "@/lib/mcp/oauth/http";

// RFC 7009. Always answers 200 for well-formed requests so tokens can't be probed.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const limited = await limitByIp(request, "revoke", 60, 60 * 1000);
  if (limited) return limited;

  const body = await readOAuthBody(request);
  if (!body?.token) return oauthError("invalid_request", "token is required.");
  await revokeToken(body.token, body.client_id);
  return jsonResponse({}, { status: 200 });
}
