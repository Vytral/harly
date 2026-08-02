import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, documentAssociations, documents, offers } from "@harly/db";
import { requireOfferPermission } from "@/features/workspaces/permissions-server";
import { getOrCreateNativeOfferDocument } from "@/lib/esign/native/offer-signing";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Streams the native offer-letter PDF to the RECRUITER placing signature/text
 * fields before sending — the dashboard counterpart to the portal's
 * candidate-facing letter route. Ensures the letter exists (recruiters can
 * open the placement dialog on a draft offer that's never been baked yet).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const { offerId } = await params;

  let context;
  try {
    context = await requireOfferPermission("offers:manage", offerId);
  } catch {
    return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  }
  const workspaceId = context.organization.id;

  const [offer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.workspaceId, workspaceId)))
    .limit(1);
  if (!offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });

  try {
    const prepared = await getOrCreateNativeOfferDocument({ workspaceId, offer });
    if (!prepared) {
      return NextResponse.json({ error: "Could not prepare the offer letter." }, { status: 422 });
    }

    const [row] = await db
      .select({ storageKey: documents.storageKey, mimeType: documents.mimeType, name: documents.name })
      .from(documentAssociations)
      .innerJoin(documents, eq(documents.id, documentAssociations.documentId))
      .where(
        and(
          eq(documentAssociations.workspaceId, workspaceId),
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
