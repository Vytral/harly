import { jsonResponse, corsPreflight } from "@/lib/mcp/oauth/http";
import { mcpIssuer } from "@/lib/mcp/oauth/config";
import { buildProtectedResourceMetadata } from "@/lib/mcp/oauth/metadata";

// RFC 9728. Path-less variant; clients that probe `/mcp` use the sibling route.
export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse(buildProtectedResourceMetadata(mcpIssuer()), { cache: "public, max-age=300" });
}

export function OPTIONS() {
  return corsPreflight();
}
