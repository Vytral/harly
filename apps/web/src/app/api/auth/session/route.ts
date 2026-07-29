import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

export async function GET(request: NextRequest) {
  try {
    await enforceRateLimit(`public:auth-session:${clientIp(request)}`, {
      limit: 120,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return NextResponse.json(session);
}
