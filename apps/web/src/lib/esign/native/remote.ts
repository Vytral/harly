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
  organization,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
  user as authUser,
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
import { buildInvitationPayload } from "./notices";
import { DAY_MS, linkLifetimeDays } from "./link-lifetime";

export { linkLifetimeDays, MIN_EXPIRATION_DAYS, MAX_EXPIRATION_DAYS } from "./link-lifetime";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_COOLDOWN_MS = 30_000;
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

export async function isNativeSignatureCookieVerified(value: string | undefined, recipientId: string, options: { allowConsumed?: boolean } = {}) {
  if (!value || !verifyNativeSignatureCookie(value, recipientId)) return false;
  const [, challengeId] = value.split(".");
  const [challenge] = await db.select({ id: nativeSignatureOtpChallenges.id }).from(nativeSignatureOtpChallenges).where(and(eq(nativeSignatureOtpChallenges.id, challengeId), eq(nativeSignatureOtpChallenges.recipientId, recipientId), gt(nativeSignatureOtpChallenges.expiresAt, new Date()), options.allowConsumed ? undefined : isNull(nativeSignatureOtpChallenges.consumedAt), isNotNull(nativeSignatureOtpChallenges.verifiedAt))).limit(1);
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

export type NativeSigningState = "active" | "signed" | "declined" | "voided" | "expired" | "unavailable";

export type NativeSigningContext = {
  company: { name: string; logoUrl: string | null; hideHarlyBranding: boolean };
  sender: { name: string | null; email: string | null };
  message: string | null;
  voidReason: string | null;
  declinedReason: string | null;
  signedAt: Date | null;
  envelopeCompleted: boolean;
};

export type NativeSigningInspection =
  | { state: "unavailable" }
  | { state: Exclude<NativeSigningState, "unavailable">; target: NativeSigningTarget; context: NativeSigningContext };

/**
 * Resolve a bearer token to the signer's state. Unlike
 * `resolveNativeSigningToken`, this also explains links that are no longer
 * usable (signed, declined, voided, expired) so the signer sees an honest page.
 * Earlier reminder links keep working until the signer finishes.
 */
export async function inspectNativeSigningToken(rawToken: string): Promise<NativeSigningInspection> {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return { state: "unavailable" };
  const tokenHash = hash(parsed.data);
  const [row] = await db.select({
    workspaceId: signatureRecipients.workspaceId,
    envelopeId: signatureRecipients.envelopeId,
    recipientId: signatureRecipients.id,
    documentId: signatureEnvelopes.documentId,
    envelopeDocumentName: signatureEnvelopes.documentName,
    liveDocumentId: documents.id,
    liveDocumentName: documents.name,
    email: signatureRecipients.email,
    name: signatureRecipients.name,
    routingOrder: signatureRecipients.routingOrder,
    storageKey: documents.storageKey,
    documentStatus: documents.status,
    documentSignatureStatus: documents.signatureStatus,
    recipientStatus: signatureRecipients.status,
    recipientSignedAt: signatureRecipients.signedAt,
    declinedReason: signatureRecipients.declinedReason,
    envelopeStatus: signatureEnvelopes.status,
    envelopeMessage: signatureEnvelopes.message,
    voidReason: signatureEnvelopes.voidReason,
    expiresAt: signatureRecipients.linkExpiresAt,
    securityMode: workspaceSettings.signatureSecurityMode,
    companyName: organization.name,
    companyLogo: organization.logo,
    hideHarlyBranding: workspaceSettings.hideHarlyBranding,
    senderName: authUser.name,
    senderEmail: authUser.email,
  }).from(signatureRecipients)
    .innerJoin(signatureEnvelopes, eq(signatureEnvelopes.id, signatureRecipients.envelopeId))
    .leftJoin(documents, eq(documents.signatureEnvelopeRefId, signatureEnvelopes.id))
    .innerJoin(workspaceSettings, eq(workspaceSettings.organizationId, signatureRecipients.workspaceId))
    .innerJoin(organization, eq(organization.id, signatureRecipients.workspaceId))
    .leftJoin(authUser, eq(authUser.id, signatureEnvelopes.createdById))
    .where(and(
      eq(signatureRecipients.workspaceId, signatureEnvelopes.workspaceId),
      or(
        eq(signatureRecipients.providerRecipientId, `native-token:${tokenHash}`),
        sql`${tokenHash} = ANY(${signatureRecipients.previousTokenHashes})`,
      ),
    ))
    .limit(1);
  if (!row) return { state: "unavailable" };
  const documentId = row.liveDocumentId ?? row.documentId;
  const documentName = row.liveDocumentName ?? row.envelopeDocumentName;
  if (!documentId || !documentName) return { state: "unavailable" };

  const signerRows = await db.select({ id: signatureRecipients.id }).from(signatureRecipients).where(and(eq(signatureRecipients.envelopeId, row.envelopeId), eq(signatureRecipients.workspaceId, row.workspaceId), eq(signatureRecipients.role, "signer")));
  const workingKey = row.liveDocumentId ? await workingDocumentKey(db, row.workspaceId, row.envelopeId) : null;
  const now = new Date();
  const expiresAt = row.expiresAt ?? new Date(0);
  const target: NativeSigningTarget = {
    workspaceId: row.workspaceId,
    envelopeId: row.envelopeId,
    recipientId: row.recipientId,
    documentId,
    documentName,
    email: row.email,
    name: row.name,
    routingOrder: row.routingOrder,
    storageKey: workingKey ?? row.storageKey ?? "",
    signerCount: signerRows.length,
    securityMode: row.securityMode as NativeSigningTarget["securityMode"],
    expiresAt,
  };
  const context: NativeSigningContext = {
    company: { name: row.companyName, logoUrl: row.companyLogo ?? null, hideHarlyBranding: row.hideHarlyBranding ?? false },
    sender: { name: row.senderName ?? null, email: row.senderEmail ?? null },
    message: row.envelopeMessage ?? null,
    voidReason: row.voidReason ?? null,
    declinedReason: row.declinedReason ?? null,
    signedAt: row.recipientSignedAt ?? null,
    envelopeCompleted: row.envelopeStatus === "completed",
  };
  const done = (state: Exclude<NativeSigningState, "unavailable">): NativeSigningInspection => ({ state, target, context });

  if (row.recipientStatus === "signed") return done("signed");
  if (row.recipientStatus === "declined" || row.envelopeStatus === "declined") return done("declined");
  if (row.recipientStatus === "voided" || row.envelopeStatus === "voided") return done("voided");
  if (row.recipientStatus === "expired" || row.envelopeStatus === "expired") return done("expired");
  if (row.recipientStatus !== "sent") return { state: "unavailable" };
  if (row.envelopeStatus === "completed") return done("signed");
  if (!row.liveDocumentId || row.documentStatus !== "active" || row.documentSignatureStatus !== "pending") return { state: "unavailable" };
  if (!row.expiresAt || row.expiresAt <= now) return done("expired");
  return done("active");
}

export async function resolveNativeSigningToken(rawToken: string): Promise<NativeSigningTarget | null> {
  const inspected = await inspectNativeSigningToken(rawToken);
  return inspected.state === "active" ? inspected.target : null;
}

/** Record the first time a signer opens their link (timeline + "opened" state). */
export async function markNativeLinkViewed(target: NativeSigningTarget) {
  const now = new Date();
  const [updated] = await db.update(signatureRecipients).set({ viewedAt: now }).where(and(eq(signatureRecipients.id, target.recipientId), isNull(signatureRecipients.viewedAt))).returning({ id: signatureRecipients.id });
  if (!updated) return;
  await db.insert(signatureEvents).values({
    workspaceId: target.workspaceId,
    envelopeId: target.envelopeId,
    eventKey: `native:${target.envelopeId}:link_opened:${target.recipientId}`,
    eventType: "link_opened",
    generatedAt: now,
    payload: { recipientId: target.recipientId, routingOrder: target.routingOrder },
    processedAt: now,
  }).onConflictDoNothing();
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
  /** Link lifetime in days, counted from when each signer is invited. */
  expirationDays?: number;
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
  if (document.status !== "active" || !["unsigned", "declined", "expired"].includes(document.signatureStatus) || document.mimeType !== "application/pdf") return { ok: false as const, error: "This document is not available for remote signing." };
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
  const lifetimeDays = linkLifetimeDays(input.expirationDays, settings.expirationDays);
  const invitedAt = new Date();
  // Each signer's clock starts when THEY are invited; this is signer 1's.
  const expiresAt = new Date(invitedAt.getTime() + lifetimeDays * DAY_MS);
  const [actor] = await database.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, input.actorId)).limit(1);
  const senderName = actor?.name ?? null;
  const providerEnvelopeId = `native:${randomBytes(16).toString("hex")}`;
  const signingTokenId = `native-token:${tokenHash}`;
  // Fail before changing document state if the workspace cannot protect the
  // bearer token that will be placed in the email outbox.
  const encryptedToken = encryptSecret(rawToken);
  let created;
  try {
    created = await database.transaction(async (tx) => {
    // Re-read the document under a row lock: everything validated above (state,
    // fields, file) must still hold when the envelope is created, so two sends
    // racing on the same document cannot both open a workflow, and the invite
    // never carries fields or a file that changed since they were checked.
    const [current] = await tx
      .select({ status: documents.status, signatureStatus: documents.signatureStatus, storageKey: documents.storageKey, fieldsSnapshot: documents.fieldsSnapshot })
      .from(documents)
      .where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)))
      .for("update")
      .limit(1);
    if (
      !current ||
      current.status !== "active" ||
      !["unsigned", "declined", "expired"].includes(current.signatureStatus) ||
      current.storageKey !== document.storageKey ||
      JSON.stringify(current.fieldsSnapshot) !== JSON.stringify(document.fieldsSnapshot)
    ) {
      throw new NativeSendConflict();
    }
    const [envelope] = await tx.insert(signatureEnvelopes).values({ workspaceId: input.workspaceId, provider: "native", providerEnvelopeId, kind: "document", status: "sent", subject: input.subject?.trim() || document.name, message: input.message?.trim() || null, expirationDays: input.expirationDays ?? null, documentId: input.documentId, documentName: document.name, createdById: input.actorId, workflowEffectId: input.effectKey ?? null, sentAt: invitedAt }).returning({ id: signatureEnvelopes.id });
    if (!envelope) throw new Error("Could not create signing envelope.");
    const createdRecipients = await tx.insert(signatureRecipients).values(recipients.map((recipient, index) => ({ workspaceId: input.workspaceId, envelopeId: envelope.id, providerRecipientId: index === 0 ? signingTokenId : `native-pending:${index}:${randomUUID()}`, role: "signer", email: recipient.email, name: recipient.name, routingOrder: index + 1, status: index === 0 ? "sent" : "created", linkExpiresAt: index === 0 ? expiresAt : null, invitedAt: index === 0 ? invitedAt : null }))).returning({ id: signatureRecipients.id, routingOrder: signatureRecipients.routingOrder });
    const firstRecipient = createdRecipients.find((recipient) => recipient.routingOrder === 1);
    if (!firstRecipient) throw new Error("Could not create signing recipient.");
    await tx.update(documents).set({ signatureStatus: "pending", signatureProvider: "native", signatureEnvelopeId: providerEnvelopeId, signatureEnvelopeRefId: envelope.id, signatureUrl: null, expiresAt, updatedAt: new Date() }).where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)));
    await tx.insert(signatureEvents).values({ workspaceId: input.workspaceId, envelopeId: envelope.id, eventKey: `native:${envelope.id}:invitation_sent:${firstRecipient.id}`, eventType: "invitation_sent", generatedAt: new Date(), payload: { recipientId: firstRecipient.id, routingOrder: 1 }, processedAt: new Date() });
    await tx.insert(activityEvents).values({ workspaceId: input.workspaceId, actorId: input.actorId, entityType: "document", entityId: input.documentId, type: "document.signature_sent", metadata: { provider: "native", status: "pending" } });
    const [outbox] = await tx.insert(emailOutbox).values({
      workspaceId: input.workspaceId,
      kind: "native.signature.invitation",
      payload: {
        ...buildInvitationPayload({
          rawToken,
          recipientEmail: recipients[0].email,
          recipientName: recipients[0].name,
          documentName: document.name,
          subject: input.subject?.trim() || null,
          message: input.message,
          expiresAt,
          senderName,
          signerOrder: 1,
          signerCount: recipients.length,
        }),
        token: encryptedToken,
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
  } catch (error) {
    if (error instanceof NativeSendConflict) {
      return { ok: false as const, error: "This document changed or was already sent for signature. Refresh and try again." };
    }
    throw error;
  }

  await processEmailOutbox({ ids: [created.outboxId], workspaceId: input.workspaceId, database });
  await publishPersistedDomainEvents([created.event], database);
  const { emitWebhookEvent } = await import("@/server/webhooks/emit");
  await emitWebhookEvent(input.workspaceId, "document.signature_sent", {
    document: { id: input.documentId }, ...created.targetContext, status: "pending", provider: "native", envelopeId: created.envelopeId,
  }, { actorId: input.actorId, skipDomainEvent: true, eventId: created.event.eventId, parentRunId: input.automationParentRunId, database });
  return { ok: true as const, envelopeId: created.envelopeId, recipientId: created.recipientId, signingUrl: `${getHarlyPublicOrigin()}/sign/${rawToken}`, expiresAt };
}

/** The document changed between validation and envelope creation. */
class NativeSendConflict extends Error {}

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

type ReminderTarget = {
  workspaceId: string;
  recipientId: string;
  envelopeId: string;
  documentName: string;
  recipientEmail: string;
  recipientName: string;
  routingOrder: number;
  signerCount: number;
  linkExpiresAt: Date;
  reminderCount: number;
  subject: string | null;
  message: string | null;
  senderName: string | null;
};

/**
 * Issue a fresh link for a reminder and queue the email. The previous link
 * stays valid (its hash moves to `previous_token_hashes`) so an older email
 * never leads to a dead end. Runs inside the caller's transaction.
 */
async function queueReminder(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  candidate: ReminderTarget,
  input: { now: Date; eventKey: string; manual: boolean; actorId?: string },
) {
  const rawToken = randomBytes(32).toString("base64url");
  const reminderNumber = candidate.reminderCount + (input.manual ? 0 : 1);
  const [event] = await tx.insert(signatureEvents).values({
    workspaceId: candidate.workspaceId,
    envelopeId: candidate.envelopeId,
    eventKey: input.eventKey,
    eventType: "reminder_sent",
    generatedAt: input.now,
    payload: { recipientId: candidate.recipientId, reminderNumber, manual: input.manual, actorId: input.actorId ?? null },
    processedAt: input.now,
  }).onConflictDoNothing({ target: [signatureEvents.workspaceId, signatureEvents.eventKey] }).returning({ id: signatureEvents.id });
  if (!event) return null;

  const [rotated] = await tx.update(signatureRecipients).set({
    providerRecipientId: `native-token:${hash(rawToken)}`,
    previousTokenHashes: sql`array_append(${signatureRecipients.previousTokenHashes}, replace(${signatureRecipients.providerRecipientId}, 'native-token:', ''))`,
    ...(input.manual ? {} : { reminderCount: sql`${signatureRecipients.reminderCount} + 1` }),
    lastReminderAt: input.now,
    updatedAt: input.now,
  }).where(and(
    eq(signatureRecipients.id, candidate.recipientId),
    eq(signatureRecipients.workspaceId, candidate.workspaceId),
    eq(signatureRecipients.status, "sent"),
  )).returning({ id: signatureRecipients.id });
  if (!rotated) throw new Error("Signing recipient changed while issuing reminder.");

  const [outbox] = await tx.insert(emailOutbox).values({
    workspaceId: candidate.workspaceId,
    kind: "native.signature.invitation",
    payload: buildInvitationPayload({
      rawToken,
      recipientEmail: candidate.recipientEmail,
      recipientName: candidate.recipientName,
      documentName: candidate.documentName,
      subject: candidate.subject,
      message: candidate.message,
      expiresAt: candidate.linkExpiresAt,
      senderName: candidate.senderName,
      signerOrder: candidate.routingOrder,
      signerCount: candidate.signerCount,
      reminder: true,
      reminderNumber,
    }),
    dedupeKey: input.eventKey,
    actorId: input.actorId ?? null,
  }).returning({ id: emailOutbox.id });
  if (!outbox) throw new Error("Could not queue native signature reminder.");
  return outbox.id;
}

/**
 * Automatic reminders. Cadence and cap come from workspace settings
 * (`signatureReminderCadenceDays`, `signatureMaxReminders`). The clock is the
 * CURRENT signer's last reminder, or when they were invited, never the
 * envelope's send time. The event key embeds the reminder number, so two cron
 * replicas cannot send the same reminder twice.
 */
export async function sendNativeSignatureReminders(input: {
  workspaceId?: string;
  now?: Date;
  limit?: number;
} = {}): Promise<{ sent: number; skipped: number }> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const candidates = await db
    .select({
      workspaceId: signatureRecipients.workspaceId,
      recipientId: signatureRecipients.id,
      envelopeId: signatureEnvelopes.id,
      documentName: documents.name,
      recipientEmail: signatureRecipients.email,
      recipientName: signatureRecipients.name,
      routingOrder: signatureRecipients.routingOrder,
      linkExpiresAt: signatureRecipients.linkExpiresAt,
      reminderCount: signatureRecipients.reminderCount,
      subject: signatureEnvelopes.subject,
      message: signatureEnvelopes.message,
      senderName: authUser.name,
    })
    .from(signatureRecipients)
    .innerJoin(signatureEnvelopes, eq(signatureEnvelopes.id, signatureRecipients.envelopeId))
    .innerJoin(documents, eq(documents.signatureEnvelopeRefId, signatureEnvelopes.id))
    .innerJoin(workspaceSettings, eq(workspaceSettings.organizationId, signatureRecipients.workspaceId))
    .leftJoin(authUser, eq(authUser.id, signatureEnvelopes.createdById))
    .where(and(
      input.workspaceId ? eq(signatureRecipients.workspaceId, input.workspaceId) : undefined,
      eq(signatureRecipients.role, "signer"),
      eq(signatureRecipients.status, "sent"),
      eq(signatureEnvelopes.status, "sent"),
      eq(documents.status, "active"),
      eq(documents.signatureStatus, "pending"),
      gt(workspaceSettings.signatureReminderCadenceDays, 0),
      sql`${signatureRecipients.reminderCount} < ${workspaceSettings.signatureMaxReminders}`,
      sql`coalesce(${signatureRecipients.lastReminderAt}, ${signatureRecipients.invitedAt}, ${signatureEnvelopes.sentAt}) <= ${nowIso}::timestamptz - make_interval(days => ${workspaceSettings.signatureReminderCadenceDays})`,
      gt(signatureRecipients.linkExpiresAt, now),
    ))
    .limit(Math.max(1, Math.min(input.limit ?? 100, 500)));

  let sent = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    if (!candidate.linkExpiresAt) {
      skipped += 1;
      continue;
    }
    const signerCount = await countSigners(candidate.workspaceId, candidate.envelopeId);
    const eventKey = `native:${candidate.envelopeId}:reminder:${candidate.recipientId}:${candidate.reminderCount + 1}`;
    const outboxId = await db.transaction((tx) =>
      queueReminder(tx, { ...candidate, linkExpiresAt: candidate.linkExpiresAt!, signerCount }, { now, eventKey, manual: false }),
    );
    if (!outboxId) {
      skipped += 1;
      continue;
    }
    await processEmailOutbox({ ids: [outboxId], workspaceId: candidate.workspaceId });
    sent += 1;
  }
  return { sent, skipped };
}

