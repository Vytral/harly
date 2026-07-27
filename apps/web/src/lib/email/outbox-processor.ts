import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createElement } from "react";
import { createHash, randomUUID } from "node:crypto";

import {
  activityEvents,
  candidates,
  db,
  documentAssociations,
  documents,
  emailOutbox,
  offers,
  organization,
} from "@harly/db";
import {
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
import { sendWorkspaceEmail } from "@/lib/email";
import { getWorkspaceEmailBranding } from "@/lib/email/branding";
import { getWorkspaceEmailConfig } from "@/lib/email/config";
import { decryptSecret } from "@/lib/crypto";
import { insertCanonicalMessage } from "@/lib/mail/canonical";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

const log = createLogger("email-outbox");

const MAX_ATTEMPTS = 5;

const dateFormatter = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const interviewWhenFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeStyle: "short",
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
};

/**
 * Process pending/failed email_outbox rows. Delivery is idempotent: an offer
 * that is already `sent` marks its outbox row `sent` without re-sending, so a
 * crash between send and bookkeeping can never deliver the same email twice.
 */
export async function processEmailOutbox(opts?: {
  workspaceId?: string;
  limit?: number;
  ids?: string[];
  workerId?: string;
}): Promise<ProcessResult> {
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
  const claimed = (await db.execute(sql`
    with candidates as (
      select "id"
      from "email_outbox"
      where (
        ("status" = 'pending' and ("next_retry_at" is null or "next_retry_at" <= now()))
        or ("status" = 'processing' and "locked_at" < now() - interval '5 minutes')
      )
      ${idsFilter}
      ${workspaceFilter}
      order by "created_at"
      for update skip locked
      limit ${opts?.limit ?? 50}
    )
    update "email_outbox" as queue
    set "status" = 'processing', "locked_at" = now(), "locked_by" = ${workerId}, "updated_at" = now()
    from candidates
    where queue."id" = candidates."id"
    returning queue."id"
  `)) as unknown as Array<{ id: string }>;

  if (claimed.length === 0) return { processed: 0, sent: 0, failed: 0 };
  const rows = await db
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
  for (const row of rows) {
    const ok = await deliverRow(row);
    if (ok) sent += 1;
    else failed += 1;
  }
  return { processed: rows.length, sent, failed };
}

