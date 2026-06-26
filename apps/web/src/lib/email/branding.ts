import "server-only";

import { eq } from "drizzle-orm";

import { db, organization, workspaceSettings } from "@harly/db";
import type { WorkspaceEmailBranding } from "@harly/emails";
import { normalizeCareerPageConfig } from "@/features/career-page/config";

/**
 * Resolve workspace branding for email templates: logo, primary color,
 * social links (from careerPageConfig.footer.socials), and display name.
 *
 * For logos, we prefer the email-optimized version (logoEmail) which is
 * always a raster format (PNG/JPG/WebP) for email client compatibility.
 * Falls back to the original logo if no email version exists.
 */
export async function getWorkspaceEmailBranding(
  workspaceId: string,
): Promise<WorkspaceEmailBranding> {
  const [row] = await db
    .select({
      name: organization.name,
      logoUrl: organization.logo,
      logoEmailUrl: organization.logoEmail,
      primaryColor: workspaceSettings.primaryColor,
      websiteUrl: workspaceSettings.websiteUrl,
      careerPageConfig: workspaceSettings.careerPageConfig,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .where(eq(organization.id, workspaceId))
    .limit(1);

  if (!row) {
    return { name: "Harly" };
  }

  const config = normalizeCareerPageConfig(row.careerPageConfig);

  // Prefer email-optimized logo, fall back to original
  const logoUrl = row.logoEmailUrl ?? row.logoUrl ?? null;

  return {
    name: row.name,
    logoUrl,
    primaryColor: row.primaryColor ?? null,
    websiteUrl: row.websiteUrl ?? null,
    socialLinks: config.footer.socials,
  };
}
