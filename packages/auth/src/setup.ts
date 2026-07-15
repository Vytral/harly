import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { APIError } from "better-auth/api";
import { and, eq, gt, sql as drizzleSql } from "drizzle-orm";

import {
  db,
  deploymentBootstrap,
  invitation,
  member,
  organization,
  user,
} from "@harly/db";

export const SETUP_CLAIM_TTL_MS = 15 * 60 * 1000;

export class SetupError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 409 | 410 | 503,
  ) {
    super(message);
    this.name = "SetupError";
  }
}

export function normalizeSetupEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Hash first so timingSafeEqual always receives equal-length buffers. */
export function constantTimeSecretEqual(supplied: string, expected: string): boolean {
  const left = createHash("sha256").update(supplied, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

export function setupClaimCookieName(publicUrl: string): string {
  return new URL(publicUrl).protocol === "https:"
    ? "__Host-harly-setup-claim"
    : "harly-setup-claim";
}

export async function reserveSetupClaim(input: {
  token: string;
  existingClaimId?: string | null;
  setupSecret?: string;
  initialAdminEmail?: string;
}): Promise<{ claimId: string; email: string; expiresAt: Date }> {
  const setupSecret = input.setupSecret ?? process.env.HARLY_SETUP_SECRET;
  const configuredEmail = input.initialAdminEmail ?? process.env.HARLY_INITIAL_ADMIN_EMAIL;
  if (!setupSecret || !configuredEmail) {
    throw new SetupError("Setup is not configured.", 503);
  }
  if (!constantTimeSecretEqual(input.token, setupSecret)) {
    throw new SetupError("Invalid setup token.", 401);
  }

  const email = normalizeSetupEmail(configuredEmail);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SETUP_CLAIM_TTL_MS);

  return db.transaction(async (tx) => {
    await tx
      .insert(deploymentBootstrap)
      .values({ id: 1, authorizedEmail: email })
      .onConflictDoNothing({ target: deploymentBootstrap.id });

    const [row] = await tx
      .select()
      .from(deploymentBootstrap)
      .where(eq(deploymentBootstrap.id, 1))
      .for("update")
      .limit(1);

    if (!row) throw new SetupError("Setup state is unavailable.", 503);
    if (row.completedAt) throw new SetupError("Setup has already been completed.", 410);
    if (normalizeSetupEmail(row.authorizedEmail) !== email) {
      throw new SetupError("The configured initial administrator does not match the reserved deployment.", 409);
    }

    const activeClaim = row.claimId && row.claimExpiresAt && row.claimExpiresAt > now;
    if (activeClaim && row.claimId !== input.existingClaimId) {
      throw new SetupError("Setup is already reserved by another session.", 409);
    }

    const claimId = activeClaim && row.claimId ? row.claimId : randomUUID();
    await tx
      .update(deploymentBootstrap)
      .set({ claimId, claimExpiresAt: expiresAt, updatedAt: now })
      .where(eq(deploymentBootstrap.id, 1));

    return { claimId, email, expiresAt };
  });
}

async function hasPendingInvitation(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(drizzleSql`lower(${invitation.email})`, normalizeSetupEmail(email)),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Gate used by Better Auth before every user insert. */
export async function authorizeUserCreation(input: {
  email: string;
  claimId?: string | null;
}): Promise<void> {
  const normalizedEmail = normalizeSetupEmail(input.email);
  const [bootstrap] = await db
    .select()
    .from(deploymentBootstrap)
    .where(eq(deploymentBootstrap.id, 1))
    .limit(1);

  if (
    bootstrap &&
    !bootstrap.completedAt &&
    bootstrap.claimId &&
    bootstrap.claimId === input.claimId &&
    bootstrap.claimExpiresAt &&
    bootstrap.claimExpiresAt > new Date() &&
    normalizeSetupEmail(bootstrap.authorizedEmail) === normalizedEmail
  ) {
    return;
  }

  if (await hasPendingInvitation(normalizedEmail)) return;

  throw new APIError("BAD_REQUEST", {
    message: bootstrap?.completedAt
      ? "Signups are invite-only. Ask a workspace admin to invite you."
      : "Complete /setup with the initial administrator email before signing up.",
  });
}

export async function completeDeploymentBootstrap(input: {
  claimId: string;
  userId: string;
  email: string;
  organizationName: string;
  organizationSlug: string;
}): Promise<{ organizationId: string }> {
  const normalizedEmail = normalizeSetupEmail(input.email);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [bootstrap] = await tx
      .select()
      .from(deploymentBootstrap)
      .where(eq(deploymentBootstrap.id, 1))
      .for("update")
      .limit(1);

    if (!bootstrap) throw new SetupError("Setup has not been claimed.", 403);
    if (bootstrap.completedAt) throw new SetupError("Setup has already been completed.", 410);
    if (!bootstrap.claimId || bootstrap.claimId !== input.claimId) {
      throw new SetupError("The setup claim is invalid.", 403);
    }
    if (!bootstrap.claimExpiresAt || bootstrap.claimExpiresAt <= now) {
      throw new SetupError("The setup claim has expired.", 410);
    }
    if (normalizeSetupEmail(bootstrap.authorizedEmail) !== normalizedEmail) {
      throw new SetupError("The signed-in account does not match the initial administrator.", 403);
    }

    const [account] = await tx
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);
    if (!account || normalizeSetupEmail(account.email) !== normalizedEmail) {
      throw new SetupError("The authenticated account could not be verified.", 403);
    }

    const [existingOrganization] = await tx
      .select({ id: organization.id })
      .from(organization)
      .limit(1);
    if (existingOrganization) {
      throw new SetupError("A workspace already exists.", 409);
    }

    const organizationId = randomUUID();
    await tx.insert(organization).values({
      id: organizationId,
      name: input.organizationName,
      slug: input.organizationSlug,
      createdAt: now,
    });
    await tx.insert(member).values({
      id: randomUUID(),
      organizationId,
      userId: input.userId,
      role: "owner",
      createdAt: now,
    });
    await tx
      .update(deploymentBootstrap)
      .set({
        ownerUserId: input.userId,
        organizationId,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(deploymentBootstrap.id, 1));

    return { organizationId };
  });
}

export async function getDeploymentBootstrapStatus(): Promise<{
  exists: boolean;
  completed: boolean;
}> {
  const [row] = await db
    .select({ completedAt: deploymentBootstrap.completedAt })
    .from(deploymentBootstrap)
    .where(eq(deploymentBootstrap.id, 1))
    .limit(1);
  return { exists: Boolean(row), completed: Boolean(row?.completedAt) };
}
