import "server-only";

import { createElement } from "react";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  applications,
  candidates,
  db,
  jobs,
  mailIdempotencyKeys,
  mailUnificationMigrations,
} from "@harly/db";
import { getWorkspaceEmailSender } from "@/lib/email";
import { isSampleEmailAddress } from "@/features/sample-data/constants";
import {
  insertCanonicalMessage,
  type CanonicalAttachment,
  type MailSource,
} from "./canonical";
import { isMailUnificationEnabled } from "./feature-flag";
import {
  MailDeliveryConflictError,
  type MailDeliveryConflictCode,
} from "./delivery-state";
import { createLogger } from "@/lib/logger";

const log = createLogger("canonical-mail-send");

const ACCEPTANCE_WRITE_ATTEMPTS = 3;

export type SendCanonicalEmailInput = {
  workspaceId: string;
  idempotencyKey: string;
  candidateId?: string | null;
  applicationId?: string | null;
  threadId?: string | null;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  attachments?: CanonicalAttachment[];
  inReplyTo?: string | null;
  references?: string | null;
  authorId?: string | null;
  sourceHint?: "provider" | "smtp";
  replyTo?: string | null;
};

/** Thrown before any reservation or provider call: sample recipients never receive mail. */
export class SampleRecipientError extends Error {
  constructor() {
    super("This recipient is sample data. Sample candidates cannot receive email.");
    this.name = "SampleRecipientError";
  }
}

export type SendCanonicalEmailResult = {
  /** True once the provider accepted the message (even if local persistence failed). */
  delivered: boolean;
  /** Empty when the conversation record is not saved yet. */
  threadId: string;
  messageId: string;
  mailMessageId?: string;
  providerMessageId?: string | null;
  idempotentReplay?: boolean;
  /** False when the provider accepted the message but the local record is still missing. */
  persisted?: boolean;
  legacyWriteWarning?: string;
};

type IdempotencyRow = typeof mailIdempotencyKeys.$inferSelect;

type Reservation =
  | { kind: "reserved"; row: IdempotencyRow }
  | { kind: "accepted"; row: IdempotencyRow }
  | { kind: "conflict"; code: MailDeliveryConflictCode; row: IdempotencyRow };

function payloadHash(input: SendCanonicalEmailInput) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: input.workspaceId,
        candidateId: input.candidateId ?? null,
        applicationId: input.applicationId ?? null,
        threadId: input.threadId ?? null,
        toEmail: input.toEmail.trim().toLowerCase(),
        subject: input.subject,
        textBody: input.textBody,
        htmlBody: input.htmlBody ?? null,
        inReplyTo: input.inReplyTo ?? null,
        references: input.references ?? null,
      }),
    )
    .digest("hex");
}

/**
 * Reserve the idempotency key. Conflicts are returned, never thrown:
 * `unknown` means an earlier attempt may have reached the provider, so the key
 * is never re-sent automatically; `sending` means another request owns it.
 */
