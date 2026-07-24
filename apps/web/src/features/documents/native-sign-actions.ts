"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  savedSignatures,
  workspaceSettings,
} from "@harly/db";

import { getDocumentAccessForUser } from "./access";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";
import type { SignaturePlacement } from "@/lib/esign/native/bake";
import { createNativeSigningLink } from "@/lib/esign/native/remote";
import { finalizeNativeSignature } from "@/lib/esign/native/finalize";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

const log = createLogger("native-sign-actions");
const placementSchema = z.object({
  page: z.number().int().positive(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().positive().max(1),
  h: z.number().positive().max(1),
});

const inputSchema = z.object({
  documentId: z.uuid(),
  placements: z.array(placementSchema).min(1).max(20),
  signaturePngBase64: z.string().max(700_000).optional(),
  savedSignatureId: z.uuid().optional(),
});

export type NativeSignResult =
  | {
      ok: true;
      envelopeId: string;
      signedDocumentVersionId: string;
      signedArtifactId: string;
      certificateArtifactId: string;
      previewArtifactIds: string[];
    }
  | { ok: false; error: string };

function decodePng(value: string) {
  const raw = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = Buffer.from(raw, "base64");
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < pngHeader.length || !bytes.subarray(0, 8).equals(pngHeader)) {
    throw new Error("Signature must be a valid PNG image.");
  }
  return bytes;
}

async function getSignatureBytes(input: {
  workspaceId: string;
  userId: string;
  signaturePngBase64?: string;
  savedSignatureId?: string;
}) {
  if (input.signaturePngBase64) return decodePng(input.signaturePngBase64);
  if (!input.savedSignatureId) throw new Error("Choose or draw a signature.");
  const [saved] = await db
    .select({ storageKey: savedSignatures.storageKey })
    .from(savedSignatures)
    .where(
      and(
        eq(savedSignatures.id, input.savedSignatureId),
        eq(savedSignatures.workspaceId, input.workspaceId),
        eq(savedSignatures.ownerType, "user"),
        eq(savedSignatures.ownerId, input.userId),
        isNull(savedSignatures.deletedAt),
      ),
    )
    .limit(1);
  if (!saved) throw new Error("Saved signature not found.");
  const bytes = await storage.read(saved.storageKey);
  return decodePng(bytes.toString("base64"));
}

/**
 * Self-sign a document in one transaction. The public remote flow uses the
 * same finalization helper once its token/OTP checks have completed.
 */
export async function signDocumentNatively(input: unknown): Promise<NativeSignResult> {
  let context: Awaited<ReturnType<typeof requirePermission>>;
  try {
    context = await requirePermission("documents:manage");
  } catch {
    return { ok: false, error: "You do not have permission to sign documents." };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid signature details." };
  const access = await getDocumentAccessForUser({
    documentId: parsed.data.documentId,
    workspaceId: context.organization.id,
    userId: context.user.id,
    roleKey: context.roleKey,
  });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot sign this document." };
  if (access.document.status !== "active") return { ok: false, error: "Archived documents cannot be signed." };
  if (access.document.signatureStatus !== "unsigned") return { ok: false, error: "This document already has a signature workflow." };
  if (access.document.mimeType !== "application/pdf") return { ok: false, error: "Native signing requires a PDF document." };

  try {
    const [settings] = await db
      .select({ enabled: workspaceSettings.nativeSignEnabled })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, context.organization.id))
      .limit(1);
    if (!settings?.enabled) return { ok: false, error: "Native signing is not enabled for this workspace." };

    const signatureBytes = await getSignatureBytes({
      workspaceId: context.organization.id,
      userId: context.user.id,
      signaturePngBase64: parsed.data.signaturePngBase64,
      savedSignatureId: parsed.data.savedSignatureId,
    });
    const result = await finalizeNativeSignature({
      workspaceId: context.organization.id,
      documentId: parsed.data.documentId,
      actorId: context.user.id,
      signerName: context.user.name,
      signerEmail: context.user.email ?? "",
      signaturePngBytes: signatureBytes,
      placements: parsed.data.placements as SignaturePlacement[],
      verification: "self_sign",
    });
    return {
      ok: true,
      envelopeId: result.envelopeId,
      signedDocumentVersionId: result.versionId,
      signedArtifactId: result.artifacts.find((artifact) => artifact.kind === "signed_document")?.id ?? "",
      certificateArtifactId: result.artifacts.find((artifact) => artifact.kind === "completion_certificate")?.id ?? "",
      previewArtifactIds: result.artifacts.filter((artifact) => artifact.kind.startsWith("signed_preview_")).map((artifact) => artifact.id),
    };
  } catch (error) {
    log.error({ error, documentId: parsed.data.documentId }, "native signature failed");
    return { ok: false, error: error instanceof Error ? error.message : "Could not sign the document." };
  }
}

export async function getNativeSignatureSettings() {
  const context = await getWorkspaceContext();
  const [settings] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.organizationId, context.organization.id)).limit(1);
  return settings ?? null;
}

export async function sendDocumentForNativeSignature(input: unknown) {
  let context: Awaited<ReturnType<typeof requirePermission>>;
  try { context = await requirePermission("documents:manage"); } catch { return { ok: false, error: "You do not have permission to send documents for signing." }; }
  const parsed = z.object({ documentId: z.uuid(), recipientEmail: z.email(), recipientName: z.string().trim().min(1).max(200), subject: z.string().trim().max(255).optional(), message: z.string().trim().max(4000).nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid recipient details." };
  const access = await getDocumentAccessForUser({ documentId: parsed.data.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot send this document for signing." };
  if (access.document.status !== "active") return { ok: false, error: "Archived documents cannot be sent for signing." };
  if (access.document.signatureStatus !== "unsigned") return { ok: false, error: "This document already has a signature workflow." };
  return createNativeSigningLink({ workspaceId: context.organization.id, documentId: parsed.data.documentId, actorId: context.user.id, recipientEmail: parsed.data.recipientEmail, recipientName: parsed.data.recipientName, subject: parsed.data.subject, message: parsed.data.message });
}
