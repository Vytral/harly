import "server-only";

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  activityEvents,
  documents,
  nativeSignatureOtpChallenges,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
  workspaceSettings,
} from "@harly/db";

import { enqueueEmailOutbox, processEmailOutbox } from "@/lib/email/outbox-processor";
import { encryptSecret } from "@/lib/crypto";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { purgeExpiredSignatureData } from "@/lib/esign/maintenance";
import { nextOtpAttempt } from "@/lib/esign/otp-policy";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const DEFAULT_EXPIRATION_DAYS = 30;
const OTP_TTL_MS = 10 * 60_000;
const MAX_OTP_ATTEMPTS = 5;
const verificationCookie = "harly_native_sign_verified";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function secret() {
  const value = process.env.NATIVE_SIGN_SESSION_SECRET ?? process.env.AI_ENCRYPTION_KEY;
  if (!value) throw new Error("NATIVE_SIGN_SESSION_SECRET is required for native signing.");
  return value;
}

function signedVerification(recipientId: string, challengeId: string) {
  const payload = `${recipientId}.${challengeId}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyNativeSignatureCookie(value: string | undefined, recipientId: string) {
  if (!value) return false;
  const [cookieRecipientId, challengeId, signature] = value.split(".");
  if (!cookieRecipientId || !challengeId || !signature || cookieRecipientId !== recipientId) return false;
  const expected = createHmac("sha256", secret()).update(`${cookieRecipientId}.${challengeId}`).digest("base64url");
  const actual = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

export function nativeSignatureCookieValue(recipientId: string, challengeId: string) {
  return signedVerification(recipientId, challengeId);
}

export async function isNativeSignatureCookieVerified(value: string | undefined, recipientId: string) {
  if (!value || !verifyNativeSignatureCookie(value, recipientId)) return false;
  const [, challengeId] = value.split(".");
  const [challenge] = await db.select({ id: nativeSignatureOtpChallenges.id }).from(nativeSignatureOtpChallenges).where(and(eq(nativeSignatureOtpChallenges.id, challengeId), eq(nativeSignatureOtpChallenges.recipientId, recipientId), gt(nativeSignatureOtpChallenges.expiresAt, new Date()), isNull(nativeSignatureOtpChallenges.consumedAt), isNotNull(nativeSignatureOtpChallenges.verifiedAt))).limit(1);
  return Boolean(challenge);
}

export type NativeSigningTarget = {
  workspaceId: string;
  envelopeId: string;
  recipientId: string;
  documentId: string;
  documentName: string;
  email: string;
  name: string;
  storageKey: string;
  securityMode: "link_only" | "email_otp" | "sso";
  expiresAt: Date;
};

export async function resolveNativeSigningToken(rawToken: string): Promise<NativeSigningTarget | null> {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return null;
  const [row] = await db.select({
    workspaceId: signatureRecipients.workspaceId,
    envelopeId: signatureRecipients.envelopeId,
    recipientId: signatureRecipients.id,
    documentId: documents.id,
    documentName: documents.name,
    email: signatureRecipients.email,
    name: signatureRecipients.name,
    storageKey: documents.storageKey,
    recipientStatus: signatureRecipients.status,
    envelopeStatus: signatureEnvelopes.status,
    expiresAt: signatureRecipients.linkExpiresAt,
    securityMode: workspaceSettings.signatureSecurityMode,
  }).from(signatureRecipients)
    .innerJoin(signatureEnvelopes, eq(signatureEnvelopes.id, signatureRecipients.envelopeId))
    .innerJoin(documents, eq(documents.signatureEnvelopeRefId, signatureEnvelopes.id))
    .innerJoin(workspaceSettings, eq(workspaceSettings.organizationId, signatureRecipients.workspaceId))
    .where(and(eq(signatureRecipients.providerRecipientId, `native-token:${hash(parsed.data)}`), eq(signatureRecipients.workspaceId, signatureEnvelopes.workspaceId)))
    .limit(1);
  if (!row || row.recipientStatus !== "sent" || row.envelopeStatus === "voided" || row.envelopeStatus === "completed") return null;
  if (!row.expiresAt || row.expiresAt <= new Date()) return null;
  return { ...row, securityMode: row.securityMode as NativeSigningTarget["securityMode"], expiresAt: row.expiresAt };
}

export async function createNativeSigningLink(input: {
  workspaceId: string;
  documentId: string;
  actorId: string;
  recipientEmail: string;
  recipientName: string;
  subject?: string;
  message?: string | null;
}) {
  const email = input.recipientEmail.trim().toLowerCase();
  const name = input.recipientName.trim() || email;
  const [settings] = await db.select({
    enabled: workspaceSettings.remoteSignEnabled,
    expirationDays: workspaceSettings.signatureExpirationDays,
    securityMode: workspaceSettings.signatureSecurityMode,
  }).from(workspaceSettings).where(eq(workspaceSettings.organizationId, input.workspaceId)).limit(1);
  if (!settings?.enabled) return { ok: false as const, error: "Remote signing is not enabled for this workspace." };
  if (settings.securityMode === "sso") return { ok: false as const, error: "SSO signing is not available yet." };
  const [document] = await db.select({ id: documents.id, name: documents.name, mimeType: documents.mimeType, status: documents.status, signatureStatus: documents.signatureStatus })
    .from(documents).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId))).limit(1);
  if (!document) return { ok: false as const, error: "Document not found." };
  if (document.status !== "active" || document.signatureStatus !== "unsigned" || document.mimeType !== "application/pdf") return { ok: false as const, error: "This document is not available for remote signing." };

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hash(rawToken);
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(settings.expirationDays || DEFAULT_EXPIRATION_DAYS, 365)) * 86_400_000);
  const providerEnvelopeId = `native:${randomBytes(16).toString("hex")}`;
  const signingTokenId = `native-token:${tokenHash}`;
  // Fail before changing document state if the workspace cannot protect the
  // bearer token that will be placed in the email outbox.
  const encryptedToken = encryptSecret(rawToken);
  const created = await db.transaction(async (tx) => {
    const [envelope] = await tx.insert(signatureEnvelopes).values({ workspaceId: input.workspaceId, provider: "native", providerEnvelopeId, kind: "document", status: "sent", subject: input.subject?.trim() || document.name, createdById: input.actorId, sentAt: new Date() }).returning({ id: signatureEnvelopes.id });
    if (!envelope) throw new Error("Could not create signing envelope.");
    const [recipient] = await tx.insert(signatureRecipients).values({ workspaceId: input.workspaceId, envelopeId: envelope.id, providerRecipientId: signingTokenId, role: "signer", email, name, status: "sent", linkExpiresAt: expiresAt }).returning({ id: signatureRecipients.id });
    if (!recipient) throw new Error("Could not create signing recipient.");
    await tx.update(documents).set({ signatureStatus: "pending", signatureProvider: "native", signatureEnvelopeId: providerEnvelopeId, signatureEnvelopeRefId: envelope.id, signatureUrl: null, expiresAt, updatedAt: new Date() }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)));
    await tx.insert(signatureEvents).values({ workspaceId: input.workspaceId, envelopeId: envelope.id, eventKey: `native:${envelope.id}:invitation_sent`, eventType: "invitation_sent", generatedAt: new Date(), payload: { recipientId: recipient.id }, processedAt: new Date() });
    await tx.insert(activityEvents).values({ workspaceId: input.workspaceId, actorId: input.actorId, entityType: "document", entityId: input.documentId, type: "document.signature_sent", metadata: { provider: "native", status: "pending" } });
    return { envelopeId: envelope.id, recipientId: recipient.id };
  });

  const outboxId = await enqueueEmailOutbox(input.workspaceId, "native.signature.invitation", {
    token: encryptedToken,
    recipientEmail: email,
    recipientName: name,
    documentName: document.name,
    subject: input.subject?.trim() || `Please sign: ${document.name}`,
    message: input.message?.trim() || "Please review and sign this document.",
    expiresAt: expiresAt.toISOString(),
  }, `native-signature:${created.envelopeId}`, input.actorId);
  await processEmailOutbox({ ids: [outboxId], workspaceId: input.workspaceId });
  return { ok: true as const, envelopeId: created.envelopeId, recipientId: created.recipientId, signingUrl: `${getHarlyPublicOrigin()}/sign/${rawToken}`, expiresAt };
}

export async function requestNativeOtp(target: NativeSigningTarget) {
  if (target.securityMode !== "email_otp") return { ok: false as const, error: "OTP is not required for this signing link." };
  await purgeExpiredSignatureData({ workspaceId: target.workspaceId });
  const code = String(randomInt(100000, 1_000_000));
  // Protect the code before creating a challenge. A missing encryption key
  // must not leave an unverifiable challenge in the database.
  const encryptedCode = encryptSecret(code);
  const [challenge] = await db.insert(nativeSignatureOtpChallenges).values({ workspaceId: target.workspaceId, recipientId: target.recipientId, codeHash: hash(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) }).returning({ id: nativeSignatureOtpChallenges.id });
  if (!challenge) return { ok: false as const, error: "Could not create a verification challenge." };
  const outboxId = await enqueueEmailOutbox(target.workspaceId, "native.signature.otp", { code: encryptedCode, recipientEmail: target.email, recipientName: target.name }, `native-signature-otp:${challenge.id}`);
  await processEmailOutbox({ ids: [outboxId], workspaceId: target.workspaceId });
  return { ok: true as const, challengeId: challenge.id };
}

export async function verifyNativeOtp(target: NativeSigningTarget, challengeId: string, code: string) {
  const parsed = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).safeParse({ challengeId, code });
  if (!parsed.success) return { ok: false as const, error: "Invalid verification code." };
  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(nativeSignatureOtpChallenges)
      .where(
        and(
          eq(nativeSignatureOtpChallenges.id, parsed.data.challengeId),
          eq(nativeSignatureOtpChallenges.recipientId, target.recipientId),
          gt(nativeSignatureOtpChallenges.expiresAt, new Date()),
          isNull(nativeSignatureOtpChallenges.consumedAt),
          isNull(nativeSignatureOtpChallenges.verifiedAt),
          lt(nativeSignatureOtpChallenges.attempts, MAX_OTP_ATTEMPTS),
        ),
      )
      .for("update")
      .limit(1);
    if (!challenge) return { ok: false as const, error: "Invalid or expired verification code." };

    const actual = Buffer.from(hash(parsed.data.code));
    const expected = Buffer.from(challenge.codeHash);
    const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!valid) {
      // The row lock serializes the read while the SQL predicate makes the
      // counter itself atomic even if another caller reached this transaction
      // at the same time.
      const next = nextOtpAttempt(challenge.attempts, MAX_OTP_ATTEMPTS);
      if (next !== null) {
        await tx
          .update(nativeSignatureOtpChallenges)
          .set({ attempts: sql`${nativeSignatureOtpChallenges.attempts} + 1` })
          .where(
            and(
              eq(nativeSignatureOtpChallenges.id, challenge.id),
              lt(nativeSignatureOtpChallenges.attempts, MAX_OTP_ATTEMPTS),
            ),
          );
      }
      return { ok: false as const, error: "Invalid or expired verification code." };
    }
    const [verified] = await tx
      .update(nativeSignatureOtpChallenges)
      .set({ verifiedAt: new Date() })
      .where(
        and(
          eq(nativeSignatureOtpChallenges.id, challenge.id),
          isNull(nativeSignatureOtpChallenges.verifiedAt),
          lt(nativeSignatureOtpChallenges.attempts, MAX_OTP_ATTEMPTS),
        ),
      )
      .returning({ id: nativeSignatureOtpChallenges.id });
    if (!verified) return { ok: false as const, error: "Invalid or expired verification code." };
    return { ok: true as const, cookieValue: nativeSignatureCookieValue(target.recipientId, challenge.id) };
  });
}

export const nativeSignCookieName = verificationCookie;
