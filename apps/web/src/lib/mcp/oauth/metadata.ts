import { MCP_SCOPES_SUPPORTED } from "./scopes";

/** RFC 8414 authorization server metadata. `origin` is the canonical issuer. */
export function buildAuthorizationServerMetadata(origin: string, opts: { allowDcr?: boolean } = {}) {
  const allowDcr = opts.allowDcr ?? true;
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    ...(allowDcr ? { registration_endpoint: `${origin}/oauth/register` } : {}),
    scopes_supported: [...MCP_SCOPES_SUPPORTED],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function buildProtectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: [...MCP_SCOPES_SUPPORTED].filter((s) => s !== "offline_access"),
    bearer_methods_supported: ["header"],
    resource_name: "Harly MCP",
  };
}
