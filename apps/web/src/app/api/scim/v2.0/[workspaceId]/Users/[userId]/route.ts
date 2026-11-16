import { NextRequest } from "next/server";
import {
  deactivateScimUser,
  getScimUser,
  parseScimBoolean,
  ScimError,
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

function scimFailure(error: unknown, fallback: string, scimType?: string) {
  if (error instanceof ScimError) {
    return scimError(error.message, error.status, error.scimType);
  }
  return scimError(error instanceof Error ? error.message : fallback, 400, scimType);
}

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
    manager: current.manager,
  };
  const operations = body.Operations ?? [];
  for (const operation of operations) {
    const op = operation.op?.toLowerCase();
    const path = operation.path?.toLowerCase();
    if (op !== "replace" && op !== "add") {
      return { error: scimError("Only add and replace are supported.", 400, "invalidSyntax") };
    }
    if (path === "active") input.active = parseScimBoolean(operation.value);
    else if (path === "displayname") input.displayName = String(operation.value ?? "");
    else if (path === "title") input.title = String(operation.value ?? "");
    else if (path === "department") input.department = String(operation.value ?? "");
    else if (path === "region") input.region = String(operation.value ?? "");
    else if (path === "team") input.team = String(operation.value ?? "");
    else if (!path && operation.value && typeof operation.value === "object") {
      Object.assign(input, operation.value);
      if ("active" in operation.value) {
        input.active = parseScimBoolean((operation.value as { active?: unknown }).active);
      }
    } else {
      return { error: scimError(`Unsupported attribute: ${operation.path ?? "unknown"}.`, 400, "invalidPath") };
    }
  }
  if (body.active !== undefined) input.active = parseScimBoolean(body.active);
  return {
    user: await upsertScimUser(workspaceId, input, scimBaseUrl(request, workspaceId), {
      mode: "update",
      memberId: userId,
    }),
  };
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
    return scimFailure(error, "Unable to update user.");
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
        active: body.active === undefined ? current.active : parseScimBoolean(body.active),
      },
      scimBaseUrl(request, workspaceId),
      { mode: "update", memberId: userId },
    );
    return scimJson(user);
  } catch (error) {
    return scimFailure(error, "Unable to replace user.", "invalidValue");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { workspaceId, userId } = await params;
  const auth = await authenticateScimRequest(request, workspaceId);
  if (!auth.ok) return auth.response;
  const user = await deactivateScimUser(workspaceId, userId, scimBaseUrl(request, workspaceId));
  return user ? scimJson(user) : scimError("User not found.", 404);
}
