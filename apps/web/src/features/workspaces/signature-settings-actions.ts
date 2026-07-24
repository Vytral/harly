"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";

const schema = z.object({
  nativeSignEnabled: z.boolean(),
  remoteSignEnabled: z.boolean(),
  savedSignaturesEnabled: z.boolean(),
  signatureOtpEnabled: z.boolean(),
  signatureTimelineEnabled: z.boolean(),
  signatureSecurityMode: z.enum(["link_only", "email_otp", "sso"]),
  signatureExpirationDays: z.number().int().min(1).max(365),
});

export async function saveSignatureSettings(input: unknown) {
  const context = await requirePermission("settings:edit");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid signature settings." };
  if (parsed.data.signatureSecurityMode === "sso") return { ok: false, error: "SSO signing is reserved for a future release." };
  const data = { ...parsed.data, signatureSecurityMode: parsed.data.signatureOtpEnabled ? "email_otp" : parsed.data.signatureSecurityMode, updatedAt: new Date() };
  await db.insert(workspaceSettings).values({ organizationId: context.organization.id, ...data }).onConflictDoUpdate({ target: workspaceSettings.organizationId, set: data });
  revalidatePath("/settings/signature");
  revalidatePath("/dashboard/documents");
  return { ok: true };
}
