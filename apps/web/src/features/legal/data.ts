import "server-only";

import { eq } from "drizzle-orm";

import { db, workspaceSettings, organization } from "@harly/db";

const LEGAL_SLUG_MAP: Record<string, string> = {
  "privacy-policy": "privacyPolicy",
  "terms-of-service": "termsOfService",
  "cookie-policy": "cookiePolicy",
  "candidate-notice": "candidateNotice",
  "ai-transparency-notice": "aiTransparencyNotice",
};

export const LEGAL_PAGE_TITLES: Record<string, string> = {
  "privacy-policy": "Privacy Policy",
  "terms-of-service": "Terms of Service",
  "cookie-policy": "Cookie Policy",
  "candidate-notice": "Candidate Privacy Notice",
  "ai-transparency-notice": "AI Transparency Notice",
};

export const VALID_LEGAL_SLUGS = Object.keys(LEGAL_SLUG_MAP);

export type LegalPageData = {
  workspaceName: string;
  workspaceSlug: string;
  logoUrl: string | null;
  primaryColor: string;
  websiteUrl: string | null;
  pageTitle: string;
  pageSlug: string;
  content: string;
  /** All published legal page slugs for this workspace — used for footer nav. */
  publishedSlugs: string[];
};

export async function getLegalPageData(
  workspaceSlug: string,
  pageSlug: string,
): Promise<LegalPageData | null> {
  const pageKey = LEGAL_SLUG_MAP[pageSlug];
  if (!pageKey) return null;

  const [ws] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      legalPages: workspaceSettings.legalPages,
      primaryColor: workspaceSettings.primaryColor,
      websiteUrl: workspaceSettings.websiteUrl,
    })
    .from(organization)
    .innerJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .where(eq(organization.slug, workspaceSlug))
    .limit(1);

  if (!ws) return null;

  const pages = ws.legalPages as Record<string, string> | null;
  const content = pages?.[pageKey];
  if (!content) return null;

  const publishedSlugs = VALID_LEGAL_SLUGS.filter((s) => {
    const k = LEGAL_SLUG_MAP[s];
    return k && pages?.[k];
  });

  return {
    workspaceName: ws.name,
    workspaceSlug: ws.slug,
    logoUrl: ws.logo ?? null,
    primaryColor: (ws.primaryColor as string | null) ?? "#18181b",
    websiteUrl: (ws.websiteUrl as string | null) ?? null,
    pageTitle: LEGAL_PAGE_TITLES[pageSlug] ?? pageSlug,
    pageSlug,
    content,
    publishedSlugs,
  };
}
