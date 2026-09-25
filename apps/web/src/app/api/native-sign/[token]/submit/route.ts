import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, nativeSignatureOtpChallenges } from "@harly/db";

import { resolveNativeSigningToken, nativeSignCookieName, isNativeSignatureCookieVerified } from "@/lib/esign/native/remote";
import { finalizeNativeSignature } from "@/lib/esign/native/finalize";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { MAX_VECTOR_COMPRESSED_CHARS } from "@/features/documents/signature-vector";

export const runtime = "nodejs";

const schema = z.object({
  signatureVectorBase64: z.string().min(1).max(MAX_VECTOR_COMPRESSED_CHARS),
  textValues: z.record(z.string(), z.string().max(200)).optional(),
  consentAt: z.string().datetime(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await resolveNativeSigningToken(token);
  if (!target) return NextResponse.json({ error: "Signing link is invalid or expired." }, { status: 404 });
  try { await enforceRateLimit(`native-submit:${clientIp(request)}:${target.recipientId}`, { limit: 8, windowMs: 10 * 60_000 }); } catch { return NextResponse.json({ error: "Too many requests." }, { status: 429 }); }
  if (target.securityMode === "email_otp" && !(await isNativeSignatureCookieVerified(request.cookies.get(nativeSignCookieName)?.value, target.recipientId))) return NextResponse.json({ error: "Verify the email code before signing." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid signature submission." }, { status: 400 });
  try {
    const result = await finalizeNativeSignature({ workspaceId: target.workspaceId, documentId: target.documentId, actorId: null, signerName: target.name, signerEmail: target.email, signatureVector: parsed.data.signatureVectorBase64, textValues: parsed.data.textValues, verification: target.securityMode === "email_otp" ? "email_otp" : "link_only", consentAt: new Date(parsed.data.consentAt), ipAddress: clientIp(request), userAgent: request.headers.get("user-agent"), existingEnvelopeId: target.envelopeId, existingRecipientId: target.recipientId });
    const cookie = request.cookies.get(nativeSignCookieName)?.value;
    const challengeId = cookie?.split(".")[1];
    if (challengeId) await db.update(nativeSignatureOtpChallenges).set({ consumedAt: new Date() }).where(and(eq(nativeSignatureOtpChallenges.id, challengeId), eq(nativeSignatureOtpChallenges.recipientId, target.recipientId)));
    return NextResponse.json({ ok: true, envelopeId: result.envelopeId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete the signature.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
