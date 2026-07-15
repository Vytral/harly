import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@harly/auth/server";
import {
  completeDeploymentBootstrap,
  SetupError,
  setupClaimCookieName,
} from "@harly/auth/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

function publicUrl(): string {
  return (
    process.env.HARLY_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid workspace details." }, { status: 400 });
  }

  const origin = publicUrl();
  const cookieName = setupClaimCookieName(origin);
  const claimId = request.cookies.get(cookieName)?.value;
  if (!claimId) {
    return NextResponse.json({ error: "The setup claim is missing or expired." }, { status: 403 });
  }

  try {
    const result = await completeDeploymentBootstrap({
      claimId,
      userId: session.user.id,
      email: session.user.email,
      organizationName: parsed.data.name,
      organizationSlug: parsed.data.slug,
    });
    const response = NextResponse.json({ ok: true, id: result.organizationId });
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: new URL(origin).protocol === "https:",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof SetupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Workspace setup failed." }, { status: 500 });
  }
}
