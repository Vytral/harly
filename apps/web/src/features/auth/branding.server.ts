import "server-only";

import { eq } from "drizzle-orm";
import { db, organization, workspaceSettings } from "@harly/db";

import { createLogger } from "@/lib/logger";

const log = createLogger("auth:branding");

export type AuthBranding = {
  /** Workspace display name, or "Harly" when no workspace exists yet. */
  name: string;
  /** Absolute/relative logo URL, or null to fall back to the Harly wordmark. */
  logoUrl: string | null;
  /** Optional short tagline shown under the workspace name in the brand lockup. */
  tagline: string | null;
};

const HARLY_FALLBACK: AuthBranding = {
  name: "Harly",
  logoUrl: null,
  tagline: null,
};

/**
 * Resolve the workspace brand lockup for the (unauthenticated) staff auth
 * screens. Single-org deployment, so this reads the one organization row with
 * no session. Prefers the sidebar/full logo, then the square org logo; when a
 * deployment hasn't set any, the caller renders the Harly wordmark fallback.
 *
 * Never throws — degrades to the Harly fallback so auth always renders.
 */
export async function getAuthBranding(): Promise<AuthBranding> {
  try {
    const [row] = await db
      .select({
        name: organization.name,
        logo: organization.logo,
        sidebarLogoUrl: workspaceSettings.sidebarLogoUrl,
        tagline: workspaceSettings.tagline,
      })
      .from(organization)
      .leftJoin(
        workspaceSettings,
        eq(workspaceSettings.organizationId, organization.id),
      )
      .limit(1);

    if (!row) return HARLY_FALLBACK;

    return {
      name: row.name?.trim() || "Harly",
      logoUrl: row.sidebarLogoUrl?.trim() || row.logo?.trim() || null,
      tagline: row.tagline?.trim() || null,
    };
  } catch (error) {
    log.error(error, "getAuthBranding failed; using Harly fallback");
    return HARLY_FALLBACK;
  }
}
