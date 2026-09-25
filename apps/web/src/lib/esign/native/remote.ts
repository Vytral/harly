import "server-only";

import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  db,
  activityEvents,
  documents,
  emailOutbox,
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
import { persistDomainEvent, publishPersistedDomainEvents } from "@/server/events/emit";
import { documentAutomationContext } from "@/lib/esign/document-automation-context";
import { storage } from "@/lib/storage";
import { assertNativeSignablePdf } from "./bake";
import { isSignableNativeFieldsSnapshot } from "./fields";
import { workingDocumentKey } from "./working-pdf";

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
  routingOrder: number;
  signerCount: number;
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
    routingOrder: signatureRecipients.routingOrder,
    storageKey: documents.storageKey,
    documentStatus: documents.status,
    documentSignatureStatus: documents.signatureStatus,
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
  if (!row || row.recipientStatus !== "sent" || row.envelopeStatus === "voided" || row.envelopeStatus === "completed" || row.documentStatus !== "active" || row.documentSignatureStatus !== "pending") return null;
  if (!row.expiresAt || row.expiresAt <= new Date()) return null;
  const signerRows = await db.select({ id: signatureRecipients.id }).from(signatureRecipients).where(and(eq(signatureRecipients.envelopeId, row.envelopeId), eq(signatureRecipients.workspaceId, row.workspaceId), eq(signatureRecipients.role, "signer")));
  const workingKey = await workingDocumentKey(db, row.workspaceId, row.envelopeId);
  return { ...row, storageKey: workingKey ?? row.storageKey, signerCount: signerRows.length, securityMode: row.securityMode as NativeSigningTarget["securityMode"], expiresAt: row.expiresAt };
}

