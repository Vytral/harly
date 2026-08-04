import "server-only";

import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import {
  db,
  emailOutbox,
  nativeSignatureOtpChallenges,
  signatureEvidenceEvents,
} from "@harly/db";

const DEFAULT_EVIDENCE_RETENTION_DAYS = 3650;

export const SIGNATURE_EVIDENCE_RETENTION_MS =
  (Number(process.env.SIGNATURE_EVIDENCE_RETENTION_DAYS) ||
    DEFAULT_EVIDENCE_RETENTION_DAYS) *
  86_400_000;

/**
 * Remove short-lived OTP material and expired, non-held evidence. OTP codes
 * are encrypted in the outbox payload, so the matching outbox rows are deleted
 * with the challenge rather than merely redacted after delivery.
 */
export async function purgeExpiredSignatureData(input: {
  workspaceId: string;
  now?: Date;
}): Promise<{
  otpChallenges: number;
  otpPayloads: number;
  invitationPayloads: number;
  evidence: number;
}> {
  const now = input.now ?? new Date();
  const challenges = await db
    .select({ id: nativeSignatureOtpChallenges.id })
    .from(nativeSignatureOtpChallenges)
    .where(
      and(
        eq(nativeSignatureOtpChallenges.workspaceId, input.workspaceId),
        lt(nativeSignatureOtpChallenges.expiresAt, now),
      ),
    );

  let otpPayloads = 0;
  for (const challenge of challenges) {
    const deleted = await db
      .delete(emailOutbox)
      .where(
        and(
          eq(emailOutbox.workspaceId, input.workspaceId),
          eq(emailOutbox.kind, "native.signature.otp"),
          eq(emailOutbox.dedupeKey, `native-signature-otp:${challenge.id}`),
        ),
      );
    otpPayloads += Number((deleted as { rowCount?: number }).rowCount ?? 0);
  }

  let otpChallenges = 0;
  if (challenges.length > 0) {
    const deleted = await db
      .delete(nativeSignatureOtpChallenges)
      .where(inArray(nativeSignatureOtpChallenges.id, challenges.map((row) => row.id)));
    otpChallenges = Number((deleted as { rowCount?: number }).rowCount ?? challenges.length);
  }

  // Native invitation outbox payloads contain an encrypted bearer token.
  // Once the matching signing link has expired there is no operational reason
  // to retain that ciphertext. Guard the cast so malformed legacy payloads do
  // not abort the maintenance run.
  const deletedInvitations = await db
    .delete(emailOutbox)
    .where(
      and(
        eq(emailOutbox.workspaceId, input.workspaceId),
        eq(emailOutbox.kind, "native.signature.invitation"),
        sql`${emailOutbox.payload}->>'expiresAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'`,
        sql`(${emailOutbox.payload}->>'expiresAt')::timestamptz < ${now}`,
      ),
    );

  const deletedEvidence = await db
    .delete(signatureEvidenceEvents)
    .where(
      and(
        eq(signatureEvidenceEvents.workspaceId, input.workspaceId),
        isNotNull(signatureEvidenceEvents.retentionExpiresAt),
        lt(signatureEvidenceEvents.retentionExpiresAt, now),
        eq(signatureEvidenceEvents.legalHold, false),
        isNull(signatureEvidenceEvents.redactedAt),
      ),
    );

  return {
    otpChallenges,
    otpPayloads,
    invitationPayloads: Number(
      (deletedInvitations as { rowCount?: number }).rowCount ?? 0,
    ),
    evidence: Number((deletedEvidence as { rowCount?: number }).rowCount ?? 0),
  };
}

/** Scheduled, installation-wide cleanup. Keeps expiring signing secrets out of
 * the database even when no candidate opens a signing session afterward. */
export async function purgeExpiredSignatureDataGlobally(now = new Date()) {
  // # arreglado papu
  const cutoff = now.toISOString();
  const result = await db.execute(sql`
    with expired_challenges as materialized (
      select "id" from "native_signature_otp_challenges"
      where "expires_at" < ${cutoff}::timestamptz
    ), deleted_otp_payloads as (
      delete from "email_outbox" o
      using expired_challenges c
      where o."kind" = 'native.signature.otp'
        and o."dedupe_key" = 'native-signature-otp:' || c."id"::text
      returning o."id"
    ), deleted_challenges as (
      delete from "native_signature_otp_challenges" c
      using expired_challenges e
      where c."id" = e."id"
      returning c."id"
    ), deleted_invitation_payloads as (
      delete from "email_outbox"
      where "kind" = 'native.signature.invitation'
        and "payload"->>'expiresAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
        and ("payload"->>'expiresAt')::timestamptz < ${cutoff}::timestamptz
      returning "id"
    ), deleted_evidence as (
      delete from "signature_evidence_events"
      where "retention_expires_at" is not null
        and "retention_expires_at" < ${cutoff}::timestamptz
        and "legal_hold" = false
        and "redacted_at" is null
      returning "id"
    )
    select
      (select count(*)::int from deleted_challenges) as "otpChallenges",
      (select count(*)::int from deleted_otp_payloads) as "otpPayloads",
      (select count(*)::int from deleted_invitation_payloads) as "invitationPayloads",
      (select count(*)::int from deleted_evidence) as "evidence"
  `);
  return result[0] ?? {
    otpChallenges: 0,
    otpPayloads: 0,
    invitationPayloads: 0,
    evidence: 0,
  };
}
