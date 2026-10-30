import { and, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { createElement } from "react";
import { createHash, randomUUID } from "node:crypto";

import {
  activityEvents,
  applications,
  candidates,
  db,
  documentAssociations,
  documents,
  emailOutbox,
  offers,
  organization,
} from "@harly/db";
import {
  DeliveryOutcomeUnknownError,
  ApplicationReceivedCandidate,
  ApplicationReceivedRecruiter,
  applicationReceivedCandidateSubject,
  applicationReceivedRecruiterSubject,
  CandidateRejected,
  CandidateStageUpdate,
  candidateRejectedSubject,
  candidateStageUpdateSubject,
  CustomTemplateEmail,
  InterviewCanceled,
  interviewCanceledSubject,
  InterviewRescheduled,
  interviewRescheduledSubject,
  InterviewScheduled,
  interviewScheduledSubject,
  OfferExtended,
  offerExtendedSubject,
  OfferWithdrawn,
  offerWithdrawnSubject,
} from "@harly/emails";

import { renderActiveEmailTemplate } from "@/features/email-templates/data";
import { isSampleEmailAddress } from "@/features/sample-data/constants";
import { sendWorkspaceEmail, type SendEmailOptions } from "@/lib/email";
import { getWorkspaceEmailBranding } from "@/lib/email/branding";
import { getWorkspaceEmailConfig } from "@/lib/email/config";
import { sanitizeDeliveryError } from "@/lib/email/delivery-warning";
import {
  formatInterviewWhen,
  resolveInterviewTimeZone,
} from "@/lib/email/interview-time";
import { decryptSecret } from "@/lib/crypto";
import { insertCanonicalMessage } from "@/lib/mail/canonical";
import { createLogger } from "@/lib/logger";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { storage } from "@/lib/storage";
import {
  offerMatchesTerms,
  parseOfferTermsSnapshot,
  snapshotOfferTerms,
  type OfferTermsSnapshot,
} from "@/features/offers/core";

const log = createLogger("email-outbox");

/**
 * Total claims a row may receive. Every claim increments `attempts`, so a
 * payload that crashes the worker (or a worker that stalls mid-send) cannot
 * loop forever: once the cap is reached the row ends `failed` with `lastError`.
 */
const MAX_ATTEMPTS = 5;
/** A `processing` lock older than this belongs to a stalled worker. */
const STALE_LOCK_SQL = sql.raw("interval '5 minutes'");
const RECORD_ACCEPTANCE_ATTEMPTS = 5;
/**
 * Writes that record the outcome of an accepted or unknown send. A dropped
 * connection usually clears within seconds; these retries cover that window.
 */
const BOOKKEEPING_ATTEMPTS = 6;
const BOOKKEEPING_MAX_DELAY_MS = 4_000;

/** Held on a row the provider accepted but whose success write never landed. */
const ACCEPTED_HELD_NOTE =
  "The provider accepted this email, but its delivery record could not be saved, so the row is held and was not sent again.";
/** Stored in `last_error` for an unknown SMTP outcome. Operators can match on this prefix. */
export const UNKNOWN_OUTCOME_PREFIX = "Delivery outcome unknown";
/** Held on a row whose SMTP outcome is unknown. Retrying is an explicit operator choice. */
const UNKNOWN_OUTCOME_NOTE =
  "Delivery outcome unknown: the mail server stopped responding after the message was handed over. It was not sent again. Check the sent folder before retrying from the Delivery log.";
/**
 * Stored on rows that were never sent because a recipient is sample data.
 * `cancelled` is an existing terminal status: the row is never claimed again,
 * and it carries no failure noise in the delivery log or the recruiter toast.
 */
export const SAMPLE_RECIPIENT_NOTE =
  "Not sent: the recipient is sample data (sample.invalid). Sample data never receives email.";

const dateFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatOfferDate(value: Date | null): string | undefined {
  return value ? dateFormatter.format(value) : undefined;
}

function formatOfferSalary(
  amount: number | null,
  currency: string | null,
  period: "annual" | "monthly" | null,
): string | undefined {
  if (!amount) return undefined;
  let money: string;
  try {
    money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    money = `${amount.toLocaleString()} ${currency ?? ""}`.trim();
  }
  return period === "monthly" ? `${money} / month` : `${money} / year`;
}

type OutboxRow = typeof emailOutbox.$inferSelect;

export type ProcessResult = {
  processed: number;
  sent: number;
  failed: number;
  /** Rows deliberately not sent (sample recipients). Never retried. */
  skipped?: number;
  /** Claimed rows handed back because the deadline passed before they started. */
  deferred?: number;
};

/** Deterministic Message-ID for a row; the same id is used for SMTP headers. */
export function outboxMessageId(outboxId: string): string {
  return `<${outboxId}@harly.local>`;
}

/**
 * Process pending/failed email_outbox rows. Delivery is at-most-once per row
 * in the common path: a row whose provider already accepted the email (has a
 * `providerMessageId` or `sentAt`) is never sent again, only finalized.
 */
export async function processEmailOutbox(opts?: {
  workspaceId?: string;
  limit?: number;
  ids?: string[];
  workerId?: string;
  /** Explicit database boundary for isolated workers and native signing. */
  database?: typeof db;
  /**
   * Wall-clock time (ms since epoch) after which no new row is started. Claimed
   * rows that were not started yet go back to the queue untouched.
   */
  deadlineAt?: number;
}): Promise<ProcessResult> {
  const database = opts?.database ?? db;
  const pastDeadline = () => opts?.deadlineAt !== undefined && Date.now() >= opts.deadlineAt;
  if (pastDeadline()) return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  const workerId = opts?.workerId ?? randomUUID();
  const idsFilter = opts?.ids?.length
    ? sql`and "id" in (${sql.join(
        opts.ids.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  const workspaceFilter = opts?.workspaceId
    ? sql`and "workspace_id" = ${opts.workspaceId}`
    : sql``;

  // A stalled claim that already used every attempt can never be retried
  // safely; end it as failed so the operator sees it in the delivery log.
  await database.execute(sql`
    update "email_outbox"
    set "status" = 'failed',
        "last_error" = 'Delivery did not finish after ' || "attempts" || ' attempts; the email worker stopped before recording the result.',
        "next_retry_at" = null,
        "locked_at" = null,
        "locked_by" = null,
        "updated_at" = now()
    where "status" = 'processing'
      and "locked_at" < now() - ${STALE_LOCK_SQL}
      and "attempts" >= ${MAX_ATTEMPTS}
      ${idsFilter}
      ${workspaceFilter}
  `);

  const claimed = (await database.execute(sql`
    with candidates as (
      select "id"
      from "email_outbox"
      where (
        ("status" = 'pending' and ("next_retry_at" is null or "next_retry_at" <= now()))
        or ("status" = 'processing'
          and "locked_at" < now() - ${STALE_LOCK_SQL}
          and "attempts" < ${MAX_ATTEMPTS})
      )
      ${idsFilter}
      ${workspaceFilter}
      order by "created_at"
      for update skip locked
      limit ${opts?.limit ?? 50}
    )
    update "email_outbox" as queue
    set "status" = 'processing',
        "locked_at" = now(),
        "locked_by" = ${workerId},
        "attempts" = queue."attempts" + 1,
        "updated_at" = now()
    from candidates
    where queue."id" = candidates."id"
    returning queue."id"
  `)) as unknown as Array<{ id: string }>;

  if (claimed.length === 0) return { processed: 0, sent: 0, failed: 0 };
  const rows = await database
    .select()
    .from(emailOutbox)
    .where(
      and(
        inArray(
          emailOutbox.id,
          claimed.map((row) => row.id),
        ),
        eq(emailOutbox.lockedBy, workerId),
      ),
    )
    .orderBy(emailOutbox.createdAt)
    .limit(opts?.limit ?? 50);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  for (const row of rows) {
    if (pastDeadline()) {
      await releaseUnstarted(row.id, workerId, database);
      deferred += 1;
      continue;
    }
    const ok = await deliverRow(row, database, workerId);
    if (ok === "skipped") skipped += 1;
    else if (ok) sent += 1;
    else failed += 1;
  }
  return {
    processed: rows.length - deferred,
    sent,
    failed,
    skipped,
    ...(deferred > 0 ? { deferred } : {}),
  };
}

/**
 * Hands back a claim that was never started. The attempt was not used, so the
 * claim's increment is undone and the row is eligible again at once.
 */
async function releaseUnstarted(id: string, workerId: string, database: typeof db) {
  await database
    .update(emailOutbox)
    .set({
      status: "pending",
      lockedAt: null,
      lockedBy: null,
      attempts: sql`greatest(${emailOutbox.attempts} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutbox.id, id),
        eq(emailOutbox.status, "processing"),
        eq(emailOutbox.lockedBy, workerId),
      ),
    );
}

