import { NextRequest } from "next/server";
import { authenticateScimRequest, scimJson } from "@/server/scim/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  return scimJson({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: 1, startIndex: 1, itemsPerPage: 1, Resources: [{ schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "User", name: "User", endpoint: "/Users", description: "Workspace members", schema: "urn:ietf:params:scim:schemas:core:2.0:User" }] });
}
