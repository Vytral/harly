// Path-inserted discovery (RFC 8414 / OIDC discovery with the resource path):
// some clients probe `<well-known>/mcp` before the root document. Same document.
export { GET, OPTIONS } from "../route";

export const dynamic = "force-dynamic";
