import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { isValidUpdaterToken } from "./updater-token";

/**
 * Bearer-token gate for the host updater's endpoints. Like the cron routes it
 * is disabled when `CRON_SECRET` is unset and never accepts a query-string
 * token. Returns a response to send on failure, or null when authorized.
 */
export function rejectUnlessUpdater(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!isValidUpdaterToken(supplied, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
