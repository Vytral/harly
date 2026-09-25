"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  documents,
  savedSignatures,
  signatureFields,
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
import {
  MAX_VECTOR_COMPRESSED_CHARS,
  validateVectorSaveInput,
} from "./signature-vector";

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
  savedSignatureId: z.uuid().optional(),
  signatureVectorBase64: z.string().max(MAX_VECTOR_COMPRESSED_CHARS).optional(),
}).refine((value) => Boolean(value.signatureVectorBase64 || value.savedSignatureId), {
  message: "Draw or choose a signature.",
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

async function resolveSignature(input: {
  workspaceId: string;
  userId: string;
  savedSignatureId?: string;
  signatureVectorBase64?: string;
}): Promise<{ png?: Buffer; vector?: string }> {
  if (input.signatureVectorBase64) {
    const checked = validateVectorSaveInput({ vectorData: input.signatureVectorBase64 });
    if (!checked.ok) throw new Error(checked.error);
    return { vector: checked.vectorData };
  }
  if (!input.savedSignatureId) throw new Error("Choose or draw a signature.");
  const [saved] = await db
    .select({ storageKey: savedSignatures.storageKey, kind: savedSignatures.kind })
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
  if (saved.kind === "vector") {
    const checked = validateVectorSaveInput({ vectorData: bytes.toString("utf8") });
    if (!checked.ok) throw new Error(checked.error);
    return { vector: checked.vectorData };
  }
  return { png: decodePng(bytes.toString("base64")) };
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

    const signature = await resolveSignature({
      workspaceId: context.organization.id,
      userId: context.user.id,
      savedSignatureId: parsed.data.savedSignatureId,
      signatureVectorBase64: parsed.data.signatureVectorBase64,
    });
    const result = await finalizeNativeSignature({
      workspaceId: context.organization.id,
      documentId: parsed.data.documentId,
      actorId: context.user.id,
      signerName: context.user.name,
      signerEmail: context.user.email ?? "",
      signaturePngBytes: signature.png,
      signatureVector: signature.vector,
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
  const parsed = z.object({ documentId: z.uuid(), recipientEmail: z.email().optional(), recipientName: z.string().trim().min(1).max(200).optional(), recipients: z.array(recipientSchema).min(1).max(10).optional(), subject: z.string().trim().max(255).optional(), message: z.string().trim().max(4000).nullable().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid recipient details." };
  const access = await getDocumentAccessForUser({ documentId: parsed.data.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot send this document for signing." };
  if (access.document.status !== "active") return { ok: false, error: "Archived documents cannot be sent for signing." };
  if (access.document.signatureStatus !== "unsigned") return { ok: false, error: "This document already has a signature workflow." };
  const recipients = parsed.data.recipients?.length
    ? parsed.data.recipients
    : parsed.data.recipientEmail && parsed.data.recipientName
      ? [{ email: parsed.data.recipientEmail, name: parsed.data.recipientName }]
      : [];
  if (recipients.length === 0) return { ok: false, error: "Add at least one signing recipient." };
  return createNativeSigningLink({ workspaceId: context.organization.id, documentId: parsed.data.documentId, actorId: context.user.id, recipients, subject: parsed.data.subject, message: parsed.data.message });
}

const draftFieldSchema = z.object({
  type: z.enum(["signature", "text"]),
  page: z.number().int().positive(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().positive().max(1),
  h: z.number().positive().max(1),
  label: z.string().trim().max(60).nullable().optional(),
  required: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
  recipientIndex: z.number().int().min(0).max(9).default(0),
});

const recipientSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(200),
});

/**
 * Recruiter-facing "place fields, then send" for the Documents Hub native
 * link flow — same atomic shape as offers/actions.ts's
 * saveOfferSignatureFieldsAndSend: replace the draft signatureFields rows,
 * freeze them into documents.fieldsSnapshot, THEN create the signing link.
 * Never split those into two client-driven calls.
 *
 * The document's own `signatureStatus === "unsigned"` guard (rechecked
 * under a row lock inside the transaction) is the idempotency guard here —
 * a concurrent double-click/retry blocks on the lock, then sees the status
 * already moved on and no-ops.
 */
export async function saveDocumentSignatureFieldsAndSend(input: unknown) {
  let context: Awaited<ReturnType<typeof requirePermission>>;
  try { context = await requirePermission("documents:manage"); } catch { return { ok: false, error: "You do not have permission to send documents for signing." }; }
  const parsed = z.object({
    documentId: z.uuid(),
    fields: z.array(draftFieldSchema).min(1).max(40),
    recipientEmail: z.email().optional(),
    recipientName: z.string().trim().min(1).max(200).optional(),
    recipients: z.array(recipientSchema).min(1).max(10).optional(),
    subject: z.string().trim().max(255).optional(),
    message: z.string().trim().max(4000).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid recipient or field details." };
  const recipients = parsed.data.recipients?.length
    ? parsed.data.recipients
    : parsed.data.recipientEmail && parsed.data.recipientName
      ? [{ email: parsed.data.recipientEmail, name: parsed.data.recipientName }]
      : [];
  if (recipients.length === 0) return { ok: false, error: "Add at least one signing recipient." };
  const recipientIndexes = new Set(parsed.data.fields.map((field) => field.recipientIndex));
  for (let index = 0; index < recipients.length; index += 1) {
    if (!parsed.data.fields.some((field) => field.recipientIndex === index && field.type === "signature" && field.required)) {
      return { ok: false, error: `Recipient ${index + 1} needs at least one required signature field.` };
    }
  }
  if ([...recipientIndexes].some((index) => index >= recipients.length)) return { ok: false, error: "Every field must be assigned to an existing recipient." };

  const access = await getDocumentAccessForUser({ documentId: parsed.data.documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot send this document for signing." };
  if (access.document.status !== "active") return { ok: false, error: "Archived documents cannot be sent for signing." };
  if (access.document.signatureStatus !== "unsigned") return { ok: false, error: "This document already has a signature workflow." };

  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ signatureStatus: documents.signatureStatus })
        .from(documents)
        .where(and(eq(documents.id, parsed.data.documentId), eq(documents.workspaceId, context.organization.id)))
        .for("update")
        .limit(1);
      if (!locked || locked.signatureStatus !== "unsigned") {
        throw new Error("This document already has a signature workflow.");
      }

      await tx.delete(signatureFields).where(eq(signatureFields.documentId, parsed.data.documentId));

      const inserted = await tx
        .insert(signatureFields)
        .values(
          parsed.data.fields.map((f) => ({
            workspaceId: context.organization.id,
            documentId: parsed.data.documentId,
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            w: f.w,
            h: f.h,
            label: f.label ?? null,
            required: f.required,
            order: f.order,
            createdById: context.user.id,
          })),
        )
        .returning();

      const snapshot = inserted.map((f, index) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        label: f.label,
        required: f.required,
        order: f.order,
        recipientIndex: parsed.data.fields[index]?.recipientIndex ?? 0,
      }));

      await tx
        .update(documents)
        .set({ fieldsSnapshot: snapshot })
        .where(and(eq(documents.id, parsed.data.documentId), eq(documents.workspaceId, context.organization.id)));
    });
  } catch (error) {
    log.error({ error, documentId: parsed.data.documentId }, "saveDocumentSignatureFieldsAndSend: failed to save fields");
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the field placement." };
  }

  return createNativeSigningLink({ workspaceId: context.organization.id, documentId: parsed.data.documentId, actorId: context.user.id, recipients, subject: parsed.data.subject, message: parsed.data.message });
}
