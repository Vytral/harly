"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";

export type LegalSettingsActionResult = { ok: boolean; error?: string };

export type LegalPageKey =
  | "privacyPolicy"
  | "termsOfService"
  | "cookiePolicy"
  | "candidateNotice"
  | "aiTransparencyNotice";

export type LegalPages = Partial<Record<LegalPageKey, string>>;

const saveSchema = z.object({
  legalEntityName: z.string().trim().max(200).optional(),
  legalEntityAddress: z.string().trim().max(500).optional(),
  legalEntityEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  legalEntityWebsite: z.string().trim().url().max(500).optional().or(z.literal("")),
  legalJurisdiction: z.enum(["eu", "us", "cl", "br", "other"]).optional(),
  dpoEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  dataRetentionApplicantsMonths: z.number().int().min(1).max(120).optional(),
  dataRetentionTalentPoolMonths: z.number().int().min(1).max(120).optional(),
  dataRetentionEnabled: z.boolean().optional(),
  consentCheckboxText: z.string().trim().max(500).optional(),
  legalPages: z
    .record(z.string(), z.string().max(50000))
    .optional(),
});

export type LegalSettingsInput = z.infer<typeof saveSchema>;

export async function saveLegalSettingsAction(
  input: LegalSettingsInput,
): Promise<LegalSettingsActionResult> {
  const context = await requirePermission("settings:edit");

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const d = parsed.data;

  // Determine if legal config is "complete enough" to mark as configured.
  // Minimum: entity name + at least one legal page.
  const hasEntity = Boolean(d.legalEntityName);
  const hasPages = d.legalPages && Object.keys(d.legalPages).length > 0;
  const legalConfigured = hasEntity && hasPages;

  const updateData: Record<string, unknown> = {
    legalEntityName: d.legalEntityName || null,
    legalEntityAddress: d.legalEntityAddress || null,
    legalEntityEmail: d.legalEntityEmail || null,
    legalEntityWebsite: d.legalEntityWebsite || null,
    legalJurisdiction: d.legalJurisdiction || null,
    dpoEmail: d.dpoEmail || null,
    dataRetentionApplicantsMonths: d.dataRetentionApplicantsMonths ?? 6,
    dataRetentionTalentPoolMonths: d.dataRetentionTalentPoolMonths ?? 24,
    dataRetentionEnabled: d.dataRetentionEnabled ?? false,
    consentCheckboxText: d.consentCheckboxText || null,
    legalConfigured,
    updatedAt: new Date(),
  };

  // Merge legal pages , only update provided keys, keep existing ones.
  if (d.legalPages) {
    const [existing] = await db
      .select({ legalPages: workspaceSettings.legalPages })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, context.organization.id))
      .limit(1);

    const merged = {
      ...((existing?.legalPages as LegalPages) ?? {}),
      ...d.legalPages,
    };

    // Remove keys set to empty string (user cleared them).
    for (const key of Object.keys(merged) as LegalPageKey[]) {
      if (merged[key] === "") {
        delete merged[key];
      }
    }

    updateData.legalPages = merged;

    // Recalculate configured status after merge.
    const mergedPageCount = Object.keys(merged).length;
    updateData.legalConfigured = hasEntity && mergedPageCount > 0;
  }

  await db
    .insert(workspaceSettings)
    .values({
      organizationId: context.organization.id,
      ...updateData,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: updateData,
    });

  revalidatePath("/settings");
  revalidatePath("/settings/legal");
  return { ok: true };
}

export type LegalSettingsData = {
  legalEntityName: string | null;
  legalEntityAddress: string | null;
  legalEntityEmail: string | null;
  legalEntityWebsite: string | null;
  legalJurisdiction: string | null;
  dpoEmail: string | null;
  dataRetentionApplicantsMonths: number;
  dataRetentionTalentPoolMonths: number;
  dataRetentionEnabled: boolean;
  consentCheckboxText: string | null;
  legalPages: LegalPages;
  legalConfigured: boolean;
};

export async function getLegalSettingsData(): Promise<LegalSettingsData> {
  const context = await requirePermission("settings:edit");

  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, context.organization.id))
    .limit(1);

  return {
    legalEntityName: settings?.legalEntityName ?? null,
    legalEntityAddress: settings?.legalEntityAddress ?? null,
    legalEntityEmail: settings?.legalEntityEmail ?? null,
    legalEntityWebsite: settings?.legalEntityWebsite ?? null,
    legalJurisdiction: settings?.legalJurisdiction ?? null,
    dpoEmail: settings?.dpoEmail ?? null,
    dataRetentionApplicantsMonths:
      settings?.dataRetentionApplicantsMonths ?? 6,
    dataRetentionTalentPoolMonths:
      settings?.dataRetentionTalentPoolMonths ?? 24,
    dataRetentionEnabled: settings?.dataRetentionEnabled ?? false,
    consentCheckboxText: settings?.consentCheckboxText ?? null,
    legalPages: (settings?.legalPages as LegalPages) ?? {},
    legalConfigured: settings?.legalConfigured ?? false,
  };
}