type OutboxState = {
  status: string;
  lockedBy: string | null;
  sentAt: Date | null;
  providerMessageId: string | null;
};

async function readOutboxState(
  id: string,
  database: typeof db,
): Promise<OutboxState | null> {
  const [state] = await database
    .select({
      status: emailOutbox.status,
      lockedBy: emailOutbox.lockedBy,
      sentAt: emailOutbox.sentAt,
      providerMessageId: emailOutbox.providerMessageId,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, id))
    .limit(1);
  return state ?? null;
}

/** Terminal success. Safe to call repeatedly. */
async function finalizeAccepted(id: string, database: typeof db) {
  await database
    .update(emailOutbox)
    .set({
      status: "sent",
      sentAt: sql`coalesce(${emailOutbox.sentAt}, now())`,
      providerMessageId: sql`coalesce(${emailOutbox.providerMessageId}, ${outboxMessageId(id)})`,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    })
    .where(eq(emailOutbox.id, id));
}

/** Rows the provider accepted during this process. A later failure must never make them retryable. */
const acceptedInFlight = new Set<string>();
/** Rows whose SMTP outcome is unknown. They are settled as failed and never retried automatically. */
const unknownOutcomeInFlight = new Set<string>();

/**
 * Write one bookkeeping statement, retrying with a capped backoff. Returns
 * false when every attempt failed; the caller decides what that means.
 */
async function settleRow(
  id: string,
  values: Record<string, unknown>,
  database: typeof db,
  attempts: number = BOOKKEEPING_ATTEMPTS,
): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await database.update(emailOutbox).set(values).where(eq(emailOutbox.id, id));
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(250 * 2 ** attempt, BOOKKEEPING_MAX_DELAY_MS)),
        );
      }
    }
  }
  log.error({ error: lastError, outboxRowId: id }, "email_outbox bookkeeping failed after retries");
  return false;
}

/**
 * The provider accepted this row, so it is finalized and never retried. If the
 * success write keeps failing, the row is held as `failed` with the provider
 * Message-ID: no claim path picks `failed` rows, and retries and cancels refuse
 * rows that carry a provider id.
 */
