import { NextResponse, type NextRequest } from "next/server";

import { resolveNativeSigningToken, requestNativeOtp, verifyNativeOtp, nativeSignCookieName, nativeSignatureCookieValue } from "@/lib/esign/native/remote";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const target = await resolveNativeSigningToken(token);
  if (!target) return NextResponse.json({ error: "Signing link is invalid or expired." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ documentName: target.documentName, recipientName: target.name, securityMode: target.securityMode, expiresAt: target.expiresAt.toISOString(), requiresOtp: target.securityMode === "email_otp" }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const target = await resolveNativeSigningToken(token);
  if (!target) return NextResponse.json({ error: "Signing link is invalid or expired." }, { status: 404 });
  try { await enforceRateLimit(`native-sign:${clientIp(request)}:${target.recipientId}`, { limit: 12, windowMs: 10 * 60_000 }); } catch { return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 }); }
  const body = (await request.json().catch(() => ({}))) as { action?: string; challengeId?: string; code?: string };
  if (body.action === "request_otp") {
    const result = await requestNativeOtp(target);
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "private, no-store" } });
  }
  if (body.action === "verify_otp") {
    const result = await verifyNativeOtp(target, body.challengeId ?? "", body.code ?? "");
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    response.cookies.set(nativeSignCookieName, nativeSignatureCookieValue(target.recipientId, body.challengeId!), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/api/native-sign/${token}`, maxAge: 10 * 60 });
    return response;
  }
  return NextResponse.json({ error: "Unsupported signing action." }, { status: 400 });
}
