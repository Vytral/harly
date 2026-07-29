import { toNextJsHandler } from "@harly/auth/next";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

const handlers = toNextJsHandler(auth);

async function rateLimitedAuth(
  request: Request,
  handler: (request: Request) => Promise<Response>,
) {
  try {
    await enforceRateLimit(`public:auth:${clientIp(request)}`, {
      limit: 60,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json(
      { error: "Too many authentication requests. Please try again later." },
      { status: 429 },
    );
  }
  return handler(request);
}

export const GET = (request: Request) => rateLimitedAuth(request, handlers.GET);
export const POST = (request: Request) => rateLimitedAuth(request, handlers.POST);
