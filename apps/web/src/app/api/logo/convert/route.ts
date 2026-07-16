import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { convertAndStoreLogo } from "@/lib/logo-convert";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";

export const runtime = "nodejs";

type ConvertLogoRequest = {
  logoUrl: string;
};

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve the workspace from the session, never from the request body. A
  // logged-in user can only ever act on their own organization (single-tenant),
  // so a client-supplied organizationId would be an IDOR.
  const context = await getWorkspaceContextOrNull();
  if (!context) {
    return NextResponse.json(
      { error: "No workspace available for this account." },
      { status: 403 },
    );
  }
  try {
    await requirePermission("settings:edit");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as ConvertLogoRequest;
  const { logoUrl } = body;

  if (!logoUrl) {
    return NextResponse.json(
      { error: "logoUrl is required." },
      { status: 400 },
    );
  }

  try {
    const result = await convertAndStoreLogo({
      organizationId: context.organization.id,
      logoUrl,
      storage,
    });

    return NextResponse.json({
      success: result.success,
      logoEmailUrl: result.logoEmailUrl,
      format: result.format,
    });
  } catch (error) {
    console.error("[Logo Convert] Error:", error);
    return NextResponse.json(
      { error: "Failed to convert logo." },
      { status: 500 },
    );
  }
}
