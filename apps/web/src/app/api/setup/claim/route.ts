import { NextResponse, type NextRequest } from "next/server";

import {
  reserveSetupClaim,
  SetupError,
  setupClaimCookieName,
} from "@harly/auth/setup";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicUrl(): string {
  return getHarlyPublicOrigin();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await enforceRateLimit(`public:setup-claim:${clientIp(request)}`, {
      limit: 10,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 },
    );
  }

  let token: string;
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const origin = publicUrl();
  const cookieName = setupClaimCookieName(origin);
  try {
    const claim = await reserveSetupClaim({
      token,
      existingClaimId: request.cookies.get(cookieName)?.value,
    });
    const response = NextResponse.json({ ok: true, email: claim.email });
    response.cookies.set(cookieName, claim.claimId, {
      httpOnly: true,
      secure: new URL(origin).protocol === "https:",
      sameSite: "strict",
      path: "/",
      expires: claim.expiresAt,
    });
    return response;
  } catch (error) {
    if (error instanceof SetupError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Setup is temporarily unavailable." }, { status: 503 });
  }
}