export async function createNativeSigningLink(input: {
  /** Runtime database boundary; defaults to the application client. */
  database?: typeof db;
  workspaceId: string;
  documentId: string;
  actorId: string;
  recipientEmail?: string;
  recipientName?: string;
  recipients?: Array<{ email: string; name: string }>;
  subject?: string;
  message?: string | null;
  /** Workflow effect identity; retries reuse the existing envelope. */
  effectKey?: string;
  /** Workflow run identity for durable event loop prevention. */
  automationParentRunId?: string;
}) {
  const database = input.database ?? db;
  const recipients = (input.recipients?.length ? input.recipients : [{ email: input.recipientEmail ?? "", name: input.recipientName ?? "" }])
    .map((recipient) => ({ email: recipient.email.trim().toLowerCase(), name: recipient.name.trim() || recipient.email.trim().toLowerCase() }))
    .filter((recipient) => recipient.email.length > 0);
  if (recipients.length === 0 || recipients.length > 10) return { ok: false as const, error: "Add between one and ten signing recipients." };
  if (new Set(recipients.map((recipient) => recipient.email)).size !== recipients.length) return { ok: false as const, error: "Each signing recipient must have a unique email address." };
  const [settings] = await database.select({
    enabled: workspaceSettings.remoteSignEnabled,
    expirationDays: workspaceSettings.signatureExpirationDays,
    securityMode: workspaceSettings.signatureSecurityMode,
  }).from(workspaceSettings).where(eq(workspaceSettings.organizationId, input.workspaceId)).limit(1);
  if (!settings?.enabled) return { ok: false as const, error: "Remote signing is not enabled for this workspace." };
  if (settings.securityMode === "sso") return { ok: false as const, error: "SSO signing is not available yet." };

  if (input.effectKey) {
    const [existing] = await database
      .select({ envelopeId: signatureEnvelopes.id, recipientId: signatureRecipients.id, status: signatureEnvelopes.status, outboxId: emailOutbox.id })
      .from(signatureEnvelopes)
      .innerJoin(signatureRecipients, eq(signatureRecipients.envelopeId, signatureEnvelopes.id))
      .leftJoin(emailOutbox, and(
        eq(emailOutbox.workspaceId, input.workspaceId),
        or(
          eq(emailOutbox.dedupeKey, sql`concat('native-signature:', ${signatureEnvelopes.id}, ':', ${signatureRecipients.id})`),
          eq(emailOutbox.dedupeKey, sql`concat('native-signature:', ${signatureEnvelopes.id})`),
        ),
      ))
      .where(
        and(
          eq(signatureEnvelopes.workspaceId, input.workspaceId),
          eq(signatureEnvelopes.workflowEffectId, input.effectKey),
          eq(signatureRecipients.workspaceId, input.workspaceId),
          eq(signatureRecipients.role, "signer"),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.outboxId) await processEmailOutbox({ ids: [existing.outboxId], workspaceId: input.workspaceId, database });
      return {
        ok: true as const,
        envelopeId: existing.envelopeId,
        recipientId: existing.recipientId,
        reused: true,
      };
    }
  }

  const [document] = await database.select({ id: documents.id, name: documents.name, storageKey: documents.storageKey, mimeType: documents.mimeType, status: documents.status, signatureStatus: documents.signatureStatus, fieldsSnapshot: documents.fieldsSnapshot })
    .from(documents).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId))).limit(1);
  if (!document) return { ok: false as const, error: "Document not found." };
  if (document.status !== "active" || document.signatureStatus !== "unsigned" || document.mimeType !== "application/pdf") return { ok: false as const, error: "This document is not available for remote signing." };
  const fields = Array.isArray(document.fieldsSnapshot) ? document.fieldsSnapshot : [];
  if (!isSignableNativeFieldsSnapshot(fields)) return { ok: false as const, error: "Place at least one required signature field before sending." };
  const hasSignatureFieldFor = (recipientIndex: number) => fields.some((field) => field.type === "signature" && field.required !== false && (field.recipientIndex ?? 0) === recipientIndex);
  if (recipients.some((_, index) => !hasSignatureFieldFor(index))) return { ok: false as const, error: "Place at least one required signature field for every signer before sending." };
  try {
    await assertNativeSignablePdf(await storage.read(document.storageKey));
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "This PDF cannot be signed." };
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hash(rawToken);
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(settings.expirationDays || DEFAULT_EXPIRATION_DAYS, 365)) * 86_400_000);
  const providerEnvelopeId = `native:${randomBytes(16).toString("hex")}`;
  const signingTokenId = `native-token:${tokenHash}`;
  // Fail before changing document state if the workspace cannot protect the
  // bearer token that will be placed in the email outbox.
  const encryptedToken = encryptSecret(rawToken);
  const created = await database.transaction(async (tx) => {
    const [envelope] = await tx.insert(signatureEnvelopes).values({ workspaceId: input.workspaceId, provider: "native", providerEnvelopeId, kind: "document", status: "sent", subject: input.subject?.trim() || document.name, createdById: input.actorId, workflowEffectId: input.effectKey ?? null, sentAt: new Date() }).returning({ id: signatureEnvelopes.id });
    if (!envelope) throw new Error("Could not create signing envelope.");
    const createdRecipients = await tx.insert(signatureRecipients).values(recipients.map((recipient, index) => ({ workspaceId: input.workspaceId, envelopeId: envelope.id, providerRecipientId: index === 0 ? signingTokenId : `native-pending:${index}:${randomUUID()}`, role: "signer", email: recipient.email, name: recipient.name, routingOrder: index + 1, status: index === 0 ? "sent" : "created", linkExpiresAt: expiresAt }))).returning({ id: signatureRecipients.id, routingOrder: signatureRecipients.routingOrder });
    const firstRecipient = createdRecipients.find((recipient) => recipient.routingOrder === 1);
    if (!firstRecipient) throw new Error("Could not create signing recipient.");
    await tx.update(documents).set({ signatureStatus: "pending", signatureProvider: "native", signatureEnvelopeId: providerEnvelopeId, signatureEnvelopeRefId: envelope.id, signatureUrl: null, expiresAt, updatedAt: new Date() }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)));
    await tx.insert(signatureEvents).values({ workspaceId: input.workspaceId, envelopeId: envelope.id, eventKey: `native:${envelope.id}:invitation_sent:${firstRecipient.id}`, eventType: "invitation_sent", generatedAt: new Date(), payload: { recipientId: firstRecipient.id, routingOrder: 1 }, processedAt: new Date() });
    await tx.insert(activityEvents).values({ workspaceId: input.workspaceId, actorId: input.actorId, entityType: "document", entityId: input.documentId, type: "document.signature_sent", metadata: { provider: "native", status: "pending" } });
    const [outbox] = await tx.insert(emailOutbox).values({
      workspaceId: input.workspaceId,
      kind: "native.signature.invitation",
      payload: {
        token: encryptedToken,
        recipientEmail: recipients[0].email,
        recipientName: recipients[0].name,
        documentName: document.name,
        subject: input.subject?.trim() || `Please sign: ${document.name}`,
        message: input.message?.trim() || "Please review and sign this document.",
        expiresAt: expiresAt.toISOString(),
      },
      dedupeKey: `native-signature:${envelope.id}:${firstRecipient.id}`,
      actorId: input.actorId,
    }).returning({ id: emailOutbox.id });
    if (!outbox) throw new Error("Could not queue signing invitation.");
    const targetContext = await documentAutomationContext(tx, input.workspaceId, input.documentId);
    const event = await persistDomainEvent(tx, {
      name: "document.signature_sent",
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      aggregateType: "document",
      aggregateId: input.documentId,
      payload: { document: { id: input.documentId }, ...targetContext, status: "pending", provider: "native", envelopeId: envelope.id },
      automationParentRunId: input.automationParentRunId,
    });
    return { envelopeId: envelope.id, recipientId: firstRecipient.id, outboxId: outbox.id, event, targetContext };
  });

  await processEmailOutbox({ ids: [created.outboxId], workspaceId: input.workspaceId, database });
  await publishPersistedDomainEvents([created.event], database);
  const { emitWebhookEvent } = await import("@/server/webhooks/emit");
  await emitWebhookEvent(input.workspaceId, "document.signature_sent", {
    document: { id: input.documentId }, ...created.targetContext, status: "pending", provider: "native", envelopeId: created.envelopeId,
  }, { actorId: input.actorId, skipDomainEvent: true, eventId: created.event.eventId, parentRunId: input.automationParentRunId, database });
  return { ok: true as const, envelopeId: created.envelopeId, recipientId: created.recipientId, signingUrl: `${getHarlyPublicOrigin()}/sign/${rawToken}`, expiresAt };
}