async function countSigners(workspaceId: string, envelopeId: string) {
  const rows = await db.select({ id: signatureRecipients.id }).from(signatureRecipients).where(and(eq(signatureRecipients.envelopeId, envelopeId), eq(signatureRecipients.workspaceId, workspaceId), eq(signatureRecipients.role, "signer")));
  return Math.max(1, rows.length);
}

/** Hard ceiling on reminders (automatic + manual) per signer. */
const MAX_TOTAL_REMINDERS = 10;
const MANUAL_REMINDER_MIN_GAP_MS = 60 * 60_000;

/**
 * Manual "Remind now" for a document whose native signature is in flight.
 * Issues a fresh link but keeps every earlier link working (hashes are the only
 * thing stored, so the old plaintext cannot be re-sent). Reminds whoever is
 * currently expected to sign unless `recipientId` is given. Does not count against the
 * automatic cap, but is throttled to one per hour per signer. The documents
 * UI calls this from a server action after its own permission check.
 */
export async function remindNativeSigner(input: {
  workspaceId: string;
  documentId: string;
  actorId: string;
  /** Specific signer; defaults to whoever is currently expected to sign. */
  recipientId?: string;
  now?: Date;
}): Promise<{ ok: true; recipientName: string; recipientEmail: string } | { ok: false; error: string }> {
  const now = input.now ?? new Date();
  const [target] = await db
    .select({
      workspaceId: signatureRecipients.workspaceId,
      recipientId: signatureRecipients.id,
      envelopeId: signatureEnvelopes.id,
      documentName: documents.name,
      recipientEmail: signatureRecipients.email,
      recipientName: signatureRecipients.name,
      routingOrder: signatureRecipients.routingOrder,
      linkExpiresAt: signatureRecipients.linkExpiresAt,
      reminderCount: signatureRecipients.reminderCount,
      lastReminderAt: signatureRecipients.lastReminderAt,
      subject: signatureEnvelopes.subject,
      message: signatureEnvelopes.message,
      senderName: authUser.name,
    })
    .from(documents)
    .innerJoin(signatureEnvelopes, eq(signatureEnvelopes.id, documents.signatureEnvelopeRefId))
    .innerJoin(signatureRecipients, eq(signatureRecipients.envelopeId, signatureEnvelopes.id))
    .leftJoin(authUser, eq(authUser.id, signatureEnvelopes.createdById))
    .where(and(
      eq(documents.id, input.documentId),
      eq(documents.workspaceId, input.workspaceId),
      eq(documents.signatureStatus, "pending"),
      eq(signatureEnvelopes.provider, "native"),
      eq(signatureEnvelopes.status, "sent"),
      eq(signatureRecipients.workspaceId, input.workspaceId),
      eq(signatureRecipients.role, "signer"),
      eq(signatureRecipients.status, "sent"),
      input.recipientId ? eq(signatureRecipients.id, input.recipientId) : undefined,
    ))
    .limit(1);
  if (!target) return { ok: false, error: "No one is currently waiting to sign this document." };
  const sentBefore = await db.select({ payload: signatureEvents.payload }).from(signatureEvents).where(and(eq(signatureEvents.envelopeId, target.envelopeId), eq(signatureEvents.eventType, "reminder_sent")));
  if (sentBefore.filter((row) => (row.payload as { recipientId?: string } | null)?.recipientId === target.recipientId).length >= MAX_TOTAL_REMINDERS) {
    return { ok: false, error: `${target.recipientName} has already been reminded ${MAX_TOTAL_REMINDERS} times. Contact them another way or void and re-send.` };
  }
  if (!target.linkExpiresAt || target.linkExpiresAt <= now) return { ok: false, error: "This signer's link has expired. Void the request and send it again." };
  if (target.lastReminderAt && now.getTime() - target.lastReminderAt.getTime() < MANUAL_REMINDER_MIN_GAP_MS) {
    return { ok: false, error: `A reminder was sent to ${target.recipientName} less than an hour ago.` };
  }
  const signerCount = await countSigners(input.workspaceId, target.envelopeId);
  const eventKey = `native:${target.envelopeId}:reminder:${target.recipientId}:manual:${now.getTime()}`;
  const outboxId = await db.transaction((tx) =>
    queueReminder(tx, { ...target, linkExpiresAt: target.linkExpiresAt!, signerCount }, { now, eventKey, manual: true, actorId: input.actorId }),
  );
  if (!outboxId) return { ok: false, error: "A reminder is already being sent." };
  await processEmailOutbox({ ids: [outboxId], workspaceId: input.workspaceId });
  return { ok: true, recipientName: target.recipientName, recipientEmail: target.recipientEmail };
}

