import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import {
  activityEvents,
  db,
  documentLegalHolds,
  documentVersions,
  signatureArtifacts,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
} from "@harly/db";

import { getDocumentAccess } from "@/features/documents/data";
import { requirePermission } from "@/features/workspaces/permissions-server";

export const runtime = "nodejs";

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function evidenceFileName(name: string) {
  return `${name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "document"}-evidence.json`;
}

/**
 * Export an access-controlled, reproducible evidence manifest. Binary signed
 * artifacts are intentionally not embedded in JSON; the manifest contains
 * short, authenticated download paths that re-check the document ACL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const context = await requirePermission("documents:read");
    const { documentId } = await params;
    const access = await getDocumentAccess(documentId, {
      workspaceId: context.organization.id,
      userId: context.user.id,
      roleKey: context.roleKey,
    });
    if (!access) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const [versions, holds, activity, envelope] = await Promise.all([
      db
        .select({
          id: documentVersions.id,
          versionNumber: documentVersions.versionNumber,
          storageKey: documentVersions.storageKey,
          sizeBytes: documentVersions.sizeBytes,
          checksum: documentVersions.checksum,
          isCurrent: documentVersions.isCurrent,
          uploadedById: documentVersions.uploadedById,
          createdAt: documentVersions.createdAt,
        })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, context.organization.id),
            eq(documentVersions.documentId, documentId),
          ),
        )
        .orderBy(desc(documentVersions.versionNumber)),
      db
        .select({
          id: documentLegalHolds.id,
          reason: documentLegalHolds.reason,
          reference: documentLegalHolds.reference,
          placedById: documentLegalHolds.placedById,
          placedAt: documentLegalHolds.placedAt,
          releasedById: documentLegalHolds.releasedById,
          releasedAt: documentLegalHolds.releasedAt,
          releaseReason: documentLegalHolds.releaseReason,
        })
        .from(documentLegalHolds)
        .where(
          and(
            eq(documentLegalHolds.workspaceId, context.organization.id),
            eq(documentLegalHolds.documentId, documentId),
          ),
        )
        .orderBy(desc(documentLegalHolds.placedAt)),
      db
        .select({
          id: activityEvents.id,
          actorId: activityEvents.actorId,
          type: activityEvents.type,
          metadata: activityEvents.metadata,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.workspaceId, context.organization.id),
            eq(activityEvents.entityType, "document"),
            eq(activityEvents.entityId, documentId),
          ),
        )
        .orderBy(activityEvents.createdAt),
      access.document.signatureEnvelopeRefId
        ? db
            .select()
            .from(signatureEnvelopes)
            .where(
              and(
                eq(signatureEnvelopes.id, access.document.signatureEnvelopeRefId),
                eq(signatureEnvelopes.workspaceId, context.organization.id),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : access.document.signatureEnvelopeId
          ? db
              .select()
              .from(signatureEnvelopes)
              .where(
                and(
                  eq(signatureEnvelopes.workspaceId, context.organization.id),
                  eq(signatureEnvelopes.provider, access.document.signatureProvider ?? "docusign"),
                  eq(signatureEnvelopes.providerEnvelopeId, access.document.signatureEnvelopeId),
                ),
              )
              .limit(1)
              .then((rows) => rows[0] ?? null)
          : Promise.resolve(null),
    ]);

    const [recipients, events, artifacts] = envelope
      ? await Promise.all([
          db
            .select()
            .from(signatureRecipients)
            .where(
              and(
                eq(signatureRecipients.workspaceId, context.organization.id),
                eq(signatureRecipients.envelopeId, envelope.id),
              ),
            )
            .orderBy(signatureRecipients.routingOrder, signatureRecipients.createdAt),
          db
            .select()
            .from(signatureEvents)
            .where(
              and(
                eq(signatureEvents.workspaceId, context.organization.id),
                eq(signatureEvents.envelopeId, envelope.id),
              ),
            )
            .orderBy(signatureEvents.createdAt),
          db
            .select()
            .from(signatureArtifacts)
            .where(
              and(
                eq(signatureArtifacts.workspaceId, context.organization.id),
                eq(signatureArtifacts.envelopeId, envelope.id),
              ),
            )
            .orderBy(signatureArtifacts.createdAt),
        ])
      : [[], [], []];

    await db.insert(activityEvents).values({
      workspaceId: context.organization.id,
      actorId: context.user.id,
      entityType: "document",
      entityId: documentId,
      type: "document.evidence_exported",
      metadata: {
        envelopeId: envelope?.id ?? null,
        artifactCount: artifacts.length,
        versionCount: versions.length,
      },
    });

    const manifest = {
      schemaVersion: "harly.document-evidence.v1",
      exportedAt: new Date().toISOString(),
      exportedBy: context.user.id,
      workspaceId: context.organization.id,
      document: {
        id: access.document.id,
        name: access.document.name,
        originalName: access.document.originalName,
        mimeType: access.document.mimeType,
        sizeBytes: access.document.sizeBytes,
        checksum: access.document.checksum,
        status: access.document.status,
        signatureStatus: access.document.signatureStatus,
        signatureProvider: access.document.signatureProvider,
        signatureEnvelopeId: access.document.signatureEnvelopeId,
        createdAt: iso(access.document.createdAt),
        updatedAt: iso(access.document.updatedAt),
      },
      versions: versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        sizeBytes: version.sizeBytes,
        checksum: version.checksum,
        isCurrent: version.isCurrent,
        uploadedById: version.uploadedById,
        createdAt: iso(version.createdAt),
      })),
      legalHolds: holds.map((hold) => ({
        id: hold.id,
        reason: hold.reason,
        reference: hold.reference,
        placedById: hold.placedById,
        placedAt: iso(hold.placedAt),
        releasedById: hold.releasedById,
        releasedAt: iso(hold.releasedAt),
        releaseReason: hold.releaseReason,
      })),
      signature: envelope
        ? {
            id: envelope.id,
            provider: envelope.provider,
            providerEnvelopeId: envelope.providerEnvelopeId,
            kind: envelope.kind,
            status: envelope.status,
            subject: envelope.subject,
            offerId: envelope.offerId,
            sentAt: iso(envelope.sentAt),
            deliveredAt: iso(envelope.deliveredAt),
            completedAt: iso(envelope.completedAt),
            declinedAt: iso(envelope.declinedAt),
            voidedAt: iso(envelope.voidedAt),
            lastEventAt: iso(envelope.lastEventAt),
            recipients: recipients.map((recipient) => ({
              providerRecipientId: recipient.providerRecipientId,
              role: recipient.role,
              email: recipient.email,
              name: recipient.name,
              routingOrder: recipient.routingOrder,
              status: recipient.status,
              signedAt: iso(recipient.signedAt),
              declinedAt: iso(recipient.declinedAt),
              declinedReason: recipient.declinedReason,
            })),
            events: events.map((event) => ({
              eventKey: event.eventKey,
              eventType: event.eventType,
              generatedAt: iso(event.generatedAt),
              retryCount: event.retryCount,
              payload: event.payload,
              processedAt: iso(event.processedAt),
              processingError: event.processingError,
              createdAt: iso(event.createdAt),
            })),
            artifacts: artifacts.map((artifact) => ({
              id: artifact.id,
              kind: artifact.kind,
              mimeType: artifact.mimeType,
              sizeBytes: artifact.sizeBytes,
              checksum: artifact.checksum,
              documentId: artifact.documentId,
              documentVersionId: artifact.documentVersionId,
              createdAt: iso(artifact.createdAt),
              downloadUrl: `${request.nextUrl.origin}/api/documents/${documentId}/evidence/${artifact.id}`,
            })),
          }
        : null,
      activity,
    };

    return new Response(JSON.stringify(manifest, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(evidenceFileName(access.document.name))}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Evidence export could not be created." }, { status: 404 });
  }
}