/**
 * Issue a fresh native signing capability for an authenticated portal session.
 *
 * The original invitation token is intentionally stored only as a hash, so a
 * candidate who opens the application portal cannot recover it from the
 * database. Rotating the hash gives the portal a short-lived capability while
 * revoking an older bearer link for the same recipient. The caller must first
 * prove candidate/application ownership; this helper still re-checks the
 * envelope/document state so it cannot resurrect a completed or voided request.
 */
export async function rotateNativePortalSigningLink(input: {
  workspaceId: string;
  recipientId: string;
}): Promise<{ ok: true; signingUrl: string; expiresAt: Date } | { ok: false; error: string }> {
  const [target] = await db
    .select({
      envelopeId: signatureEnvelopes.id,
      envelopeStatus: signatureEnvelopes.status,
      documentStatus: documents.status,
      signatureStatus: documents.signatureStatus,
      currentExpiry: signatureRecipients.linkExpiresAt,
    })
    .from(signatureRecipients)
    .innerJoin(signatureEnvelopes, eq(signatureEnvelopes.id, signatureRecipients.envelopeId))
    .innerJoin(documents, eq(documents.signatureEnvelopeRefId, signatureEnvelopes.id))
    .where(and(
      eq(signatureRecipients.id, input.recipientId),
      eq(signatureRecipients.workspaceId, input.workspaceId),
      eq(signatureRecipients.role, "signer"),
      eq(signatureRecipients.status, "sent"),
      eq(signatureEnvelopes.workspaceId, input.workspaceId),
      eq(documents.workspaceId, input.workspaceId),
    ))
    .limit(1);

  if (!target || target.envelopeStatus !== "sent" || target.documentStatus !== "active" || target.signatureStatus !== "pending") {
    return { ok: false, error: "This document is no longer waiting for your signature." };
  }
  const expiresAt = target.currentExpiry;
  if (!expiresAt || expiresAt <= new Date()) {
    return { ok: false, error: "This signing request has expired." };
  }

  const rawToken = randomBytes(32).toString("base64url");
  const [rotated] = await db
    .update(signatureRecipients)
    .set({
      providerRecipientId: `native-token:${hash(rawToken)}`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(signatureRecipients.id, input.recipientId),
      eq(signatureRecipients.workspaceId, input.workspaceId),
      eq(signatureRecipients.status, "sent"),
    ))
    .returning({ id: signatureRecipients.id });
  if (!rotated) return { ok: false, error: "This signing request changed. Please refresh and try again." };

  return {
    ok: true,
    signingUrl: `${getHarlyPublicOrigin()}/sign/${rawToken}`,
    expiresAt,
  };
}

