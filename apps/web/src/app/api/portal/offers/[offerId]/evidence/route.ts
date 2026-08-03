import { cookies } from "next/headers";
import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import {
  applications,
  db,
  offers,
  signatureArtifacts,
  signatureEnvelopes,
  signatureEvidenceEvents,
} from "@harly/db";

import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { signatureEvidenceChainIsValid } from "@/lib/esign/evidence";

export const runtime = "nodejs";

function evidenceFileName(offerId: string) {
  return `offer-${offerId}-signature-evidence.json`;
}
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  const session = token ? await resolvePortalSession(token) : null;
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { offerId } = await params;
  const [offer] = await db
    .select({
      id: offers.id,
      applicationId: offers.applicationId,
      status: offers.status,
      signatureEnvelopeRefId: offers.signatureEnvelopeRefId,
    })
    .from(offers)
    .innerJoin(
      applications,
      and(
        eq(applications.id, offers.applicationId),
        eq(applications.workspaceId, offers.workspaceId),
        eq(applications.candidateId, session.candidateId),
      ),
    )
    .where(
      and(
        eq(offers.id, offerId),
        eq(offers.workspaceId, session.workspaceId),
        eq(offers.candidateId, session.candidateId),
        inArray(offers.status, ["sent", "accepted", "declined"]),
      ),
    )
    .limit(1);

  if (!offer?.signatureEnvelopeRefId) {
    return NextResponse.json({ error: "Signature evidence not found." }, { status: 404 });
  }

  const [envelope, events, artifacts] = await Promise.all([
    db
      .select({ id: signatureEnvelopes.id, provider: signatureEnvelopes.provider, status: signatureEnvelopes.status })
      .from(signatureEnvelopes)
      .where(
        and(
          eq(signatureEnvelopes.id, offer.signatureEnvelopeRefId),
          eq(signatureEnvelopes.workspaceId, session.workspaceId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(signatureEvidenceEvents)
      .where(
        and(
          eq(signatureEvidenceEvents.workspaceId, session.workspaceId),
          eq(signatureEvidenceEvents.envelopeId, offer.signatureEnvelopeRefId),
        ),
      )
      .orderBy(asc(signatureEvidenceEvents.occurredAt), asc(signatureEvidenceEvents.id)),
    db
      .select({
        id: signatureArtifacts.id,
        kind: signatureArtifacts.kind,
        checksum: signatureArtifacts.checksum,
        sizeBytes: signatureArtifacts.sizeBytes,
        mimeType: signatureArtifacts.mimeType,
        createdAt: signatureArtifacts.createdAt,
      })
      .from(signatureArtifacts)
      .where(
        and(
          eq(signatureArtifacts.workspaceId, session.workspaceId),
          eq(signatureArtifacts.envelopeId, offer.signatureEnvelopeRefId),
        ),
      )
      .orderBy(asc(signatureArtifacts.createdAt)),
  ]);

  const chain = events.map((event) => ({
    envelopeId: event.envelopeId,
    recipientId: event.recipientId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    payload: event.payload,
    previousHash: event.previousHash,
    currentHash: event.currentHash,
  }));

  const manifest = {
    schemaVersion: "harly.offer-signature-evidence.v1",
    exportedAt: new Date().toISOString(),
    offerId: offer.id,
    applicationId: offer.applicationId,
    status: offer.status,
    envelope,
    chainValid: signatureEvidenceChainIsValid(chain),
    events: chain.map((event) => ({
      ...event,
      occurredAt: event.occurredAt.toISOString(),
    })),
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      createdAt: artifact.createdAt.toISOString(),
    })),
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(evidenceFileName(offer.id))}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
