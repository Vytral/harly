import { NextResponse, type NextRequest } from "next/server";

import {
  inspectNativeSigningToken,
  isNativeSignatureCookieVerified,
  markNativeLinkViewed,
  maskEmail,
  NATIVE_OTP_SESSION_SECONDS,
  nativeSignCookieName,
  nativeSignatureCookieValue,
  requestNativeOtp,
  verifyNativeOtp,
} from "@/lib/esign/native/remote";
import { ESIGN_CONSENT_VERSION, ESIGN_PRIVACY_PATH, ESIGN_TERMS_PATH } from "@/lib/esign/native/consent";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const inspected = await inspectNativeSigningToken(token);
  if (inspected.state === "unavailable") {
    return NextResponse.json({ state: "unavailable", error: "Signing link is invalid or expired." }, { status: 404, headers: noStore });
  }
  const { target, context, state } = inspected;
  if (state === "active") await markNativeLinkViewed(target).catch(() => undefined);
  const requiresOtp = target.securityMode === "email_otp";
  // Tell the page whether the code was already verified (and is still valid)
  // so it can skip straight to the document, or ask again once it lapses.
  const verified = !requiresOtp || (await isNativeSignatureCookieVerified(request.cookies.get(nativeSignCookieName)?.value, target.recipientId));
  return NextResponse.json({
    state,
    documentName: target.documentName,
    recipientName: target.name,
    maskedEmail: maskEmail(target.email),
    securityMode: target.securityMode,
    routingOrder: target.routingOrder,
    signerCount: target.signerCount,
    expiresAt: target.expiresAt.toISOString(),
    requiresOtp,
    verified,
    otpSessionSeconds: NATIVE_OTP_SESSION_SECONDS,
    company: context.company,
    sender: context.sender,
    message: context.message,
    signedAt: context.signedAt?.toISOString() ?? null,
    declinedReason: context.declinedReason,
    envelopeCompleted: context.envelopeCompleted,
    consentVersion: ESIGN_CONSENT_VERSION,
    termsPath: ESIGN_TERMS_PATH,
    privacyPath: ESIGN_PRIVACY_PATH,
  }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const inspected = await inspectNativeSigningToken(token);
  // Signed signers may still need a code to download their copy.
  if (inspected.state !== "active" && inspected.state !== "signed") return NextResponse.json({ error: "Signing link is invalid or expired." }, { status: 404 });
  const target = inspected.target;
  try { await enforceRateLimit(`native-sign:${clientIp(request)}:${target.recipientId}`, { limit: 12, windowMs: 10 * 60_000 }); } catch { return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 }); }
  const body = (await request.json().catch(() => ({}))) as { action?: string; challengeId?: string; code?: string };
  if (body.action === "request_otp") {
    const result = await requestNativeOtp(target);
    return NextResponse.json(result.ok ? { ...result, maskedEmail: maskEmail(target.email) } : result, { status: result.ok ? 200 : 400, headers: noStore });
  }
  if (body.action === "verify_otp") {
    const result = await verifyNativeOtp(target, body.challengeId ?? "", body.code ?? "");
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    const response = NextResponse.json({ ok: true, otpSessionSeconds: NATIVE_OTP_SESSION_SECONDS }, { headers: noStore });
    response.cookies.set(nativeSignCookieName, nativeSignatureCookieValue(target.recipientId, body.challengeId!), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: `/api/native-sign/${token}`, maxAge: NATIVE_OTP_SESSION_SECONDS });
    return response;
  }
  return NextResponse.json({ error: "Unsupported signing action." }, { status: 400 });
}
