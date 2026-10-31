import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db, documents, signatureEnvelopes, signatureEvents, signatureRecipients } from "@harly/db";

export type SignerState = "waiting" | "invited" | "opened" | "signed" | "declined" | "expired" | "voided";

export type SignatureTimelineEntry = {
  id: string;
  at: Date;
  kind: "sent" | "invited" | "opened" | "verified" | "consented" | "signed" | "reminder" | "declined" | "expired" | "voided" | "completed";
  tone: "neutral" | "success" | "warning" | "danger";
  /** Short readable sentence, e.g. "Ana Ruiz signed". */
  title: string;
  detail?: string;
  signer?: string;
};

export type SignatureTimelineSigner = {
  id: string;
  order: number;
  name: string;
  email: string;
  state: SignerState;
  invitedAt: Date | null;
  viewedAt: Date | null;
  signedAt: Date | null;
  declinedAt: Date | null;
  declinedReason: string | null;
  consentAt: Date | null;
  linkExpiresAt: Date | null;
  reminderCount: number;
  lastReminderAt: Date | null;
};

export type SignatureTimeline = {
  envelopeId: string;
  /** sent | completed | declined | voided | expired */
  status: string;
  voidReason: string | null;
  signers: SignatureTimelineSigner[];
  entries: SignatureTimelineEntry[];
};

/**
 * Readable audit timeline for a document's latest native signature request:
 * who was invited, who opened the link, who verified, consented, signed,
 * declined, was reminded, and how the request ended. Newest request wins, so a
 * voided or declined request is still readable after the document is reset.
 * The caller is responsible for the permission check.
 */
export async function getNativeSignatureTimeline(input: { workspaceId: string; documentId: string }): Promise<SignatureTimeline | null> {
  const [live] = await db
    .select({ id: documents.signatureEnvelopeRefId })
    .from(documents)
    .where(and(eq(documents.id, input.documentId), eq(documents.workspaceId, input.workspaceId)))
    .limit(1);
  const [envelope] = live?.id
    ? await db.select().from(signatureEnvelopes).where(and(eq(signatureEnvelopes.id, live.id), eq(signatureEnvelopes.workspaceId, input.workspaceId))).limit(1)
    : await db.select().from(signatureEnvelopes).where(and(eq(signatureEnvelopes.documentId, input.documentId), eq(signatureEnvelopes.workspaceId, input.workspaceId), eq(signatureEnvelopes.provider, "native"))).orderBy(desc(signatureEnvelopes.createdAt)).limit(1);
  if (!envelope) return null;

  const recipients = await db.select().from(signatureRecipients).where(and(eq(signatureRecipients.envelopeId, envelope.id), eq(signatureRecipients.workspaceId, input.workspaceId), eq(signatureRecipients.role, "signer"))).orderBy(asc(signatureRecipients.routingOrder));
  const events = await db.select().from(signatureEvents).where(and(eq(signatureEvents.envelopeId, envelope.id), eq(signatureEvents.workspaceId, input.workspaceId))).orderBy(asc(signatureEvents.createdAt));
  const now = new Date();

  const signers: SignatureTimelineSigner[] = recipients.map((row) => {
    let state: SignerState = "waiting";
    if (row.status === "signed") state = "signed";
    else if (row.status === "declined") state = "declined";
    else if (row.status === "voided") state = "voided";
    else if (row.status === "expired" || (row.status === "sent" && row.linkExpiresAt && row.linkExpiresAt <= now)) state = "expired";
    else if (row.status === "sent") state = row.viewedAt ? "opened" : "invited";
    return {
      id: row.id,
      order: row.routingOrder,
      name: row.name,
      email: row.email,
      state,
      invitedAt: row.invitedAt,
      viewedAt: row.viewedAt,
      signedAt: row.signedAt,
      declinedAt: row.declinedAt,
      declinedReason: row.declinedReason,
      consentAt: row.consentAt,
      linkExpiresAt: row.linkExpiresAt,
      reminderCount: row.reminderCount,
      lastReminderAt: row.lastReminderAt,
    };
  });

  const nameOf = (id: unknown) => recipients.find((row) => row.id === id)?.name ?? "A signer";
  const entries: SignatureTimelineEntry[] = [];
  if (envelope.sentAt) entries.push({ id: "sent", at: envelope.sentAt, kind: "sent", tone: "neutral", title: `Sent for signature to ${recipients.length} ${recipients.length === 1 ? "signer" : "signers"}` });
  for (const row of recipients) {
    if (row.invitedAt && !(row.routingOrder === 1 && envelope.sentAt && row.invitedAt.getTime() === envelope.sentAt.getTime())) {
      entries.push({ id: `invited-${row.id}`, at: row.invitedAt, kind: "invited", tone: "neutral", title: `${row.name} was invited`, detail: row.email, signer: row.name });
    }
    if (row.viewedAt) entries.push({ id: `opened-${row.id}`, at: row.viewedAt, kind: "opened", tone: "neutral", title: `${row.name} opened the link`, signer: row.name });
    if (row.consentAt && row.status === "signed") entries.push({ id: `consent-${row.id}`, at: row.consentAt, kind: "consented", tone: "neutral", title: `${row.name} accepted the e-sign disclosure`, detail: undefined, signer: row.name });
    if (row.signedAt) entries.push({ id: `signed-${row.id}`, at: row.signedAt, kind: "signed", tone: "success", title: `${row.name} signed`, signer: row.name });
    if (row.declinedAt) entries.push({ id: `declined-${row.id}`, at: row.declinedAt, kind: "declined", tone: "danger", title: `${row.name} declined to sign`, detail: row.declinedReason ?? "No reason given", signer: row.name });
    if (row.status === "expired" || (row.status === "sent" && row.linkExpiresAt && row.linkExpiresAt <= now)) {
      entries.push({ id: `expired-${row.id}`, at: row.linkExpiresAt ?? now, kind: "expired", tone: "warning", title: `${row.name}'s link expired`, signer: row.name });
    }
  }
  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const at = event.generatedAt ?? event.createdAt;
    if (event.eventType === "reminder_sent") {
      entries.push({ id: `reminder-${event.id}`, at, kind: "reminder", tone: "neutral", title: `Reminder sent to ${nameOf(payload.recipientId)}`, detail: payload.manual ? "Sent manually" : "Automatic reminder" });
    } else if (event.eventType === "otp_verified") {
      entries.push({ id: `otp-${event.id}`, at, kind: "verified", tone: "neutral", title: `${nameOf(payload.recipientId)} verified their email code` });
    }
  }
  if (envelope.voidedAt && envelope.status === "voided") {
    const signed = signers.filter((signer) => signer.state === "signed");
    entries.push({
      id: "voided",
      at: envelope.voidedAt,
      kind: "voided",
      tone: "warning",
      title: "Request cancelled by the sender",
      detail: [envelope.voidReason, signed.length ? `Signatures from ${signed.map((s) => s.name).join(", ")} are kept in this record but do not carry over.` : null].filter(Boolean).join(" "),
    });
  }
  if (envelope.completedAt) entries.push({ id: "completed", at: envelope.completedAt, kind: "completed", tone: "success", title: "Everyone signed. Certificate issued." });

  entries.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { envelopeId: envelope.id, status: envelope.status, voidReason: envelope.voidReason ?? null, signers, entries };
}
