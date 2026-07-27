import { NextRequest } from "next/server";
import { authenticateScimRequest, scimJson } from "@/server/scim/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  return scimJson({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: "https://www.rfc-editor.org/rfc/rfc7644",
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false },
    sort: { supported: true },
    etag: { supported: false },
    authenticationSchemes: [{ type: "oauth2", name: "HTTP Bearer", description: "Workspace-scoped SCIM bearer token", primary: true }],
  });
}
