import { NextResponse, type NextRequest } from "next/server";

import { db, documents } from "@harly/db";
import { eq } from "drizzle-orm";

import { nativeSignCookieName, resolveNativeSigningToken, isNativeSignatureCookieVerified } from "@/lib/esign/native/remote";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";

/**
 * Resolves the recruiter-placed field layout for a native signing link,
 * scoped strictly by the signing token (never a raw client-supplied
 * documentId) — same auth pattern as the sibling document/route.ts. Returns
 * [] when the document predates this feature; the caller falls back to the
 * legacy free-placement flow in that case.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await resolveNativeSigningToken(token);
  if (!target) return NextResponse.json({ error: "Signing link is invalid or expired." }, { status: 404 });
  try {
    await enforceRateLimit(`native-sign-fields:${clientIp(request)}:${target.recipientId}`, { limit: 20, windowMs: 10 * 60_000 });
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  if (
    target.securityMode === "email_otp" &&
    !(await isNativeSignatureCookieVerified(request.cookies.get(nativeSignCookieName)?.value, target.recipientId))
  ) {
    return NextResponse.json({ error: "Verify the email code before viewing this document." }, { status: 403 });
  }

  const [row] = await db
    .select({ fieldsSnapshot: documents.fieldsSnapshot })
    .from(documents)
    .where(eq(documents.id, target.documentId))
    .limit(1);

  return NextResponse.json(
    { fields: row?.fieldsSnapshot ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