/**
 * Send at most one durable reminder per recipient per 24 hours. Native links
 * are bearer capabilities and Harly stores only their hashes, so a reminder
 * rotates the token and persists the encrypted plaintext only in the email
 * outbox. The event insert is the concurrency gate for two cron replicas.
 */
export async function sendNativeSignatureReminders(input: {
  workspaceId?: string;
  now?: Date;
  limit?: number;
} = {}): Promise<{ sent: number; skipped: number }> {
  const now = input.now ?? new Date();
  const reminderCutoff = new Date(now.getTime() - 24 * 60 * 60_000);
  const candidates = await db
    .select({
      workspaceId: signatureRecipients.workspaceId,
      recipientId: signatureRecipients.id,
      envelopeId: signatureEnvelopes.id,
      documentName: documents.name,
      recipientEmail: signatureRecipients.email,
      recipientName: signatureRecipients.name,
      linkExpiresAt: signatureRecipients.linkExpiresAt,
      envelopeSentAt: signatureEnvelopes.sentAt,
    })
    .from(signatureRecipients)
    .innerJoin(signatureEnvelopes, eq(signatureEnvelopes.id, signatureRecipients.envelopeId))
    .innerJoin(documents, eq(documents.signatureEnvelopeRefId, signatureEnvelopes.id))
    .where(and(
      input.workspaceId ? eq(signatureRecipients.workspaceId, input.workspaceId) : undefined,
      eq(signatureRecipients.role, "signer"),
      eq(signatureRecipients.status, "sent"),
      eq(signatureEnvelopes.status, "sent"),
      eq(documents.status, "active"),
      eq(documents.signatureStatus, "pending"),
      lt(signatureEnvelopes.sentAt, reminderCutoff),
      gt(signatureRecipients.linkExpiresAt, now),
    ))
    .limit(Math.max(1, Math.min(input.limit ?? 100, 500)));

  let sent = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    if (!candidate.envelopeSentAt || !candidate.linkExpiresAt) {
      skipped += 1;
      continue;
    }
    const expiresAt = candidate.linkExpiresAt;
    const rawToken = randomBytes(32).toString("base64url");
    const encryptedToken = encryptSecret(rawToken);
    const dayBucket = Math.floor(now.getTime() / (24 * 60 * 60_000));
    const eventKey = `native:${candidate.envelopeId}:reminder:${candidate.recipientId}:${dayBucket}`;
    const created = await db.transaction(async (tx) => {
      const [event] = await tx.insert(signatureEvents).values({
        workspaceId: candidate.workspaceId,
        envelopeId: candidate.envelopeId,
        eventKey,
        eventType: "reminder_sent",
        generatedAt: now,
        payload: { recipientId: candidate.recipientId, dayBucket },
        processedAt: now,
      }).onConflictDoNothing({ target: [signatureEvents.workspaceId, signatureEvents.eventKey] }).returning({ id: signatureEvents.id });
      if (!event) return null;

      const [rotated] = await tx.update(signatureRecipients).set({
        providerRecipientId: `native-token:${hash(rawToken)}`,
        updatedAt: now,
      }).where(and(
        eq(signatureRecipients.id, candidate.recipientId),
        eq(signatureRecipients.workspaceId, candidate.workspaceId),
        eq(signatureRecipients.status, "sent"),
      )).returning({ id: signatureRecipients.id });
      if (!rotated) throw new Error("Signing recipient changed while issuing reminder.");

      const [outbox] = await tx.insert(emailOutbox).values({
        workspaceId: candidate.workspaceId,
        kind: "native.signature.invitation",
        payload: {
          token: encryptedToken,
          recipientEmail: candidate.recipientEmail,
          recipientName: candidate.recipientName,
          documentName: candidate.documentName,
          subject: `Reminder: please sign ${candidate.documentName}`,
          message: "This is a reminder to review and sign the document. Your previous signing link has been replaced with this secure link.",
          expiresAt: expiresAt.toISOString(),
        },
        dedupeKey: eventKey,
      }).returning({ id: emailOutbox.id });
      if (!outbox) throw new Error("Could not queue native signature reminder.");
      return outbox.id;
    });
    if (!created) {
      skipped += 1;
      continue;
    }
    await processEmailOutbox({ ids: [created], workspaceId: candidate.workspaceId });
    sent += 1;
  }
  return { sent, skipped };
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
