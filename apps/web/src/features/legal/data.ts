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

export const VALID_LEGAL_SLUGS = Object.keys(LEGAL_SLUG_MAP);

export type LegalPageData = {
  workspaceName: string;
  workspaceSlug: string;
  pageTitle: string;
  content: string;
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
      legalPages: workspaceSettings.legalPages,
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

  return {
    workspaceName: ws.name,
    workspaceSlug: ws.slug,
    pageTitle: pageKey
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .trim(),
    content,
  };
}
