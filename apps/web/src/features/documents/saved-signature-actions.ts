"use server";

import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, savedSignatures, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { storage } from "@/lib/storage";

const MAX_SIGNATURE_BYTES = 500 * 1024;
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const signatureSchema = z.object({ pngBase64: z.string().max(700_000) });

function key(workspaceId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) throw new Error("Invalid workspace.");
  return `workspaces/${workspaceId}/signatures/saved/${randomUUID()}.png`;
}

function decodePng(input: string) {
  const raw = input.startsWith("data:") ? input.slice(input.indexOf(",") + 1) : input;
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length <= 0 || bytes.length > MAX_SIGNATURE_BYTES || !bytes.subarray(0, 8).equals(PNG_HEADER)) {
    throw new Error("Signature must be a PNG smaller than 500 KB.");
  }
  return bytes;
}

export async function saveSignature(input: unknown) {
  const context = await requirePermission("documents:manage");
  const parsed = signatureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid signature image." };
  const [settings] = await db
    .select({ enabled: workspaceSettings.savedSignaturesEnabled })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, context.organization.id))
    .limit(1);
  if (!settings?.enabled) return { ok: false, error: "Saved signatures are not enabled for this workspace." };
  try {
    const bytes = decodePng(parsed.data.pngBase64);
    const storageKey = key(context.organization.id);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await storage.put(storageKey, bytes, "image/png");
    const [saved] = await db.insert(savedSignatures).values({
      workspaceId: context.organization.id,
      ownerType: "user",
      ownerId: context.user.id,
      storageKey,
      mimeType: "image/png",
      sizeBytes: bytes.byteLength,
      checksum,
    }).returning({ id: savedSignatures.id });
    if (!saved) throw new Error("Signature could not be saved.");
    return { ok: true, id: saved.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Signature could not be saved." };
  }
}

export async function listSavedSignatures() {
  const context = await requirePermission("documents:manage");
  const rows = await db
    .select({ id: savedSignatures.id, createdAt: savedSignatures.createdAt, storageKey: savedSignatures.storageKey })
    .from(savedSignatures)
    .where(and(eq(savedSignatures.workspaceId, context.organization.id), eq(savedSignatures.ownerType, "user"), eq(savedSignatures.ownerId, context.user.id), isNull(savedSignatures.deletedAt)))
    .orderBy(desc(savedSignatures.createdAt));
  const withImages = await Promise.all(
    rows.map(async (row) => {
      try {
        const bytes = await storage.read(row.storageKey);
        return { id: row.id, createdAt: row.createdAt, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
      } catch {
        return null;
      }
    }),
  );
  return withImages.filter((row) => row !== null);
}

export async function deleteSavedSignature(input: { id: string }) {
  const context = await requirePermission("documents:manage");
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid signature." };
  const [signature] = await db.select({ storageKey: savedSignatures.storageKey })
    .from(savedSignatures)
    .where(and(eq(savedSignatures.id, parsed.data.id), eq(savedSignatures.workspaceId, context.organization.id), eq(savedSignatures.ownerType, "user"), eq(savedSignatures.ownerId, context.user.id), isNull(savedSignatures.deletedAt)))
    .limit(1);
  if (!signature) return { ok: false, error: "Signature not found." };
  await db.update(savedSignatures).set({ deletedAt: new Date() }).where(eq(savedSignatures.id, parsed.data.id));
  await storage.delete(signature.storageKey).catch(() => undefined);
  return { ok: true };
}