async function reserve(input: SendCanonicalEmailInput, hash: string): Promise<Reservation> {
  const generatedMessageId = `<${randomUUID()}@harly.local>`;
  const [created] = await db
    .insert(mailIdempotencyKeys)
    .values({
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      messageId: generatedMessageId,
      payloadHash: hash,
      status: "pending",
      candidateId: input.candidateId ?? null,
      applicationId: input.applicationId ?? null,
    })
    .onConflictDoNothing({
      target: [
        mailIdempotencyKeys.workspaceId,
        mailIdempotencyKeys.idempotencyKey,
      ],
    })
    .returning();
  if (created) {
    const claimed = await claimForSending(created);
    return claimed ?? { kind: "conflict", code: "delivery_in_progress", row: created };
  }
  const [existing] = await db
    .select()
    .from(mailIdempotencyKeys)
    .where(
      and(
        eq(mailIdempotencyKeys.workspaceId, input.workspaceId),
        eq(mailIdempotencyKeys.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Unable to reserve mail idempotency key.");
  if (existing.payloadHash !== hash)
    throw new Error("Idempotency key was reused with a different payload.");
  if (existing.status === "sent") return { kind: "accepted", row: existing };
  if (existing.status === "unknown")
    return { kind: "conflict", code: "delivery_unknown", row: existing };
  if (existing.status === "sending")
    return { kind: "conflict", code: "delivery_in_progress", row: existing };
  const claimed = await claimForSending(existing);
  return claimed ?? { kind: "conflict", code: "delivery_in_progress", row: existing };
}

async function claimForSending(row: IdempotencyRow): Promise<Reservation | null> {
  const [claimed] = await db
    .update(mailIdempotencyKeys)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(mailIdempotencyKeys.id, row.id),
        eq(mailIdempotencyKeys.status, row.status),
      ),
    )
    .returning();
  return claimed ? { kind: "reserved", row: claimed } : null;
}

async function writeLegacy(
  input: SendCanonicalEmailInput,
  messageId: string,
  mailMessageId: string,
) {
  if (!input.candidateId) return undefined;
  try {
    const { candidateMessages } = await import("@harly/db");
    const [legacy] = await db
      .insert(candidateMessages)
      .values({
        workspaceId: input.workspaceId,
        candidateId: input.candidateId,
        applicationId: input.applicationId ?? null,
        authorId: input.authorId ?? null,
        direction: "outbound",
        toEmail: input.toEmail,
        fromEmail: process.env.EMAIL_FROM ?? "noreply@harly.local",
        subject: input.subject,
        body: input.textBody,
        providerMessageId: messageId,
        inReplyTo: input.inReplyTo ?? null,
        references: input.references ?? null,
        attachments:
          input.attachments?.map(
            ({ filename, contentType, size, storageKey }) => ({
              filename,
              contentType,
              size: size ?? 0,
              storageKey: storageKey ?? "",
            }),
          ) ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: candidateMessages.id });
    if (legacy) {
      await db
        .insert(mailUnificationMigrations)
        .values({
          workspaceId: input.workspaceId,
          candidateMessageId: legacy.id,
          mailMessageId,
          fingerprint: messageId,
          status: "migrated",
        })
        .onConflictDoNothing();
    }
    return undefined;
  } catch (error) {
    log.warn(
      { error, workspaceId: input.workspaceId },
      "canonical mail legacy dual-write failed",
    );
    return "Canonical mail delivered, but the legacy candidate message could not be written.";
  }
}

/**
 * Record the provider's acceptance on the key before anything else. A key in
 * `sent` is never sent again, so this is the point of no return.
 */
async function markAccepted(
  rowId: string,
  providerMessageId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= ACCEPTANCE_WRITE_ATTEMPTS; attempt += 1) {
    try {
      await db
        .update(mailIdempotencyKeys)
        .set({
          status: "sent",
          providerMessageId,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(mailIdempotencyKeys.id, rowId));
      return true;
    } catch (error) {
      log.error(
        { error, rowId, attempt },
        "could not record accepted canonical mail; retrying the bookkeeping only",
      );
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
  return false;
}

/**
 * Save the conversation record for a message the provider already accepted.
 * Safe to repeat: `insertCanonicalMessage` dedupes on the Message-ID. It never
 * sends anything, so a failure here cannot cause a duplicate email.
 */
async function persistAccepted(
  input: SendCanonicalEmailInput,
  row: IdempotencyRow,
  providerMessageId: string | null,
): Promise<SendCanonicalEmailResult> {
  let canonical: Awaited<ReturnType<typeof insertCanonicalMessage>>;
  try {
    canonical = await insertCanonicalMessage({
      ...input,
      source: input.sourceHint ?? ("provider" as MailSource),
      mailboxId: null,
      messageId: row.messageId,
      fromEmail: process.env.EMAIL_FROM ?? "noreply@harly.local",
      toEmails: [input.toEmail],
      direction: "outbound",
      receivedAt: new Date(),
      readAt: new Date(),
    });
  } catch (error) {
    log.error(
      { error, idempotencyRowId: row.id },
      "accepted canonical mail could not be saved to the conversation",
    );
    return {
      delivered: true,
      threadId: "",
      messageId: row.messageId,
      providerMessageId,
      persisted: false,
      legacyWriteWarning:
        "Sent, but the conversation record could not be saved. It will be completed when this message is retried.",
    };
  }
  const legacyWriteWarning = await writeLegacy(
    input,
    row.messageId,
    canonical.messageId,
  );
  try {
    await db
      .update(mailIdempotencyKeys)
      .set({
        status: "sent",
        threadId: canonical.threadId,
        mailMessageId: canonical.messageId,
        providerMessageId,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(mailIdempotencyKeys.id, row.id));
  } catch (error) {
    // The message is saved (dedupes on Message-ID); a replay links the key.
    log.error({ error, idempotencyRowId: row.id }, "could not link saved canonical mail to its key");
  }
  return {
    delivered: true,
    threadId: canonical.threadId,
    messageId: row.messageId,
    mailMessageId: canonical.messageId,
    providerMessageId,
    persisted: true,
    legacyWriteWarning,
  };
}

async function assertCandidateAndApplication(input: SendCanonicalEmailInput) {
  if (input.candidateId) {
    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, input.candidateId),
          eq(candidates.workspaceId, input.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);
    if (!candidate)
      throw new Error("Candidate does not belong to this workspace.");
  }
  if (input.applicationId) {
    const [application] = await db
      .select({ id: applications.id, candidateId: applications.candidateId })
      .from(applications)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, applications.candidateId),
          eq(candidates.workspaceId, input.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, applications.jobId),
          eq(jobs.workspaceId, input.workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .where(
        and(
          eq(applications.id, input.applicationId),
          eq(applications.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (
      !application ||
      (input.candidateId && application.candidateId !== input.candidateId)
    )
      throw new Error(
        "Application does not belong to this workspace or candidate.",
      );
  }
}

/**
 * Send a canonical email at most once per idempotency key.
 *
 * - Provider rejection or a missing sender marks the key `failed`; the same key
 *   may be retried.
 * - Once the provider accepts, the key is `sent` before any local step runs.
 *   A later persistence failure returns `delivered: true, persisted: false`
 *   instead of throwing, and never re-sends.
 * - Reservation conflicts throw `MailDeliveryConflictError` (code
 *   `delivery_unknown` or `delivery_in_progress`); mailbox actions turn them
 *   into typed results.
 */
export async function sendCanonicalEmail(
  input: SendCanonicalEmailInput,
): Promise<SendCanonicalEmailResult> {
  if (isSampleEmailAddress(input.toEmail)) throw new SampleRecipientError();
  const enabled = await isMailUnificationEnabled(input.workspaceId);
  if (!enabled)
    throw new Error(
      "Canonical mail sending is not enabled for this workspace.",
    );
  await assertCandidateAndApplication(input);
  const hash = payloadHash(input);
  const reservation = await reserve(input, hash);
  if (reservation.kind === "conflict")
    throw new MailDeliveryConflictError(reservation.code);
  const row = reservation.row;

  if (reservation.kind === "accepted") {
    if (row.mailMessageId) {
      return {
        delivered: true,
        threadId: row.threadId ?? "",
        messageId: row.messageId,
        mailMessageId: row.mailMessageId,
        providerMessageId: row.providerMessageId,
        idempotentReplay: true,
        persisted: true,
      };
    }
    // Accepted earlier, but the conversation record was never saved. Finish
    // that step only.
    return {
      ...(await persistAccepted(input, row, row.providerMessageId)),
      idempotentReplay: true,
    };
  }

  const sender = await getWorkspaceEmailSender(input.workspaceId, input.authorId);
  let providerMessageId: string | null;
  try {
    if (!sender) throw new Error("Email sending is not configured.");
    const provider = await sender.send({
      to: input.toEmail,
      subject: input.subject,
      react: input.htmlBody
        ? createElement("div", {
            dangerouslySetInnerHTML: { __html: input.htmlBody },
          })
        : createElement(
            "div",
            { style: { whiteSpace: "pre-wrap", fontFamily: "sans-serif" } },
            input.textBody,
          ),
      replyTo: input.replyTo ?? undefined,
      messageId: row.messageId,
      idempotencyKey: input.idempotencyKey,
      attachments: input.attachments,
    });
    providerMessageId = provider.messageId ?? row.messageId;
  } catch (error) {
    // The provider did not accept it, so the same key stays retryable.
    await db
      .update(mailIdempotencyKeys)
      .set({
        status: "failed",
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "delivery failed",
        updatedAt: new Date(),
      })
      .where(eq(mailIdempotencyKeys.id, row.id));
    throw error;
  }

  // Point of no return: the provider accepted the message.
  const recorded = await markAccepted(row.id, providerMessageId);
  const result = await persistAccepted(input, row, providerMessageId);
  if (!recorded) {
    log.error(
      { idempotencyRowId: row.id },
      "accepted canonical mail left its key in sending; reconciliation will mark it unknown",
    );
  }
  return result;
}