async function settleAccepted(id: string, database: typeof db) {
  const finalized = await settleRow(
    id,
    {
      status: "sent",
      sentAt: sql`coalesce(${emailOutbox.sentAt}, now())`,
      providerMessageId: sql`coalesce(${emailOutbox.providerMessageId}, ${outboxMessageId(id)})`,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
    database,
  );
  if (finalized) return;
  // Best effort, and short: this runs inside a scheduler-bounded batch.
  await settleRow(
    id,
    {
      status: "failed",
      providerMessageId: sql`coalesce(${emailOutbox.providerMessageId}, ${outboxMessageId(id)})`,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: ACCEPTED_HELD_NOTE,
    },
    database,
    2,
  );
  log.error(
    { outboxRowId: id },
    "provider accepted email but its delivery record could not be saved; row held and not sent again",
  );
}

/**
 * Persist the provider's acceptance in its own statement, before any other
 * bookkeeping, so a later failure can never turn an accepted email back into
 * a retryable one.
 */
async function recordAcceptance(
  id: string,
  providerMessageId: string | undefined,
  database: typeof db,
) {
  const value = providerMessageId ?? outboxMessageId(id);
  let lastError: unknown;
  for (let attempt = 1; attempt <= RECORD_ACCEPTANCE_ATTEMPTS; attempt += 1) {
    try {
      await database
        .update(emailOutbox)
        .set({ providerMessageId: value })
        .where(eq(emailOutbox.id, id));
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
  throw lastError;
}

/**
 * The only way outbox code sends. Records the provider acceptance immediately.
 * If that write keeps failing the error is logged and the caller continues:
 * `markSent` writes the same id again, and the next claim finds it either way.
 */
async function sendRecorded(
  row: OutboxRow,
  database: typeof db,
  options: SendEmailOptions,
  actorUserId?: string | null,
): Promise<Awaited<ReturnType<typeof sendWorkspaceEmail>>> {
  let delivered: Awaited<ReturnType<typeof sendWorkspaceEmail>>;
  try {
    delivered = await sendWorkspaceEmail(row.workspaceId, options, actorUserId, {
      rethrowUnknownOutcome: true,
    });
  } catch (error) {
    if (!(error instanceof DeliveryOutcomeUnknownError)) throw error;
    // The message may already be with the recipient's mail server. Settle the
    // row now so no retry path can send it again.
    unknownOutcomeInFlight.add(row.id);
    log.error({ error, outboxRowId: row.id }, "email delivery outcome is unknown; not sent again automatically");
    await settleRow(
      row.id,
      {
        status: "failed",
        lastError: UNKNOWN_OUTCOME_NOTE,
        nextRetryAt: null,
        lockedAt: null,
        lockedBy: null,
      },
      database,
    );
    return false;
  }
  if (delivered) {
    // Recorded before anything else can fail: from here on this row is accepted.
    acceptedInFlight.add(row.id);
    try {
      await recordAcceptance(row.id, delivered.messageId, database);
    } catch (error) {
      log.error(
        { error, outboxRowId: row.id },
        "provider accepted email but its message id could not be recorded",
      );
    }
  }
  return delivered;
}

/** Closes a row addressed to sample data. The provider is never called and the row is never claimed again. */
async function skipAsSampleRecipient(row: OutboxRow, database: typeof db): Promise<"skipped"> {
  await database
    .update(emailOutbox)
    .set({
      status: "cancelled",
      lastError: SAMPLE_RECIPIENT_NOTE,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(emailOutbox.id, row.id));
  log.info({ outboxRowId: row.id, kind: row.kind }, "email skipped: sample recipient");
  return "skipped";
}

/** Addresses readable from the payload alone. Offers resolve their candidate in `deliverOffer`. */
function payloadRecipientEmails(row: OutboxRow): string[] {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  return ["to", "candidateEmail", "recipientEmail"]
    .map((key) => payload[key])
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");
}

async function deliverRow(
  row: OutboxRow,
  database: typeof db = db,
  workerId?: string,
): Promise<boolean | "skipped"> {
  try {
    return await deliverRowOnce(row, database, workerId);
  } finally {
    acceptedInFlight.delete(row.id);
    unknownOutcomeInFlight.delete(row.id);
  }
}

async function deliverRowOnce(
  row: OutboxRow,
  database: typeof db,
  workerId?: string,
): Promise<boolean | "skipped"> {
  try {
    const current = await readOutboxState(row.id, database);
    if (!current) return false;
    if (current.providerMessageId || current.sentAt) {
      // An earlier attempt already got the provider to accept this email.
      // Only the bookkeeping may run; the send must never repeat.
      acceptedInFlight.add(row.id);
      await settleAccepted(row.id, database);
      return true;
    }
    if (current.status !== "processing" || (workerId && current.lockedBy !== workerId)) {
      // Cancelled by an operator, or re-claimed by another worker.
      return false;
    }
    if (payloadRecipientEmails(row).some(isSampleEmailAddress)) {
      return skipAsSampleRecipient(row, database);
    }
    switch (row.kind) {
      case "offer.extended":
        return await deliverOffer(row, database);
      case "application.received.candidate":
        return await deliverApplicationReceived(row, "candidate", database);
      case "application.received.recruiter":
        return await deliverApplicationReceived(row, "recruiter", database);
      case "pipeline.stage":
      case "pipeline.rejected":
        return await deliverPipelineEmail(row, database);
      case "interview.scheduled":
      case "interview.rescheduled":
      case "interview.canceled":
        return await deliverInterviewEmail(row, database);
      case "offer.withdrawn":
        return await deliverOfferWithdrawn(row, database);
      case "native.signature.invitation":
        return await deliverNativeSignatureInvitation(row, database);
      case "native.signature.otp":
        return await deliverNativeSignatureOtp(row, database);
      case "report.scheduled":
        return await deliverScheduledReport(row, database);
      case "automation.email":
        return await deliverAutomationEmail(row, database);
      default:
        log.warn({ kind: row.kind }, "unknown email_outbox kind");
        await database
          .update(emailOutbox)
          .set({
            status: "failed",
            lastError: `Unknown kind: ${row.kind}`,
            nextRetryAt: null,
            lockedAt: null,
            lockedBy: null,
          })
          .where(eq(emailOutbox.id, row.id));
        return false;
    }
  } catch (error) {
    log.error(error, "email_outbox delivery threw");
    if (acceptedInFlight.has(row.id)) {
      // Never a retry: the provider has the message.
      await settleAccepted(row.id, database);
      return true;
    }
    if (unknownOutcomeInFlight.has(row.id)) return false;
    if (await finalizeIfAccepted(row.id, database)) return true;
    await markFailed(
      row.id,
      error instanceof Error ? error.message : "delivery error",
      database,
    );
    return false;
  }
}

async function finalizeIfAccepted(id: string, database: typeof db): Promise<boolean> {
  const state = await readOutboxState(id, database);
  if (!state || (!state.providerMessageId && !state.sentAt)) return false;
  await finalizeAccepted(id, database);
  return true;
}

async function deliverAutomationEmail(row: OutboxRow, database: typeof db = db): Promise<boolean> {
  const payload = row.payload as {
    to?: string;
    subject?: string;
    bodyHtml?: string;
    candidateId?: string | null;
    companyName?: string;
  };
  if (!payload.to || !payload.subject || !payload.bodyHtml) {
    await markFailed(row.id, "Automation email payload is incomplete.", database);
    return false;
  }
  const branding = await getWorkspaceEmailBranding(row.workspaceId);
  const delivered = await sendRecorded(row, database, {
    to: payload.to,
    subject: payload.subject,
    react: createElement(CustomTemplateEmail, {
      bodyHtml: payload.bodyHtml,
      companyName: payload.companyName || branding.name || "Harly",
      companyLogoUrl: branding.logoUrl ?? undefined,
      hideBranding: branding.hideBranding,
      accentColor: branding.primaryColor ?? undefined,
      socialLinks: branding.socialLinks,
    }),
    ...deliveryOptions(row),
  }, row.actorId ?? undefined);
  if (!delivered) {
    await markFailed(row.id, "No configured workspace email sender.", database);
    return false;
  }
  await markSent(row.id, delivered, database);
  await recordOutboundConversation({
    workspaceId: row.workspaceId,
    toEmail: payload.to,
    subject: payload.subject,
    textBody: payload.bodyHtml.replaceAll(/<[^>]*>/g, " "),
    outboxRowId: row.id,
    candidateId: payload.candidateId,
  });
  return true;
}

async function deliverScheduledReport(row: OutboxRow, database: typeof db = db): Promise<boolean> {
  const payload = row.payload as {
    to?: string;
    subject?: string;
    bodyHtml?: string;
    companyName?: string;
  };
  if (!payload.to || !payload.subject || !payload.bodyHtml) {
    await markFailed(row.id, "Scheduled report payload is incomplete.", database);
    return false;
  }
  const delivered = await sendRecorded(row, database, {
    to: payload.to,
    subject: payload.subject,
    react: createElement(CustomTemplateEmail, {
      bodyHtml: payload.bodyHtml,
      companyName: payload.companyName ?? "Harly",
    }),
    ...deliveryOptions(row),
  });
  if (!delivered) {
    await markFailed(row.id, "No configured workspace email sender.", database);
    return false;
  }
  await markSent(row.id, delivered, database);
  return true;
}

async function deliverNativeSignatureInvitation(row: OutboxRow, database: typeof db = db): Promise<boolean> {
  const payload = row.payload as { token?: { ciphertext: string; iv: string; tag: string }; recipientEmail?: string; recipientName?: string; documentName?: string; subject?: string; message?: string; expiresAt?: string } | null;
  if (!payload?.token || !payload.recipientEmail || !payload.documentName) {
    await markFailed(row.id, "Invalid native signature invitation payload.", database);
    return false;
  }
  const token = decryptSecret(payload.token);
  const link = `${appBaseUrl()}/sign/${token}`;
  const delivered = await sendRecorded(
    row,
    database,
    {
      to: payload.recipientEmail,
      subject: payload.subject ?? `Please sign: ${payload.documentName}`,
      react: createElement("div", null,
        createElement("p", null, `Hello ${payload.recipientName ?? "there"},`),
        createElement("p", null, payload.message ?? "Please review and sign this document."),
        createElement("p", null, createElement("a", { href: link }, "Review and sign document")),
        createElement("p", null, `This link expires on ${payload.expiresAt ?? "the configured date"}.`),
      ),
      ...deliveryOptions(row),
    },
    row.actorId,
  );
  if (!delivered) { await markFailed(row.id, "Email provider did not accept the native signature invitation.", database); return false; }
  await markSent(row.id, delivered, database);
  return true;
}

async function deliverNativeSignatureOtp(row: OutboxRow, database: typeof db = db): Promise<boolean> {
  const payload = row.payload as { code?: { ciphertext: string; iv: string; tag: string }; recipientEmail?: string; recipientName?: string } | null;
  if (!payload?.code || !payload.recipientEmail) { await markFailed(row.id, "Invalid native signature OTP payload.", database); return false; }
  const code = decryptSecret(payload.code);
  const delivered = await sendRecorded(row, database, {
    to: payload.recipientEmail,
    subject: "Your Harly Signature verification code",
    react: createElement("div", null,
      createElement("p", null, `Hello ${payload.recipientName ?? "there"},`),
      createElement("p", null, "Use this one-time code to continue signing:"),
      createElement("p", { style: { fontSize: "24px", fontWeight: 700, letterSpacing: "0.2em" } }, code),
      createElement("p", null, "This code expires in 10 minutes and can only be used once."),
    ),
    ...deliveryOptions(row),
  });
  if (!delivered) { await markFailed(row.id, "Email provider did not accept the native signature OTP.", database); return false; }
  await markSent(row.id, delivered, database);
  return true;
}

/** Insert a durable outbox row and return its id. The caller is expected to
 *  invoke `processEmailOutbox({ ids })` to attempt immediate delivery; any row
 *  left `pending`/`failed` is retried by the scheduler (F4-03). */
export async function enqueueEmailOutbox(
  workspaceId: string,
  kind: string,
  payload: Record<string, unknown>,
  dedupeKey?: string,
  actorId?: string,
  database: typeof db = db,
  options?: EnqueueOptions,
): Promise<string> {
  const resolvedDedupeKey =
    dedupeKey ??
    createHash("sha256")
      .update(`${kind}:${JSON.stringify(payload)}`)
      .digest("hex");
  const [row] = await database
    .insert(emailOutbox)
    .values({
      workspaceId,
      kind,
      payload,
      dedupeKey: resolvedDedupeKey,
      actorId: actorId ?? null,
    })
    .onConflictDoNothing({
      target: [emailOutbox.workspaceId, emailOutbox.dedupeKey],
    })
    .returning({ id: emailOutbox.id });
  if (row) return row.id;
  const [existing] = await database
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.workspaceId, workspaceId),
        eq(emailOutbox.dedupeKey, resolvedDedupeKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Email outbox deduplication failed.");
  if (options?.resetTerminal) {
    // An explicit send after a terminal outcome starts a fresh attempt. A row
    // the provider accepted is never reset: resetting it could send it twice.
    await database
      .update(emailOutbox)
      .set({
        status: "pending",
        attempts: 0,
        nextRetryAt: null,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailOutbox.id, existing.id),
          inArray(emailOutbox.status, ["failed", "cancelled"]),
          isNull(emailOutbox.providerMessageId),
          isNull(emailOutbox.sentAt),
          // An unknown outcome may already be delivered: only an operator's explicit retry may send it again.
          sql`coalesce(${emailOutbox.lastError}, '') not like ${`${UNKNOWN_OUTCOME_PREFIX}%`}`,
        ),
      );
  }
  return existing.id;
}

export type EnqueueOptions = {
  /**
   * Set by an explicit user send. A conflicting row that ended `failed` or
   * `cancelled` is reset and sent again instead of being returned as-is.
   */
  resetTerminal?: boolean;
};

function deliveryOptions(row: OutboxRow) {
  return {
    messageId: outboxMessageId(row.id),
    idempotencyKey: row.id,
    headers: { "X-Harly-Outbox-Id": row.id },
  };
}

/**
 * Best-effort: record a candidate-facing outbound email in the canonical
 * conversation model (mail_threads/mail_messages) so it appears in the Inbox
 * and the candidate timeline, and so inbound replies thread onto it. Never
 * throws — the email was already sent; the conversation record is secondary
 * and must not roll back a successful delivery.
 */
async function recordOutboundConversation(input: {
  workspaceId: string;
  toEmail: string;
  subject: string;
  textBody: string;
  outboxRowId: string;
  candidateId?: string | null;
  applicationId?: string | null;
}): Promise<void> {
  try {
    let candidateId = input.candidateId ?? null;
    if (!candidateId) {
      const [found] = await db
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          and(
            eq(candidates.workspaceId, input.workspaceId),
            eq(candidates.email, input.toEmail),
            isNull(candidates.deletedAt),
          ),
        )
        .limit(1);
      candidateId = found?.id ?? null;
    }
    if (!candidateId) return; // No candidate to thread onto; skip silently.

    const config = await getWorkspaceEmailConfig(input.workspaceId);
    const fromEmail = config?.from ?? process.env.EMAIL_FROM ?? "noreply@harly.local";
    await insertCanonicalMessage({
      workspaceId: input.workspaceId,
      source: "provider",
      mailboxId: null,
      subject: input.subject,
      participantEmail: input.toEmail,
      candidateId,
      applicationId: input.applicationId ?? null,
      direction: "outbound",
      fromEmail,
      toEmails: [input.toEmail],
      textBody: input.textBody,
      messageId: outboxMessageId(input.outboxRowId),
      receivedAt: new Date(),
      readAt: new Date(),
    });
  } catch (error) {
    log.warn(
      { error, outboxRowId: input.outboxRowId },
      "failed to record outbound conversation in canonical model",
    );
  }
}

async function hasActiveCandidateRecipient(
  workspaceId: string,
  email: string,
): Promise<boolean> {
  const [candidate] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.workspaceId, workspaceId),
        eq(candidates.email, email.toLowerCase()),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(candidate);
}

async function deliverOffer(row: OutboxRow, database: typeof db = db): Promise<boolean | "skipped"> {
  const payload = row.payload as {
    offerId?: string;
    terms?: unknown;
  } | null;
  const offerId = payload?.offerId;
  if (!offerId) {
    await markFailed(row.id, "Missing offerId in payload.", database);
    return false;
  }

  const [offer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.workspaceId, row.workspaceId), eq(offers.id, offerId)))
    .limit(1);

  // Idempotency: if the offer was already extended, just acknowledge the row.
  if (offer?.status === "sent") {
    await db
      .update(emailOutbox)
      .set({
        status: "sent",
        sentAt: new Date(),
        nextRetryAt: null,
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(emailOutbox.id, row.id));
    return true;
  }

  if (!offer || offer.status !== "draft") {
    await markFailed(
      row.id,
      `Offer is not deliverable (status: ${offer?.status ?? "missing"}).`,
      database,
    );
    return false;
  }

  const frozenTerms: OfferTermsSnapshot | null = payload?.terms
    ? parseOfferTermsSnapshot(payload.terms)
    : snapshotOfferTerms(offer);
  if (!frozenTerms || !offerMatchesTerms(offer, frozenTerms)) {
    await markStale(
      row.id,
      "Offer terms changed after the send request; no email was delivered.",
      database,
    );
    return false;
  }

  const [application] = await db
    .select({
      status: applications.status,
      candidateId: applications.candidateId,
      jobId: applications.jobId,
    })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, row.workspaceId),
        eq(applications.id, offer.applicationId),
      ),
    )
    .limit(1);
  if (
    !application ||
    application.status !== "active" ||
    application.candidateId !== offer.candidateId ||
    application.jobId !== offer.jobId
  ) {
    await markFailed(row.id, "The application is no longer active.", database);
    return false;
  }

  const [recipient] = await db
    .select({
      email: candidates.email,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      companyName: organization.name,
    })
    .from(candidates)
    .innerJoin(organization, eq(organization.id, candidates.workspaceId))
    .where(
      and(
        eq(candidates.id, offer.candidateId),
        eq(candidates.workspaceId, row.workspaceId),
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);

  if (!recipient?.email) {
    await markFailed(row.id, "The candidate does not have an email address.", database);
    return false;
  }
  if (isSampleEmailAddress(recipient.email)) {
    return skipAsSampleRecipient(row, database);
  }

  let delivered: Awaited<ReturnType<typeof sendWorkspaceEmail>> = false;
  let offerSubject = "";
  const startDate = formatOfferDate(frozenTerms.startDate);
  const expiresAt = formatOfferDate(frozenTerms.expiresAt);
  const salary = formatOfferSalary(
    frozenTerms.salaryAmount,
    frozenTerms.currency,
    frozenTerms.salaryPeriod,
  );
  const offerUrl = `${appBaseUrl().replace(/\/$/, "")}/portal/applications/${encodeURIComponent(offer.applicationId)}`;
  try {
    const branding = await getWorkspaceEmailBranding(row.workspaceId);
    // DocuSeal submissions already contain the selected ATS documents. Do not
    // leak a second copy through the notification email or exceed Resend's
    // attachment limits.
    const offerDocuments = offer.esignSubmissionId
      ? []
      : await db
          .select({
            name: documents.name,
            mimeType: documents.mimeType,
            storageKey: documents.storageKey,
          })
          .from(documentAssociations)
          .innerJoin(documents, eq(documents.id, documentAssociations.documentId))
          .where(
            and(
              eq(documentAssociations.workspaceId, row.workspaceId),
              eq(documentAssociations.targetType, "offer"),
              eq(documentAssociations.targetId, offer.id),
              eq(documents.status, "active"),
            ),
          )
          .limit(40);
    const attachments = [] as Array<{ filename: string; content: Buffer; contentType: string }>;
    let attachmentBytes = 0;
    for (const document of offerDocuments) {
      const content = await storage.read(document.storageKey);
      attachmentBytes += content.byteLength;
      if (attachmentBytes > 35 * 1024 * 1024) {
        throw new Error("Offer attachments exceed the email provider's 35 MB limit.");
      }
      attachments.push({ filename: document.name, content, contentType: document.mimeType });
    }

    const custom = await renderActiveEmailTemplate(row.workspaceId, "offer", {
      candidate_first_name: recipient.firstName,
      candidate_last_name: recipient.lastName,
      candidate_full_name: `${recipient.firstName} ${recipient.lastName}`,
      job_title: frozenTerms.title,
      company_name: recipient.companyName,
      offer_salary: salary ?? undefined,
      offer_expiry: expiresAt ?? undefined,
      offer_start_date: startDate ?? undefined,
      offer_url: offerUrl,
    });

    const offerSubjectValue = custom
      ? custom.subject
      : offerExtendedSubject({
          companyName: recipient.companyName,
          jobTitle: frozenTerms.title,
        });
    offerSubject = offerSubjectValue;

    delivered = await sendRecorded(
      row,
      database,
      custom
        ? {
            to: recipient.email,
            subject: offerSubject,
            react: createElement(CustomTemplateEmail, {
              bodyHtml: custom.bodyHtml,
              companyName: recipient.companyName,
              companyLogoUrl: branding.logoUrl ?? undefined,
              hideBranding: branding.hideBranding,
              accentColor: branding.primaryColor ?? undefined,
              socialLinks: branding.socialLinks,
            }),
            ...deliveryOptions(row),
            attachments,
          }
        : {
            to: recipient.email,
            subject: offerSubject,
            react: createElement(OfferExtended, {
              candidateName: recipient.firstName,
              companyName: recipient.companyName,
              companyLogoUrl: branding.logoUrl ?? undefined,
              hideBranding: branding.hideBranding,
              accentColor: branding.primaryColor ?? undefined,
              socialLinks: branding.socialLinks,
              jobTitle: frozenTerms.title,
              salary,
              startDate,
              expiresAt,
              equity: frozenTerms.equity ?? undefined,
              offerUrl,
            }),
            ...deliveryOptions(row),
            attachments,
          },
      row.actorId,
    );
  } catch (error) {
    log.error(error, "offer email render/send failed");
  }

  if (!delivered) {
    await markFailed(row.id, "Email provider did not accept the offer.", database);
    return false;
  }

  let offerTransitioned = false;
  await db.transaction(async (tx) => {
    const [transitioned] = await tx
      .update(offers)
      .set({ status: "sent", updatedAt: new Date() })
      .where(
        and(
          eq(offers.workspaceId, row.workspaceId),
          eq(offers.id, offer.id),
          eq(offers.status, "draft"),
          eq(offers.title, frozenTerms.title),
          frozenTerms.salaryAmount === null
            ? isNull(offers.salaryAmount)
            : eq(offers.salaryAmount, frozenTerms.salaryAmount),
          frozenTerms.currency === null
            ? isNull(offers.currency)
            : eq(offers.currency, frozenTerms.currency),
          frozenTerms.salaryPeriod === null
            ? isNull(offers.salaryPeriod)
            : eq(offers.salaryPeriod, frozenTerms.salaryPeriod),
          frozenTerms.equity === null
            ? isNull(offers.equity)
            : eq(offers.equity, frozenTerms.equity),
          frozenTerms.startDate === null
            ? isNull(offers.startDate)
            : eq(offers.startDate, frozenTerms.startDate),
          frozenTerms.expiresAt === null
            ? isNull(offers.expiresAt)
            : eq(offers.expiresAt, frozenTerms.expiresAt),
          frozenTerms.notes === null
            ? isNull(offers.notes)
            : eq(offers.notes, frozenTerms.notes),
          // Revalidate after the provider accepted the email. A withdrawal or
          // terminal application decision must never be overwritten by this
          // worker's late success callback.
          exists(
            db
              .select({ id: applications.id })
              .from(applications)
              .where(
                and(
                  eq(applications.workspaceId, row.workspaceId),
                  eq(applications.id, offer.applicationId),
                  eq(applications.status, "active"),
                ),
              ),
          ),
        ),
      )
      .returning({ id: offers.id });
    offerTransitioned = Boolean(transitioned);
    await tx
      .update(emailOutbox)
      .set({
        status: "sent",
        sentAt: new Date(),
        nextRetryAt: null,
        lockedAt: null,
        lockedBy: null,
        providerMessageId: delivered.messageId ?? outboxMessageId(row.id),
      })
      .where(eq(emailOutbox.id, row.id));
  });

  if (!offerTransitioned) {
    log.warn(
      { offerId: offer.id, applicationId: offer.applicationId },
      "offer email delivered after offer/application became non-actionable",
    );
    return true;
  }

  if (row.actorId) {
    await db.insert(activityEvents).values({
      workspaceId: row.workspaceId,
      actorId: row.actorId,
      entityType: "application",
      entityId: offer.applicationId,
      type: "offer.sent",
      metadata: { title: offer.title, outboxId: row.id },
    });
  }

  await recordOutboundConversation({
    workspaceId: row.workspaceId,
    toEmail: recipient.email,
    subject: offerSubject,
    outboxRowId: row.id,
    candidateId: offer.candidateId,
    applicationId: offer.applicationId,
    textBody: `Offer extended for ${frozenTerms.title} at ${recipient.companyName}.${startDate ? `\nStart date: ${startDate}.` : ""}${expiresAt ? `\nExpires: ${expiresAt}.` : ""}${salary ? `\nSalary: ${salary}.` : ""}\nReview and sign: ${offerUrl}`,
  });

  return true;
}

