import "server-only";

import { and, eq } from "drizzle-orm";

import { db, memberSenderIdentity, user } from "@harly/db";
import type { EmailProviderConfig } from "@harly/emails";

import type { WorkspaceEmailStatus } from "./config";

/** The shared platform sender domain , never eligible for per-recruiter aliasing. */
export const PLATFORM_DEFAULT_DOMAIN = "harly.dev";

/** Pulls the domain out of a "From" string: `"Acme <hiring@acme.com>"` or a bare address. */
export function extractDomain(emailFrom: string | null): string | null {
  if (!emailFrom) return null;
  const match = emailFrom.match(/@([a-z0-9.-]+)/i);
  return match ? match[1]!.toLowerCase() : null;
}

/**
 * True only when the workspace has fully configured its own sending domain ,
 * distinct from the shared platform default. Per-recruiter sender identities
 * are gated on this: aliasing arbitrary local-parts on a domain we don't
 * control (the shared harly.dev default) would wreck its deliverability.
 */
export function hasCustomSendingDomain(
  status: Pick<WorkspaceEmailStatus, "enabled" | "provider" | "from">,
): boolean {
  if (!status.enabled || !status.provider) return false;
  const domain = extractDomain(status.from);
  return domain !== null && domain !== PLATFORM_DEFAULT_DOMAIN;
}

/**
 * Derive a `first.last` local-part from a display name: ASCII-fold accents,
 * lowercase, strip anything but letters/digits. Single-token names pass
 * through as-is. Collision suffixing happens at insert time, not here.
 */
export function generateLocalPart(name: string): string {
  const fold = (part: string) =>
    part
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const tokens = name.trim().split(/\s+/).filter(Boolean).map(fold).filter(Boolean);

  if (tokens.length === 0) return "member";
  if (tokens.length === 1) return tokens[0]!;
  return `${tokens[0]}.${tokens[tokens.length - 1]}`;
}

/**
 * Swap the resolved provider config's "From" for the triggering recruiter's
 * personal sender identity, when one applies. Falls back to the unmodified
 * config (shared workspace sender) whenever the workspace hasn't configured
 * a custom domain, or the member has no identity provisioned yet , this is
 * the safe default, never a hard failure.
 *
 * `config` must already be a resolved, non-null workspace config (from
 * `getWorkspaceEmailConfig`) , that function only returns non-null when the
 * workspace has email enabled with a provider and a "From" address, so
 * gating can be derived from `config.from` directly without a second query.
 */
export async function resolveSenderFromOverride(
  workspaceId: string,
  actorUserId: string | null | undefined,
  config: EmailProviderConfig | null,
): Promise<EmailProviderConfig | null> {
  if (
    !config ||
    !actorUserId ||
    !hasCustomSendingDomain({ enabled: true, provider: config.provider, from: config.from })
  ) {
    return config;
  }

  const domain = extractDomain(config.from);
  if (!domain) return config;

  const [identity] = await db
    .select({
      localPart: memberSenderIdentity.localPart,
      displayName: memberSenderIdentity.displayName,
      userName: user.name,
    })
    .from(memberSenderIdentity)
    .innerJoin(user, eq(user.id, memberSenderIdentity.userId))
    .where(
      and(
        eq(memberSenderIdentity.organizationId, workspaceId),
        eq(memberSenderIdentity.userId, actorUserId),
      ),
    )
    .limit(1);

  if (!identity) return config;

  const displayName = identity.displayName ?? identity.userName;
  return { ...config, from: `${displayName} <${identity.localPart}@${domain}>` };
}
