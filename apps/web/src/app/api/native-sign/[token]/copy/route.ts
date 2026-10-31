import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, documents, signatureArtifacts } from "@harly/db";

import { inspectNativeSigningToken, isNativeSignatureCookieVerified, nativeSignCookieName } from "@/lib/esign/native/remote";
import { WORKING_DOCUMENT_KIND } from "@/lib/esign/native/working-pdf";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * The signer's own copy: the final signed PDF once everyone has signed,
 * otherwise the document as it stood with their signature on it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inspected = await inspectNativeSigningToken(token);
  if (inspected.state !== "signed") return NextResponse.json({ error: "No signed copy is available for this link." }, { status: 404 });
  const { target, context } = inspected;
  try { await enforceRateLimit(`native-copy:${clientIp(request)}:${target.recipientId}`, { limit: 10, windowMs: 10 * 60_000 }); } catch { return NextResponse.json({ error: "Too many requests." }, { status: 429 }); }
  if (target.securityMode === "email_otp" && !(await isNativeSignatureCookieVerified(request.cookies.get(nativeSignCookieName)?.value, target.recipientId, { allowConsumed: true }))) {
    return NextResponse.json({ error: "Verify the email code to download your copy.", code: "otp_required" }, { status: 403 });
  }
  let storageKey: string | null = null;
  if (context.envelopeCompleted) {
    const [doc] = await db.select({ storageKey: documents.storageKey }).from(documents).where(and(eq(documents.id, target.documentId), eq(documents.workspaceId, target.workspaceId))).limit(1);
    const [artifact] = await db.select({ storageKey: signatureArtifacts.storageKey }).from(signatureArtifacts).where(and(eq(signatureArtifacts.envelopeId, target.envelopeId), eq(signatureArtifacts.kind, "signed_document"))).limit(1);
    storageKey = artifact?.storageKey ?? doc?.storageKey ?? null;
  } else {
    const [working] = await db.select({ storageKey: signatureArtifacts.storageKey }).from(signatureArtifacts).where(and(eq(signatureArtifacts.envelopeId, target.envelopeId), eq(signatureArtifacts.kind, WORKING_DOCUMENT_KIND))).limit(1);
    storageKey = working?.storageKey ?? null;
  }
  if (!storageKey) return NextResponse.json({ error: "Your copy is not available." }, { status: 404 });
  const bytes = await storage.read(storageKey);
  const filename = `${target.documentName.replace(/\.pdf$/i, "").replace(/[^\w .-]+/g, "_").slice(0, 80) || "document"} (signed).pdf`;
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
