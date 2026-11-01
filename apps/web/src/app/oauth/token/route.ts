import { exchangeAuthorizationCode, refreshAccessToken, type TokenResult } from "@/lib/mcp/oauth/token";
import { corsPreflight, jsonResponse, limitByIp, oauthError, readOAuthBody } from "@/lib/mcp/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

function toResponse(result: TokenResult) {
  return result.ok
    ? jsonResponse(result.response)
    : oauthError(result.error, result.description, result.status);
}

export async function POST(request: Request) {
  const limited = await limitByIp(request, "token", 60, 60 * 1000);
  if (limited) return limited;

  const body = await readOAuthBody(request);
  if (!body) return oauthError("invalid_request", "Malformed request body.");

  // Public clients only: a client_id in the body is the whole identity.
  const clientId = body.client_id;
  if (!clientId) return oauthError("invalid_client", "client_id is required.", 401);
  if (body.client_secret || body.client_assertion) {
    return oauthError("invalid_client", "Confidential client authentication is not supported.", 401);
  }

  switch (body.grant_type) {
    case "authorization_code": {
      const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = body;
      if (!code || !redirectUri || !codeVerifier) {
        return oauthError("invalid_request", "code, redirect_uri and code_verifier are required.");
      }
      return toResponse(
        await exchangeAuthorizationCode({ code, clientId, redirectUri, codeVerifier, resource: body.resource }),
      );
    }
    case "refresh_token": {
      if (!body.refresh_token) return oauthError("invalid_request", "refresh_token is required.");
      return toResponse(await refreshAccessToken({ refreshToken: body.refresh_token, clientId, resource: body.resource }));
    }
    default:
      return oauthError("unsupported_grant_type", "Supported grant types: authorization_code, refresh_token.");
  }
}
