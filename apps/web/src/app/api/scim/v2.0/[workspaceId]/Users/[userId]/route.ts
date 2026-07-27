import { NextRequest } from "next/server";
import {
  deactivateScimUser,
  getScimUser,
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

type Params = { params: Promise<{ workspaceId: string; userId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { workspaceId, userId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  const user = await getScimUser(workspaceId, userId, scimBaseUrl(request, workspaceId));
  return user ? scimJson(user) : scimError("User not found.", 404);
}

async function patchUser(request: NextRequest, workspaceId: string, userId: string) {
  const current = await getScimUser(workspaceId, userId, scimBaseUrl(request, workspaceId));
  if (!current) return { error: scimError("User not found.", 404) };
  let body: { active?: boolean; Operations?: Array<{ op?: string; path?: string; value?: unknown }> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { error: scimError("Request body must be valid JSON.", 400, "invalidSyntax") };
  }
  const input: ScimUserInput = {
    externalId: current.externalId,
    userName: current.userName,
    displayName: current.displayName,
    active: current.active,
    title: current.title,
    department: current.department,
    region: current.region,
    team: current.team,
    emails: current.emails,
  };
  const operations = body.Operations ?? [];
  for (const operation of operations) {
    const op = operation.op?.toLowerCase();
    const path = operation.path?.toLowerCase();
    if (op !== "replace" && op !== "add") {
      return { error: scimError("Only add and replace are supported.", 400, "invalidSyntax") };
    }
    if (path === "active") input.active = operation.value === true || operation.value === "true";
    else if (path === "displayname") input.displayName = String(operation.value ?? "");
    else if (path === "title") input.title = String(operation.value ?? "");
    else if (path === "department") input.department = String(operation.value ?? "");
    else if (path === "region") input.region = String(operation.value ?? "");
    else if (path === "team") input.team = String(operation.value ?? "");
    else if (!path && operation.value && typeof operation.value === "object") {
      Object.assign(input, operation.value);
    } else {
      return { error: scimError(`Unsupported attribute: ${operation.path ?? "unknown"}.`, 400, "invalidPath") };
    }
  }
  if (body.active !== undefined) input.active = body.active;
  return { user: await upsertScimUser(workspaceId, input, scimBaseUrl(request, workspaceId)) };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { workspaceId, userId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  try {
    const result = await patchUser(request, workspaceId, userId);
    if (result.error) return result.error;
    return scimJson(result.user);
  } catch (error) {
    return scimError(error instanceof Error ? error.message : "Unable to update user.", 400);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { workspaceId, userId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  const current = await getScimUser(workspaceId, userId, scimBaseUrl(request, workspaceId));
  if (!current) return scimError("User not found.", 404);
  try {
    const body = (await request.json()) as ScimUserInput;
    const user = await upsertScimUser(
      workspaceId,
      {
        ...body,
        externalId: body.externalId ?? current.externalId,
        userName: body.userName ?? current.userName,
        emails: body.emails ?? current.emails,
        active: body.active ?? current.active,
      },
      scimBaseUrl(request, workspaceId),
    );
    return scimJson(user);
  } catch (error) {
    return scimError(error instanceof Error ? error.message : "Unable to replace user.", 400, "invalidValue");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { workspaceId, userId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  const user = await deactivateScimUser(workspaceId, userId, scimBaseUrl(request, workspaceId));
  return user ? scimJson(user) : scimError("User not found.", 404);
}
