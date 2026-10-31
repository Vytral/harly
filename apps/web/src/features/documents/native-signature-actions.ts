"use server";

import { z } from "zod";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { remindNativeSigner } from "@/lib/esign/native/remote";
import { getNativeSignatureTimeline, type SignatureTimeline } from "@/lib/esign/native/timeline";
import { getNativeVoidImpact, type NativeVoidImpact } from "@/lib/esign/native/void";
import { resolveDocumentAccessInScope } from "./scope-access";

const idSchema = z.uuid();

/** Audit timeline + per-signer state. Any role that can open the document may read it. */
export async function getDocumentSignatureTimeline(documentId: string): Promise<SignatureTimeline | null> {
  if (!idSchema.safeParse(documentId).success) return null;
  const context = await getWorkspaceContext();
  const access = await resolveDocumentAccessInScope({ documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access) return null;
  return getNativeSignatureTimeline({ workspaceId: context.organization.id, documentId });
}

/** What voiding does to earlier signers, for the void dialog copy. */
export async function getDocumentVoidImpact(documentId: string): Promise<NativeVoidImpact> {
  const empty: NativeVoidImpact = { voidable: false, signers: [], signedCount: 0, warning: null };
  if (!idSchema.safeParse(documentId).success) return empty;
  const context = await requirePermission("documents:manage");
  const access = await resolveDocumentAccessInScope({ documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return empty;
  return getNativeVoidImpact({ workspaceId: context.organization.id, documentId });
}

/** Manual "Remind now" for whoever is currently expected to sign. */
export async function remindDocumentSigner(documentId: string): Promise<{ ok: true; recipientName: string; recipientEmail: string } | { ok: false; error: string }> {
  if (!idSchema.safeParse(documentId).success) return { ok: false, error: "Invalid document." };
  let context: Awaited<ReturnType<typeof requirePermission>>;
  try { context = await requirePermission("documents:manage"); } catch { return { ok: false, error: "You cannot send reminders for this document." }; }
  const access = await resolveDocumentAccessInScope({ documentId, workspaceId: context.organization.id, userId: context.user.id, roleKey: context.roleKey });
  if (!access || access.level !== "manage") return { ok: false, error: "You cannot send reminders for this document." };
  return remindNativeSigner({ workspaceId: context.organization.id, documentId, actorId: context.user.id });
}
