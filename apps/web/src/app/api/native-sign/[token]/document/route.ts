import { NextResponse, type NextRequest } from "next/server";

import { nativeSignCookieName, resolveNativeSigningToken, isNativeSignatureCookieVerified } from "@/lib/esign/native/remote";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await resolveNativeSigningToken(token);
  if (!target) return NextResponse.json({ error: "Signing link is invalid or expired." }, { status: 404 });
  try { await enforceRateLimit(`native-sign-doc:${clientIp(request)}:${target.recipientId}`, { limit: 20, windowMs: 10 * 60_000 }); } catch { return NextResponse.json({ error: "Too many requests." }, { status: 429 }); }
  if (target.securityMode === "email_otp" && !(await isNativeSignatureCookieVerified(request.cookies.get(nativeSignCookieName)?.value, target.recipientId))) return NextResponse.json({ error: "Verify the email code before viewing this document." }, { status: 403 });
  const bytes = await storage.read(target.storageKey);
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
