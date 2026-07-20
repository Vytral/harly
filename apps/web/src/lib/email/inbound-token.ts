import "server-only";

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { applications, db, workspaceSettings } from "@harly/db";

/** Resend/SMTP need a hostname, not a URL, localhost, or a host:port pair. */
export function normalizeInboundReplyDomain(value: string): string | null {
  const domain = value.trim().toLowerCase();
  if (
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
  ) {
    return null;
  }
  return domain;
}

/**
 * Lazily generate and persist the opaque inbound-reply routing token for an
 * application. Idempotent , returns the existing token if one is already
 * set. Used to build the `reply+{token}@{domain}` Reply-To address on
 * candidate-facing sends.
 */
export async function ensureApplicationInboundToken(
  applicationId: string,
): Promise<string> {
  const [existing] = await db
    .select({ inboundToken: applications.inboundToken })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (existing?.inboundToken) {
    return existing.inboundToken;
  }

  const token = randomBytes(9).toString("base64url");

  await db
    .update(applications)
    .set({ inboundToken: token })
    .where(eq(applications.id, applicationId));

  return token;
}

/**
 * Build the `reply+{token}@{domain}` Reply-To address for a candidate-facing
 * send tied to an application, or `undefined` when the workspace hasn't
 * turned inbound email on (in which case sends behave exactly as before ,
 * no Reply-To override).
 */
export async function getInboundReplyTo(
  workspaceId: string,
  applicationId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({
      emailInboundEnabled: workspaceSettings.emailInboundEnabled,
      emailInboundReplyDomain: workspaceSettings.emailInboundReplyDomain,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);

  if (!row?.emailInboundEnabled || !row.emailInboundReplyDomain) {
    return undefined;
  }

  const domain = normalizeInboundReplyDomain(row.emailInboundReplyDomain);
  if (!domain) return undefined;

  const token = await ensureApplicationInboundToken(applicationId);
  return `reply+${token}@${domain}`;
}