async function deliverRow(row: OutboxRow): Promise<boolean> {
  try {
    switch (row.kind) {
      case "offer.extended":
        return await deliverOffer(row);
      case "application.received.candidate":
        return await deliverApplicationReceived(row, "candidate");
      case "application.received.recruiter":
        return await deliverApplicationReceived(row, "recruiter");
      case "pipeline.stage":
      case "pipeline.rejected":
        return await deliverPipelineEmail(row);
      case "interview.scheduled":
      case "interview.rescheduled":
      case "interview.canceled":
        return await deliverInterviewEmail(row);
      case "offer.withdrawn":
        return await deliverOfferWithdrawn(row);
      case "native.signature.invitation":
        return await deliverNativeSignatureInvitation(row);
      case "native.signature.otp":
        return await deliverNativeSignatureOtp(row);
      case "report.scheduled":
        return await deliverScheduledReport(row);
      default:
        log.warn({ kind: row.kind }, "unknown email_outbox kind");
        await db
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
    await markFailed(
      row.id,
      error instanceof Error ? error.message : "delivery error",
    );
    return false;
  }
}

async function deliverScheduledReport(row: OutboxRow): Promise<boolean> {
  const payload = row.payload as {
    to?: string;
    subject?: string;
    bodyHtml?: string;
    companyName?: string;
  };
  if (!payload.to || !payload.subject || !payload.bodyHtml) {
    await markFailed(row.id, "Scheduled report payload is incomplete.");
    return false;
  }
  const delivered = await sendWorkspaceEmail(row.workspaceId, {
    to: payload.to,
    subject: payload.subject,
    react: createElement(CustomTemplateEmail, {
      bodyHtml: payload.bodyHtml,
      companyName: payload.companyName ?? "Harly",
    }),
    idempotencyKey: row.id,
  });
  if (!delivered) {
    await markFailed(row.id, "No configured workspace email sender.");
    return false;
  }
  await markSent(row.id, delivered);
  return true;
}

async function deliverNativeSignatureInvitation(row: OutboxRow): Promise<boolean> {
  const payload = row.payload as { token?: { ciphertext: string; iv: string; tag: string }; recipientEmail?: string; recipientName?: string; documentName?: string; subject?: string; message?: string; expiresAt?: string } | null;
  if (!payload?.token || !payload.recipientEmail || !payload.documentName) {
    await markFailed(row.id, "Invalid native signature invitation payload.");
    return false;
  }
  const token = decryptSecret(payload.token);
  const link = `${appBaseUrl()}/sign/${token}`;
  const delivered = await sendWorkspaceEmail(
    row.workspaceId,
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
  if (!delivered) { await markFailed(row.id, "Email provider did not accept the native signature invitation."); return false; }
  await markSent(row.id, delivered);
  return true;
}

async function deliverNativeSignatureOtp(row: OutboxRow): Promise<boolean> {
  const payload = row.payload as { code?: { ciphertext: string; iv: string; tag: string }; recipientEmail?: string; recipientName?: string } | null;
  if (!payload?.code || !payload.recipientEmail) { await markFailed(row.id, "Invalid native signature OTP payload."); return false; }
  const code = decryptSecret(payload.code);
  const delivered = await sendWorkspaceEmail(row.workspaceId, {
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
  if (!delivered) { await markFailed(row.id, "Email provider did not accept the native signature OTP."); return false; }
  await markSent(row.id, delivered);
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
): Promise<string> {
  const resolvedDedupeKey =
    dedupeKey ??
    createHash("sha256")
      .update(`${kind}:${JSON.stringify(payload)}`)
      .digest("hex");
  const [row] = await db
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
  const [existing] = await db
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
  return existing.id;
}

function deliveryOptions(row: OutboxRow) {
  return {
    messageId: `<${row.id}@harly.local>`,
    idempotencyKey: row.id,
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
      messageId: `<${input.outboxRowId}@harly.local>`,
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

async function deliverOffer(row: OutboxRow): Promise<boolean> {
  const offerId = (row.payload as { offerId?: string } | null)?.offerId;
  if (!offerId) {
    await markFailed(row.id, "Missing offerId in payload.");
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
    );
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
      ),
    )
    .limit(1);

  if (!recipient?.email) {
    await markFailed(row.id, "The candidate does not have an email address.");
    return false;
  }

  let delivered: Awaited<ReturnType<typeof sendWorkspaceEmail>> = false;
  let offerSubject = "";
  const startDate = formatOfferDate(offer.startDate);
  const expiresAt = formatOfferDate(offer.expiresAt);
  const salary = formatOfferSalary(
    offer.salaryAmount,
    offer.currency,
    offer.salaryPeriod,
  );
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
      job_title: offer.title,
      company_name: recipient.companyName,
      offer_salary: salary ?? undefined,
      offer_expiry: expiresAt ?? undefined,
      offer_start_date: startDate ?? undefined,
    });

    const offerSubjectValue = custom
      ? custom.subject
      : offerExtendedSubject({
          companyName: recipient.companyName,
          jobTitle: offer.title,
        });
    offerSubject = offerSubjectValue;

    delivered = await sendWorkspaceEmail(
      row.workspaceId,
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
              jobTitle: offer.title,
              salary,
              startDate,
              expiresAt,
              equity: offer.equity ?? undefined,
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
    await markFailed(row.id, "Email provider did not accept the offer.");
    return false;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(offers)
      .set({ status: "sent" })
      .where(
        and(eq(offers.workspaceId, row.workspaceId), eq(offers.id, offer.id)),
      );
    await tx
      .update(emailOutbox)
      .set({
        status: "sent",
        sentAt: new Date(),
        nextRetryAt: null,
        lockedAt: null,
        lockedBy: null,
        providerMessageId: delivered.messageId ?? null,
      })
      .where(eq(emailOutbox.id, row.id));
  });

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
    textBody: `Offer extended for ${offer.title} at ${recipient.companyName}.${startDate ? `\nStart date: ${startDate}.` : ""}${expiresAt ? `\nExpires: ${expiresAt}.` : ""}${salary ? `\nSalary: ${salary}.` : ""}`,
  });

  return true;
}

