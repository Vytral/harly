import { NextRequest } from "next/server";
import {
  listScimUsers,
  upsertScimUser,
  type ScimUserInput,
} from "@/server/scim/service";
import {
  authenticateScimRequest,
  scimBaseUrl,
  scimError,
  scimJson,
} from "@/server/scim/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  const startIndex = Number(request.nextUrl.searchParams.get("startIndex") ?? 1);
  const count = Number(request.nextUrl.searchParams.get("count") ?? 100);
  const result = await listScimUsers(
    workspaceId,
    scimBaseUrl(request, workspaceId),
    Number.isFinite(startIndex) ? startIndex : 1,
    Number.isFinite(count) ? count : 100,
    request.nextUrl.searchParams.get("filter") ?? undefined,
  );
  return scimJson(result);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { workspaceId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  let body: ScimUserInput;
  try {
    body = (await request.json()) as ScimUserInput;
  } catch {
    return scimError("Request body must be valid JSON.", 400, "invalidSyntax");
  }
  if (!body || typeof body !== "object") return scimError("User payload is required.", 400);
  try {
    const user = await upsertScimUser(workspaceId, body, scimBaseUrl(request, workspaceId));
    return scimJson(user, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to provision user.";
    return scimError(message, 400, "invalidValue");
  }
}
