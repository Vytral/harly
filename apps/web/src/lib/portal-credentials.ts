import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import {
  candidatePortalCodes,
  candidatePortalCredentials,
  candidates,
  db,
} from "@harly/db";
import { logAuditEvent } from "@/lib/audit-log";
import {
  generateLongCode,
  generateRecoveryCode,
  hashCode,
  hashPassword,
  hashRecoveryCode,
  verifyAgainstDummy,
  verifyPassword,
} from "@/lib/portal-password";

export const ACCESS_CODE_TTL_MS = 7 * 86_400_000;
export const RESET_CODE_TTL_MS = 60 * 60_000;
export const RECOVERY_CODE_COUNT = 8;
const RECOVERY_CODE_TTL_MS = 5 * 365 * 86_400_000;
/** Coarse per-account cap against distributed guessing (per-origin limits are in the callers). */
const ACCOUNT_FAILURE_LOCK_THRESHOLD = 30;
const ACCOUNT_LOCK_MS = 15 * 60_000;

export type CodeKind = "access" | "recovery" | "reset";

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export async function findActiveCandidateByEmail(
  workspaceId: string,
  email: string,
) {
  const [row] = await db
    .select({
      id: candidates.id,
      email: candidates.email,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      preferredEmailLocale: candidates.preferredEmailLocale,
    })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        eq(candidates.email, normalizeEmail(email)),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Creates a brand-new candidate; returns null when the email is already taken. */
export async function createPortalCandidate(input: {
  workspaceId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<string | null> {
  const email = normalizeEmail(input.email);
  const [existing] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(eq(candidates.workspaceId, input.workspaceId), eq(candidates.email, email)),
    )
    .limit(1);
  if (existing) return null;
  try {
    const [created] = await db
      .insert(candidates)
      .values({
        workspaceId: input.workspaceId,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      .returning({ id: candidates.id });
    return created?.id ?? null;
  } catch {
    // Unique (workspace, email) race: somebody else just created it.
    return null;
  }
}

export async function hasCandidatePassword(candidateId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: candidatePortalCredentials.candidateId })
    .from(candidatePortalCredentials)
    .where(eq(candidatePortalCredentials.candidateId, candidateId))
    .limit(1);
  return Boolean(row);
}

export async function setCandidatePassword(
  candidateId: string,
  workspaceId: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db
    .insert(candidatePortalCredentials)
    .values({ candidateId, workspaceId, passwordHash })
    .onConflictDoUpdate({
      target: candidatePortalCredentials.candidateId,
      set: {
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    });
}

/** Verifies the current password of a signed-in candidate (no lockout side effects). */
export async function verifyCandidatePassword(
  candidateId: string,
  password: string,
): Promise<boolean> {
  const [row] = await db
    .select({ hash: candidatePortalCredentials.passwordHash })
    .from(candidatePortalCredentials)
    .where(eq(candidatePortalCredentials.candidateId, candidateId))
    .limit(1);
  if (!row) return verifyAgainstDummy(password);
  return verifyPassword(password, row.hash);
}

async function burnAndReject(password: string): Promise<null> {
  await verifyAgainstDummy(password);
  return null;
}

/**
 * Email + password check. Always performs one scrypt verification (real or
 * dummy) and returns null for every failure so callers cannot tell an unknown
 * email from a wrong password or a locked account.
 */
export async function verifyPasswordLogin(
  workspaceId: string,
  email: string,
  password: string,
): Promise<{ candidateId: string } | null> {
  const candidate = await findActiveCandidateByEmail(workspaceId, email);
  if (!candidate) return burnAndReject(password);
  const [cred] = await db
    .select()
    .from(candidatePortalCredentials)
    .where(eq(candidatePortalCredentials.candidateId, candidate.id))
    .limit(1);
  if (!cred) return burnAndReject(password);
  if (cred.lockedUntil && cred.lockedUntil > new Date()) {
    return burnAndReject(password);
  }
  const ok = await verifyPassword(password, cred.passwordHash);
  if (ok) {
    if (cred.failedAttempts > 0 || cred.lockedUntil) {
      await db
        .update(candidatePortalCredentials)
        .set({ failedAttempts: 0, lockedUntil: null })
        .where(eq(candidatePortalCredentials.candidateId, candidate.id));
    }
    return { candidateId: candidate.id };
  }
  await db
    .update(candidatePortalCredentials)
    .set({
      failedAttempts: sql`${candidatePortalCredentials.failedAttempts} + 1`,
      lockedUntil: sql`CASE WHEN ${candidatePortalCredentials.failedAttempts} + 1 >= ${ACCOUNT_FAILURE_LOCK_THRESHOLD} THEN now() + ${ACCOUNT_LOCK_MS / 1000} * interval '1 second' ELSE ${candidatePortalCredentials.lockedUntil} END`,
    })
    .where(eq(candidatePortalCredentials.candidateId, candidate.id));
  return null;
}

// ---------------------------------------------------------------------------
// One-time codes
// ---------------------------------------------------------------------------

/**
 * Issues an access or reset code. Older unused codes of the same kind for the
 * candidate are revoked so only the latest one works. The raw value is returned
 * once and never stored.
 */
export async function issueOneTimeCode(input: {
  candidateId: string;
  workspaceId: string;
  kind: "access" | "reset";
  createdBy?: string | null;
}): Promise<{ code: string; expiresAt: Date }> {
  const code = generateLongCode();
  const expiresAt = new Date(
    Date.now() + (input.kind === "access" ? ACCESS_CODE_TTL_MS : RESET_CODE_TTL_MS),
  );
  await db
    .delete(candidatePortalCodes)
    .where(
      and(
        eq(candidatePortalCodes.candidateId, input.candidateId),
        eq(candidatePortalCodes.kind, input.kind),
        isNull(candidatePortalCodes.usedAt),
      ),
    );
  await db.insert(candidatePortalCodes).values({
    candidateId: input.candidateId,
    workspaceId: input.workspaceId,
    kind: input.kind,
    codeHash: hashCode(code),
    expiresAt,
    createdBy: input.createdBy ?? null,
  });
  return { code, expiresAt };
}

/** Atomically consumes an access/reset code (single use, expiry enforced in SQL). */
export async function consumeOneTimeCode(
  kind: "access" | "reset",
  raw: string,
  workspaceId: string,
): Promise<{ candidateId: string } | null> {
  const trimmed = raw.trim();
  if (trimmed.length < 20 || trimmed.length > 200) return null;
  const [row] = await db
    .update(candidatePortalCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(candidatePortalCodes.codeHash, hashCode(trimmed)),
        eq(candidatePortalCodes.kind, kind),
        eq(candidatePortalCodes.workspaceId, workspaceId),
        isNull(candidatePortalCodes.usedAt),
        gt(candidatePortalCodes.expiresAt, new Date()),
      ),
    )
    .returning({ candidateId: candidatePortalCodes.candidateId });
  return row ?? null;
}

/** Replaces all unused recovery codes with a fresh set (shown once to the candidate). */
export async function regenerateRecoveryCodes(
  candidateId: string,
  workspaceId: string,
): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    generateRecoveryCode(),
  );
  await db.transaction(async (tx) => {
    await tx
      .delete(candidatePortalCodes)
      .where(
        and(
          eq(candidatePortalCodes.candidateId, candidateId),
          eq(candidatePortalCodes.kind, "recovery"),
        ),
      );
    await tx.insert(candidatePortalCodes).values(
      codes.map((code) => ({
        candidateId,
        workspaceId,
        kind: "recovery",
        codeHash: hashRecoveryCode(code),
        expiresAt: new Date(Date.now() + RECOVERY_CODE_TTL_MS),
      })),
    );
  });
  return codes;
}