function appBaseUrl(): string {
  return (
    process.env.HARLY_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
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
      await markFailed(row.id, "Missing candidateEmail in payload.");
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
    delivered = await sendWorkspaceEmail(row.workspaceId, {
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
      );
      return false;
    }
  } else {
    if (!p?.ownerEmail) {
      await markFailed(row.id, "Missing ownerEmail in payload.");
      return false;
    }
    const dashboardUrl = `${appBaseUrl()}/dashboard/candidates`;
    delivered = await sendWorkspaceEmail(row.workspaceId, {
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
      );
      return false;
    }
  }

  await markSent(row.id, delivered);
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

async function deliverPipelineEmail(row: OutboxRow): Promise<boolean> {
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
    await markFailed(row.id, "Missing candidateEmail in payload.");
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
      delivered = await sendWorkspaceEmail(
        row.workspaceId,
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
      delivered = await sendWorkspaceEmail(
        row.workspaceId,
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
      delivered = await sendWorkspaceEmail(
        row.workspaceId,
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
    );
    return false;
  }

  await markSent(row.id, delivered);
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
  mode?: string;
  location?: string;
  durationMins?: number;
  notes?: string;
  replyTo?: string | null;
  interviewerName?: string;
};

async function deliverInterviewEmail(row: OutboxRow): Promise<boolean> {
  const payload = row.payload as InterviewEmailPayload | null;
  if (!payload?.candidateEmail || !payload.companyName || !payload.jobTitle) {
    await markFailed(row.id, "Missing interview email recipient or context.");
    return false;
  }

  const when = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    await markFailed(row.id, "Missing or invalid interview schedule.");
    return false;
  }

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
          interview_date: interviewWhenFormatter.format(when),
          interview_time: interviewWhenFormatter.format(when),
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
      delivered = await sendWorkspaceEmail(
        row.workspaceId,
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
                when: interviewWhenFormatter.format(when),
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
      delivered = await sendWorkspaceEmail(
        row.workspaceId,
        {
          to: payload.candidateEmail,
          subject: interviewSubject,
          replyTo: payload.replyTo ?? undefined,
          react: createElement(InterviewRescheduled, {
            ...common,
            interviewType: payload.interviewType ?? "Interview",
            when: interviewWhenFormatter.format(when),
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
      delivered = await sendWorkspaceEmail(
        row.workspaceId,
        {
          to: payload.candidateEmail,
          subject: interviewSubject,
          replyTo: payload.replyTo ?? undefined,
          react: createElement(InterviewCanceled, {
            ...common,
            interviewType: payload.interviewType ?? "Interview",
            when: interviewWhenFormatter.format(when),
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
    );
    return false;
  }
  await markSent(row.id, delivered);
  const whenLabel = interviewWhenFormatter.format(when);
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

async function deliverOfferWithdrawn(row: OutboxRow): Promise<boolean> {
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
    );
    return false;
  }
  const branding = await getWorkspaceEmailBranding(row.workspaceId);
  const withdrawnSubject = offerWithdrawnSubject({
    companyName: payload.companyName,
    jobTitle: payload.jobTitle,
  });
  const delivered = await sendWorkspaceEmail(
    row.workspaceId,
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
    );
    return false;
  }
  await markSent(row.id, delivered);
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
) {
  await db
    .update(emailOutbox)
    .set({
      status: "sent",
      sentAt: new Date(),
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
      providerMessageId: result.messageId ?? null,
    })
    .where(eq(emailOutbox.id, id));
}

async function markFailed(id: string, message: string) {
  await db
    .update(emailOutbox)
    .set({
      attempts: sql`${emailOutbox.attempts} + 1`,
      lastError: message,
      nextRetryAt: sql`CASE
        WHEN ${emailOutbox.attempts} + 1 >= ${MAX_ATTEMPTS} THEN NULL
        ELSE now() + ((${emailOutbox.attempts} + 1) * interval '1 minute')
      END`,
      status: sql`CASE
        WHEN ${emailOutbox.attempts} + 1 >= ${MAX_ATTEMPTS} THEN 'failed'::text
        ELSE 'pending'::text
      END`,
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(emailOutbox.id, id));
}
