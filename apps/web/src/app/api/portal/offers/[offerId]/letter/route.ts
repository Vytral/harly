import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db, documentAssociations, documents, offers } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Streams the native offer-letter PDF to the candidate signing it in-portal —
 *  the native counterpart to DocuSeal's hosted signing page. Never exposes the
 *  storage key; resolves strictly by portal session -> offer -> association. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  try {
    const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
    const session = token ? await resolvePortalSession(token) : null;
    if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { offerId } = await params;
    const [offer] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(
        and(
          eq(offers.id, offerId),
          eq(offers.workspaceId, session.workspaceId),
          eq(offers.candidateId, session.candidateId),
        ),
      )
      .limit(1);
    if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });

    const [row] = await db
      .select({ storageKey: documents.storageKey, mimeType: documents.mimeType, name: documents.name })
      .from(documentAssociations)
      .innerJoin(documents, eq(documents.id, documentAssociations.documentId))
      .where(
        and(
          eq(documentAssociations.workspaceId, session.workspaceId),
          eq(documentAssociations.targetType, "offer_letter"),
          eq(documentAssociations.targetId, offer.id),
        ),
      )
      .limit(1);
    if (!row) return NextResponse.json({ error: "Offer letter not found." }, { status: 404 });

    const bytes = await storage.read(row.storageKey);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Offer letter not found." }, { status: 404 });
  }
}
