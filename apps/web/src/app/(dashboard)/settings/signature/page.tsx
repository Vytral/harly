import { eq } from "drizzle-orm";

import { db, workspaceSettings } from "@harly/db";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { SignatureSettingsCard } from "@/features/workspaces/SignatureSettingsCard";

export const dynamic = "force-dynamic";

export default async function SignatureSettingsPage() {
  await requirePagePermission("settings:edit");
  const context = await getWorkspaceContext();
  const [settings] = await db.select({ nativeSignEnabled: workspaceSettings.nativeSignEnabled, remoteSignEnabled: workspaceSettings.remoteSignEnabled, savedSignaturesEnabled: workspaceSettings.savedSignaturesEnabled, vectorSignaturesEnabled: workspaceSettings.vectorSignaturesEnabled, signatureOtpEnabled: workspaceSettings.signatureOtpEnabled, signatureTimelineEnabled: workspaceSettings.signatureTimelineEnabled, signatureSecurityMode: workspaceSettings.signatureSecurityMode, signatureExpirationDays: workspaceSettings.signatureExpirationDays, signatureReminderCadenceDays: workspaceSettings.signatureReminderCadenceDays, signatureMaxReminders: workspaceSettings.signatureMaxReminders }).from(workspaceSettings).where(eq(workspaceSettings.organizationId, context.organization.id)).limit(1);
  return <SignatureSettingsCard settings={settings ?? { nativeSignEnabled: true, remoteSignEnabled: false, savedSignaturesEnabled: false, vectorSignaturesEnabled: false, signatureOtpEnabled: false, signatureTimelineEnabled: false, signatureSecurityMode: "link_only", signatureExpirationDays: 30, signatureReminderCadenceDays: 3, signatureMaxReminders: 3 }} />;
}
