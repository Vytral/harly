import { jsonResponse, corsPreflight } from "@/lib/mcp/oauth/http";
import { mcpIssuer } from "@/lib/mcp/oauth/config";
import { buildAuthorizationServerMetadata } from "@/lib/mcp/oauth/metadata";
import { getInstanceMcpSettings } from "@/lib/mcp/settings";

// RFC 8414. The issuer is the instance origin, so the document lives at the root.
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getInstanceMcpSettings();
  return jsonResponse(buildAuthorizationServerMetadata(mcpIssuer(), { allowDcr: settings.allowDcr }), {
    cache: "public, max-age=300",
  });
}

export function OPTIONS() {
  return corsPreflight();
}
