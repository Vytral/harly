import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db, documentAssociations, documents, offers } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";

export const runtime = "nodejs";

/**
 * Resolves the recruiter-placed field layout for a native offer, scoped
 * strictly by portal session -> offer -> association (never a raw client-
 * supplied documentId), matching the letter route's auth pattern. Returns []
 * when the offer predates this feature (no fieldsSnapshot yet) — the caller
 * falls back to the legacy free-placement flow in that case.
 */
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
      .select({ fieldsSnapshot: documents.fieldsSnapshot })
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

    return NextResponse.json(
      { fields: row?.fieldsSnapshot ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Could not load fields." }, { status: 404 });
  }
}