function appBaseUrl(): string {
  return getHarlyPublicOrigin();
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function deliverApplicationReceived(
  row: OutboxRow,
  variant: "candidate" | "recruiter",
  database: typeof db = db,
): Promise<boolean> {
  const p = row.payload as {
    candidateEmail?: string;
    ownerEmail?: string;
    candidateFirstName?: string;
    candidateName?: string;
    jobTitle?: string;
    workspaceName?: string;
    workspaceSlug?: string;
    applicationId?: string;
    portalEnabled?: boolean;
  } | null;

  const branding = await getWorkspaceEmailBranding(row.workspaceId);
  let delivered: Awaited<ReturnType<typeof sendWorkspaceEmail>> = false;
  let candidateSubject: string | null = null;

  if (variant === "candidate") {
    if (!p?.candidateEmail) {
      await markFailed(row.id, "Missing candidateEmail in payload.", database);
      return false;
    }
    if (!(await hasActiveCandidateRecipient(row.workspaceId, p.candidateEmail))) {
      await markFailed(row.id, "The candidate is no longer active.", database);
      return false;
    }
    const jobBoardUrl = `${appBaseUrl()}/board/${p.workspaceSlug ?? ""}`;
    const portalUrl = p.portalEnabled && p.applicationId
      ? `${appBaseUrl()}/portal/applications/${p.applicationId}`
      : undefined;
    const profileUrl = p.portalEnabled ? `${appBaseUrl()}/portal/profile` : undefined;
    candidateSubject = applicationReceivedCandidateSubject({
      jobTitle: p.jobTitle ?? "",
      companyName: p.workspaceName ?? "",
    });
    delivered = await sendRecorded(row, database, {
      to: p.candidateEmail,
      subject: candidateSubject,
      react: createElement(ApplicationReceivedCandidate, {
        candidateName: p.candidateFirstName ?? "",
        jobTitle: p.jobTitle ?? "",
        companyName: p.workspaceName ?? "",
        companyLogoUrl: branding.logoUrl ?? undefined,
        hideBranding: branding.hideBranding,
        accentColor: branding.primaryColor ?? undefined,
        socialLinks: branding.socialLinks,
        jobBoardUrl,
        portalUrl,
        profileUrl,
      }),
      ...deliveryOptions(row),
    });
    if (!delivered) {
      await markFailed(
        row.id,
        "Email provider did not accept the application confirmation.",
        database,
      );
      return false;
    }
  } else {
    if (!p?.ownerEmail) {
      await markFailed(row.id, "Missing ownerEmail in payload.", database);
      return false;
    }
    if (p.candidateEmail && !(await hasActiveCandidateRecipient(row.workspaceId, p.candidateEmail))) {
      await markFailed(row.id, "The candidate is no longer active.", database);
      return false;
    }
    const dashboardUrl = `${appBaseUrl()}/dashboard/candidates`;
    delivered = await sendRecorded(row, database, {
      to: p.ownerEmail,
      subject: applicationReceivedRecruiterSubject({
        candidateName: p.candidateName ?? "",
        jobTitle: p.jobTitle ?? "",
      }),
      react: createElement(ApplicationReceivedRecruiter, {
        candidateName: p.candidateName ?? "",
        candidateEmail: p.candidateEmail ?? "",
        jobTitle: p.jobTitle ?? "",
        dashboardUrl,
        branding,
      }),
      ...deliveryOptions(row),
    });
    if (!delivered) {
      await markFailed(
        row.id,
        "Email provider did not accept the recruiter notification.",
        database,
      );
      return false;
    }
  }

  await markSent(row.id, delivered, database);
  if (variant === "candidate" && candidateSubject && p?.candidateEmail) {
    await recordOutboundConversation({
      workspaceId: row.workspaceId,
      toEmail: p.candidateEmail,
      subject: candidateSubject,
      outboxRowId: row.id,
      textBody: `Application received for ${p.jobTitle ?? "the role"} at ${p.workspaceName ?? "the company"}.`,
    });
  }
  return true;
}

async function deliverPipelineEmail(row: OutboxRow, database: typeof db = db): Promise<boolean> {
  const p = row.payload as {
    candidateEmail?: string;
    candidateName?: string;
    applicationId?: string;
    jobTitle?: string;
    stageName?: string;
    workspaceName?: string;
    type?: "stage" | "rejected";
  } | null;

  if (!p?.candidateEmail) {
    await markFailed(row.id, "Missing candidateEmail in payload.", database);
    return false;
  }
  if (!(await hasActiveCandidateRecipient(row.workspaceId, p.candidateEmail))) {
    await markFailed(row.id, "The candidate is no longer active.", database);
    return false;
  }

  const branding = await getWorkspaceEmailBranding(row.workspaceId);
  const { first, last } = splitName(p.candidateName ?? "");
  const isStage = p.type === "stage";
  const templateType = isStage ? "stage_change" : "rejection";

  const custom = await renderActiveEmailTemplate(
    row.workspaceId,
    templateType,
    {
      candidate_first_name: first,
      candidate_last_name: last,
      candidate_full_name: p.candidateName ?? "",
      job_title: p.jobTitle ?? "",
      stage_name: isStage ? p.stageName : undefined,
      company_name: p.workspaceName ?? "",
    },
  );

  const pipelineSubject = custom
    ? custom.subject
    : isStage
      ? candidateStageUpdateSubject({
          jobTitle: p.jobTitle ?? "",
          stageName: p.stageName ?? "",
        })
      : candidateRejectedSubject({
          jobTitle: p.jobTitle ?? "",
          companyName: p.workspaceName ?? "",
        });

  let delivered: Awaited<ReturnType<typeof sendWorkspaceEmail>> = false;
  try {
    if (custom) {
      delivered = await sendRecorded(
        row,
        database,
        {
          to: p.candidateEmail,
          subject: pipelineSubject,
          react: createElement(CustomTemplateEmail, {
            bodyHtml: custom.bodyHtml,
            companyName: p.workspaceName ?? "",
            companyLogoUrl: branding.logoUrl ?? undefined,
            hideBranding: branding.hideBranding,
            accentColor: branding.primaryColor ?? undefined,
            socialLinks: branding.socialLinks,
          }),
          ...deliveryOptions(row),
        },
        row.actorId,
      );
    } else if (isStage) {
      delivered = await sendRecorded(
        row,
        database,
        {
          to: p.candidateEmail,
          subject: pipelineSubject,
          react: createElement(CandidateStageUpdate, {
            candidateName: p.candidateName ?? "",
            jobTitle: p.jobTitle ?? "",
            stageName: p.stageName ?? "",
            companyName: p.workspaceName ?? "",
            companyLogoUrl: branding.logoUrl ?? undefined,
            hideBranding: branding.hideBranding,
            accentColor: branding.primaryColor ?? undefined,
            socialLinks: branding.socialLinks,
            portalUrl: p.applicationId
              ? `${appBaseUrl()}/portal/applications/${p.applicationId}`
              : undefined,
          }),
          ...deliveryOptions(row),
        },
        row.actorId,
      );
    } else {
      delivered = await sendRecorded(
        row,
        database,
        {
          to: p.candidateEmail,
          subject: pipelineSubject,
          react: createElement(CandidateRejected, {
            candidateName: p.candidateName ?? "",
            jobTitle: p.jobTitle ?? "",
            companyName: p.workspaceName ?? "",
            companyLogoUrl: branding.logoUrl ?? undefined,
            hideBranding: branding.hideBranding,
            accentColor: branding.primaryColor ?? undefined,
            socialLinks: branding.socialLinks,
            portalUrl: p.applicationId
              ? `${appBaseUrl()}/portal/applications/${p.applicationId}`
              : undefined,
          }),
          ...deliveryOptions(row),
        },
        row.actorId,
      );
    }
  } catch (error) {
    log.error(error, "pipeline email render/send failed");
  }

  if (!delivered) {
    await markFailed(
      row.id,
      "Email provider did not accept the pipeline email.",
      database,
    );
    return false;
  }

  await markSent(row.id, delivered, database);
  await recordOutboundConversation({
    workspaceId: row.workspaceId,
    toEmail: p.candidateEmail,
    subject: pipelineSubject,
    outboxRowId: row.id,
    textBody: isStage
      ? `Application update for ${p.jobTitle ?? "the role"}: now in ${p.stageName ?? "a new stage"}.`
      : `Application update for ${p.jobTitle ?? "the role"} at ${p.workspaceName ?? "the company"}: not moving forward.`,
  });
  return true;
}

type InterviewEmailPayload = {
  candidateEmail?: string;
  candidateName?: string;
  companyName?: string;
  jobTitle?: string;
  interviewType?: string;
  scheduledAt?: string;
  /** IANA zone the interview was scheduled in. Missing on older payloads. */
  timeZone?: string | null;
  mode?: string;
  location?: string;
  durationMins?: number;
  notes?: string;
  replyTo?: string | null;
  interviewerName?: string;
};

async function deliverInterviewEmail(row: OutboxRow, database: typeof db = db): Promise<boolean> {
  const payload = row.payload as InterviewEmailPayload | null;
  if (!payload?.candidateEmail || !payload.companyName || !payload.jobTitle) {
    await markFailed(row.id, "Missing interview email recipient or context.", database);
    return false;
  }
  if (!(await hasActiveCandidateRecipient(row.workspaceId, payload.candidateEmail))) {
    await markFailed(row.id, "The candidate is no longer active.", database);
    return false;
  }

  const when = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    await markFailed(row.id, "Missing or invalid interview schedule.", database);
    return false;
  }

  const timeZone = resolveInterviewTimeZone(payload.timeZone);
  const whenLabel = formatInterviewWhen(when, timeZone);
  const branding = await getWorkspaceEmailBranding(row.workspaceId);
  const [firstName, ...lastName] = (payload.candidateName ?? "")
    .trim()
    .split(/\s+/);
  const common = {
    candidateName: firstName ?? "",
    companyName: payload.companyName,
    companyLogoUrl: branding.logoUrl ?? undefined,
    hideBranding: branding.hideBranding,
    accentColor: branding.primaryColor ?? undefined,
    socialLinks: branding.socialLinks,
    jobTitle: payload.jobTitle,
  };
  const duration = payload.durationMins
    ? `${payload.durationMins} min`
    : undefined;
  let delivered: Awaited<ReturnType<typeof sendWorkspaceEmail>> = false;
  let interviewSubject = "";

  try {
    if (row.kind === "interview.scheduled") {
      const custom = await renderActiveEmailTemplate(
        row.workspaceId,
        "interview_invite",
        {
          candidate_first_name: firstName ?? "",
          candidate_last_name: lastName.join(" "),
          candidate_full_name: payload.candidateName ?? "",
          company_name: payload.companyName,
          job_title: payload.jobTitle,
          interview_date: whenLabel,
          interview_time: whenLabel,
          interview_location: payload.location,
          interview_duration: duration,
          interviewer_name: payload.interviewerName,
        },
      );
      interviewSubject = custom
        ? custom.subject
        : interviewScheduledSubject({
            companyName: payload.companyName,
            jobTitle: payload.jobTitle,
          });
      delivered = await sendRecorded(
        row,
        database,
        custom
          ? {
              to: payload.candidateEmail,
              subject: interviewSubject,
              replyTo: payload.replyTo ?? undefined,
              react: createElement(CustomTemplateEmail, {
                bodyHtml: custom.bodyHtml,
                companyName: payload.companyName,
                companyLogoUrl: branding.logoUrl ?? undefined,
                hideBranding: branding.hideBranding,
                accentColor: branding.primaryColor ?? undefined,
                socialLinks: branding.socialLinks,
              }),
              ...deliveryOptions(row),
            }
          : {
              to: payload.candidateEmail,
              subject: interviewSubject,
              replyTo: payload.replyTo ?? undefined,
              react: createElement(InterviewScheduled, {
                ...common,
                interviewType: payload.interviewType ?? "Interview",
                when: whenLabel,
                mode: payload.mode ?? "Video call",
                location: payload.location,
                duration,
                startIso: when.toISOString(),
                durationMins: payload.durationMins,
                notes: payload.notes,
              }),
              ...deliveryOptions(row),
            },
        row.actorId,
      );
    } else if (row.kind === "interview.rescheduled") {
      interviewSubject = interviewRescheduledSubject({
        companyName: payload.companyName,
        jobTitle: payload.jobTitle,
      });
      delivered = await sendRecorded(
        row,
        database,
        {
          to: payload.candidateEmail,
          subject: interviewSubject,
          replyTo: payload.replyTo ?? undefined,
          react: createElement(InterviewRescheduled, {
            ...common,
            interviewType: payload.interviewType ?? "Interview",
            when: whenLabel,
            mode: payload.mode ?? "Video call",
            location: payload.location,
            duration,
            startIso: when.toISOString(),
            durationMins: payload.durationMins,
          }),
          ...deliveryOptions(row),
        },
        row.actorId,
      );
    } else {
      interviewSubject = interviewCanceledSubject({
        companyName: payload.companyName,
        jobTitle: payload.jobTitle,
      });
      delivered = await sendRecorded(
        row,
        database,
        {
          to: payload.candidateEmail,
          subject: interviewSubject,
          replyTo: payload.replyTo ?? undefined,
          react: createElement(InterviewCanceled, {
            ...common,
            interviewType: payload.interviewType ?? "Interview",
            when: whenLabel,
          }),
          ...deliveryOptions(row),
        },
        row.actorId,
      );
    }
  } catch (error) {
    log.error(error, "interview email render/send failed");
  }

  if (!delivered) {
    await markFailed(
      row.id,
      "Email provider did not accept the interview email.",
      database,
    );
    return false;
  }
  await markSent(row.id, delivered, database);
  const summary =
    row.kind === "interview.scheduled"
      ? `Interview scheduled — ${whenLabel}.\nType: ${payload.interviewType ?? "Interview"}\nMode: ${payload.mode ?? "Video call"}${payload.location ? `\nLocation: ${payload.location}` : ""}`
      : row.kind === "interview.rescheduled"
        ? `Interview rescheduled — ${whenLabel}.`
        : `Interview canceled — ${whenLabel}.`;
  await recordOutboundConversation({
    workspaceId: row.workspaceId,
    toEmail: payload.candidateEmail,
    subject: interviewSubject,
    outboxRowId: row.id,
    textBody: summary,
  });
  return true;
}

