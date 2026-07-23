import "server-only";

import { eq } from "drizzle-orm";

import { db, organization, workspaceSettings } from "@harly/db";
import type { WorkspaceEmailBranding } from "@harly/emails";
import { normalizeCareerPageConfig } from "@/features/career-page/config";

function appBaseUrl(): string {
  return (
    process.env.HARLY_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

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
      hideBranding: workspaceSettings.hideHarlyBranding,
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

  // Prefer email-optimized logo, fall back to original. Local storage returns
  // a relative /uploads/... path — email clients have no page origin to
  // resolve that against, so it must be made absolute here.
  const rawLogoUrl = row.logoEmailUrl ?? row.logoUrl ?? null;
  const logoUrl =
    rawLogoUrl && rawLogoUrl.startsWith("/")
      ? `${appBaseUrl()}${rawLogoUrl}`
      : rawLogoUrl;

  return {
    name: row.name,
    logoUrl,
    primaryColor: row.primaryColor ?? null,
    websiteUrl: row.websiteUrl ?? null,
    socialLinks: config.footer.socials,
    hideBranding: row.hideBranding ?? false,
  };
}