export async function countRecoveryCodes(candidateId: string): Promise<number> {
  const rows = await db
    .select({ id: candidatePortalCodes.id })
    .from(candidatePortalCodes)
    .where(
      and(
        eq(candidatePortalCodes.candidateId, candidateId),
        eq(candidatePortalCodes.kind, "recovery"),
        isNull(candidatePortalCodes.usedAt),
      ),
    );
  return rows.length;
}

/** Consumes one recovery code for a specific candidate. */
export async function consumeRecoveryCode(
  candidateId: string,
  raw: string,
): Promise<boolean> {
  const [row] = await db
    .update(candidatePortalCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(candidatePortalCodes.candidateId, candidateId),
        eq(candidatePortalCodes.kind, "recovery"),
        eq(candidatePortalCodes.codeHash, hashRecoveryCode(raw)),
        isNull(candidatePortalCodes.usedAt),
        gt(candidatePortalCodes.expiresAt, new Date()),
      ),
    )
    .returning({ id: candidatePortalCodes.id });
  return Boolean(row);
}

// ---------------------------------------------------------------------------

export async function auditPortalEvent(input: {
  workspaceId: string;
  candidateId: string;
  email?: string;
  action: string;
  metadata?: Record<string, unknown>;
  actorId?: string;
  severity?: "info" | "warning" | "critical";
}): Promise<void> {
  await logAuditEvent({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    actorEmail: input.email,
    action: input.action,
    resourceType: "candidate",
    resourceId: input.candidateId,
    metadata: input.metadata,
    severity: input.severity,
  });
}