async function deliverOfferWithdrawn(row: OutboxRow, database: typeof db = db): Promise<boolean> {
  const payload = row.payload as {
    candidateEmail?: string;
    candidateName?: string;
    companyName?: string;
    jobTitle?: string;
  } | null;
  if (!payload?.candidateEmail || !payload.companyName || !payload.jobTitle) {
    await markFailed(
      row.id,
      "Missing withdrawn-offer email recipient or context.",
      database,
    );
    return false;
  }
  if (!(await hasActiveCandidateRecipient(row.workspaceId, payload.candidateEmail))) {
    await markFailed(row.id, "The candidate is no longer active.", database);
    return false;
  }
  const branding = await getWorkspaceEmailBranding(row.workspaceId);
  const withdrawnSubject = offerWithdrawnSubject({
    companyName: payload.companyName,
    jobTitle: payload.jobTitle,
  });
  const delivered = await sendRecorded(
    row,
    database,
    {
      to: payload.candidateEmail,
      subject: withdrawnSubject,
      react: createElement(OfferWithdrawn, {
        candidateName: payload.candidateName ?? "",
        companyName: payload.companyName,
        companyLogoUrl: branding.logoUrl ?? undefined,
        hideBranding: branding.hideBranding,
        accentColor: branding.primaryColor ?? undefined,
        socialLinks: branding.socialLinks,
        jobTitle: payload.jobTitle,
      }),
      ...deliveryOptions(row),
    },
    row.actorId,
  );
  if (!delivered) {
    await markFailed(
      row.id,
      "Email provider did not accept the withdrawn-offer email.",
      database,
    );
    return false;
  }
  await markSent(row.id, delivered, database);
  await recordOutboundConversation({
    workspaceId: row.workspaceId,
    toEmail: payload.candidateEmail,
    subject: withdrawnSubject,
    outboxRowId: row.id,
    textBody: `The offer for ${payload.jobTitle} at ${payload.companyName} has been withdrawn.`,
  });
  return true;
}

