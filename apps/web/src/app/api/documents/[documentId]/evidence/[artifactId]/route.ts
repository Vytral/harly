import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, signatureArtifacts, signatureEnvelopes } from "@harly/db";

import { getDocumentAccess } from "@/features/documents/data";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string; artifactId: string }> },
) {
  try {
    void request;
    const context = await requirePermission("documents:read");
    const { documentId, artifactId } = await params;
    const access = await getDocumentAccess(documentId, {
      workspaceId: context.organization.id,
      userId: context.user.id,
      roleKey: context.roleKey,
    });
    if (!access) return NextResponse.json({ error: "Artifact not found." }, { status: 404 });

    const [artifact] = await db
      .select()
      .from(signatureArtifacts)
      .where(
        and(
          eq(signatureArtifacts.id, artifactId),
          eq(signatureArtifacts.workspaceId, context.organization.id),
        ),
      )
      .limit(1);
    if (!artifact) return NextResponse.json({ error: "Artifact not found." }, { status: 404 });

    let envelopeMatches = access.document.signatureEnvelopeRefId === artifact.envelopeId;
    if (!envelopeMatches && access.document.signatureEnvelopeId) {
      const [envelope] = await db
        .select({ id: signatureEnvelopes.id })
        .from(signatureEnvelopes)
        .where(
          and(
            eq(signatureEnvelopes.id, artifact.envelopeId),
            eq(signatureEnvelopes.workspaceId, context.organization.id),
            eq(signatureEnvelopes.provider, access.document.signatureProvider ?? "docuseal"),
            eq(signatureEnvelopes.providerEnvelopeId, access.document.signatureEnvelopeId),
          ),
        )
        .limit(1);
      envelopeMatches = Boolean(envelope);
    }
    if (artifact.documentId && artifact.documentId !== documentId) envelopeMatches = false;
    if (!envelopeMatches) return NextResponse.json({ error: "Artifact not found." }, { status: 404 });

    const bytes = await storage.read(artifact.storageKey);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${artifact.kind}.${artifact.mimeType === "application/pdf" ? "pdf" : "bin"}`)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Artifact not found." }, { status: 404 });
  }
}
