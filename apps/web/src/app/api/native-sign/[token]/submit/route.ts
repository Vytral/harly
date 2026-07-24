import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, nativeSignatureOtpChallenges } from "@harly/db";

import { resolveNativeSigningToken, nativeSignCookieName, isNativeSignatureCookieVerified } from "@/lib/esign/native/remote";
import { finalizeNativeSignature } from "@/lib/esign/native/finalize";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";

const schema = z.object({
  signaturePngBase64: z.string().max(700_000),
  placements: z.array(z.object({ page: z.number().int().positive(), x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().positive().max(1), h: z.number().positive().max(1) })).min(1).max(20),
  consentAt: z.string().datetime(),
});

function decodePng(value: string) {
  const raw = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = Buffer.from(raw, "base64");
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length <= 0 || bytes.length > 500 * 1024 || !bytes.subarray(0, 8).equals(header)) throw new Error("Invalid signature image.");
  return bytes;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await resolveNativeSigningToken(token);
  if (!target) return NextResponse.json({ error: "Signing link is invalid or expired." }, { status: 404 });
  try { await enforceRateLimit(`native-submit:${clientIp(request)}:${target.recipientId}`, { limit: 8, windowMs: 10 * 60_000 }); } catch { return NextResponse.json({ error: "Too many requests." }, { status: 429 }); }
  if (target.securityMode === "email_otp" && !(await isNativeSignatureCookieVerified(request.cookies.get(nativeSignCookieName)?.value, target.recipientId))) return NextResponse.json({ error: "Verify the email code before signing." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid signature submission." }, { status: 400 });
  try {
    const result = await finalizeNativeSignature({ workspaceId: target.workspaceId, documentId: target.documentId, actorId: null, signerName: target.name, signerEmail: target.email, signaturePngBytes: decodePng(parsed.data.signaturePngBase64), placements: parsed.data.placements, verification: target.securityMode === "email_otp" ? "email_otp" : "link_only", consentAt: new Date(parsed.data.consentAt), ipAddress: clientIp(request), userAgent: request.headers.get("user-agent"), existingEnvelopeId: target.envelopeId, existingRecipientId: target.recipientId });
    const cookie = request.cookies.get(nativeSignCookieName)?.value;
    const challengeId = cookie?.split(".")[1];
    if (challengeId) await db.update(nativeSignatureOtpChallenges).set({ consumedAt: new Date() }).where(and(eq(nativeSignatureOtpChallenges.id, challengeId), eq(nativeSignatureOtpChallenges.recipientId, target.recipientId)));
    return NextResponse.json({ ok: true, envelopeId: result.envelopeId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete the signature.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