async function markSent(
  id: string,
  result: Exclude<Awaited<ReturnType<typeof sendWorkspaceEmail>>, false>,
  database: typeof db = db,
) {
  await database
    .update(emailOutbox)
    .set({
      status: "sent",
      sentAt: new Date(),
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      providerMessageId: result.messageId ?? outboxMessageId(id),
    })
    .where(eq(emailOutbox.id, id));
}

/**
 * Record a failed attempt. `attempts` was already incremented when the row was
 * claimed, so this only decides between backoff and a terminal failure.
 */
async function markFailed(id: string, message: string, database: typeof db = db) {
  // A row the provider accepted, or whose outcome is unknown, is never made retryable here.
  if (acceptedInFlight.has(id) || unknownOutcomeInFlight.has(id)) return;
  await database
    .update(emailOutbox)
    .set({
      lastError: sanitizeDeliveryError(message),
      nextRetryAt: sql`CASE
        WHEN ${emailOutbox.attempts} >= ${MAX_ATTEMPTS} THEN NULL
        ELSE now() + (${emailOutbox.attempts} * interval '1 minute')
      END`,
      status: sql`CASE
        WHEN ${emailOutbox.attempts} >= ${MAX_ATTEMPTS} THEN 'failed'::text
        ELSE 'pending'::text
      END`,
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(emailOutbox.id, id));
}

async function markStale(id: string, message: string, database: typeof db = db) {
  await database
    .update(emailOutbox)
    .set({
      status: "failed",
      lastError: sanitizeDeliveryError(message),
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(emailOutbox.id, id));
}