export async function requestNativeOtp(target: NativeSigningTarget) {
  if (target.securityMode !== "email_otp") return { ok: false as const, error: "OTP is not required for this signing link." };
  await purgeExpiredSignatureData({ workspaceId: target.workspaceId });
  const [recent] = await db.select({ createdAt: nativeSignatureOtpChallenges.createdAt }).from(nativeSignatureOtpChallenges).where(and(eq(nativeSignatureOtpChallenges.recipientId, target.recipientId), gt(nativeSignatureOtpChallenges.createdAt, new Date(Date.now() - OTP_RESEND_COOLDOWN_MS)))).limit(1);
  if (recent) return { ok: false as const, error: "A code was just sent. Wait a moment before asking for another.", retryAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000 };
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
    await tx.insert(signatureEvents).values({
      workspaceId: target.workspaceId,
      envelopeId: target.envelopeId,
      eventKey: `native:${target.envelopeId}:otp_verified:${challenge.id}`,
      eventType: "otp_verified",
      generatedAt: new Date(),
      payload: { recipientId: target.recipientId },
      processedAt: new Date(),
    }).onConflictDoNothing();
    return { ok: true as const, cookieValue: nativeSignatureCookieValue(target.recipientId, challenge.id) };
  });
}

export const nativeSignCookieName = verificationCookie;
/** How long a verified email code keeps the document unlocked. */
export const NATIVE_OTP_SESSION_SECONDS = OTP_TTL_MS / 1000;

/** Mask an address for display: j***@example.com */
export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "your email";
  return `${local.slice(0, 1)}***@${domain}`;
}
