"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "@/i18n/server";

import { db, workspaceSettings } from "@harly/db";
import { requirePermission } from "@/features/workspaces/permissions-server";

const schema = z.object({
  nativeSignEnabled: z.boolean(),
  remoteSignEnabled: z.boolean(),
  savedSignaturesEnabled: z.boolean(),
  vectorSignaturesEnabled: z.boolean(),
  signatureOtpEnabled: z.boolean(),
  signatureTimelineEnabled: z.boolean(),
  signatureSecurityMode: z.enum(["link_only", "email_otp", "sso"]),
  signatureExpirationDays: z.number().int().min(3).max(365),
  signatureReminderCadenceDays: z.number().int().min(0).max(30),
  signatureMaxReminders: z.number().int().min(0).max(10),
});

export async function saveSignatureSettings(input: unknown) {
  const context = await requirePermission("settings:edit");
  const t = await getTranslations("server.workspaces.signatureSettingsActions");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidNumbers") };
  if (parsed.data.signatureSecurityMode === "sso") return { ok: false, error: t("ssoReserved") };
  const data = { ...parsed.data, vectorSignaturesEnabled: true, signatureSecurityMode: parsed.data.signatureOtpEnabled ? "email_otp" : parsed.data.signatureSecurityMode, updatedAt: new Date() };
  await db.insert(workspaceSettings).values({ organizationId: context.organization.id, ...data }).onConflictDoUpdate({ target: workspaceSettings.organizationId, set: data });
  revalidatePath("/settings/signature");
  revalidatePath("/dashboard/documents");
  return { ok: true };
}
