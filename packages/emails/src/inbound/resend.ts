import { Resend } from "resend";

import {
  InboundPayloadError,
  type CanonicalInboundEmail,
  type InboundEmailAdapter,
  type InboundParseContext,
} from "./types";

const MAX_INBOUND_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function readAttachmentBody(response: Response): Promise<Buffer | null> {
  if (!response.ok) return null;

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INBOUND_ATTACHMENT_BYTES) {
    return null;
  }

  if (!response.body) {
    const body = Buffer.from(await response.arrayBuffer());
    return body.length <= MAX_INBOUND_ATTACHMENT_BYTES ? body : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_INBOUND_ATTACHMENT_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

/**
 * Resend's inbound webhook payload is metadata-only — no body, no
 * attachment bytes. `parse` makes two follow-up API calls per email:
 * `emails.receiving.get()` for the text/html/attachment list, then
 * `receiving.attachments.get()` per attachment to get a signed download
 * URL (the bytes themselves aren't returned inline either). This is the
 * "hard case" the adapter interface is designed around — Postmark resolves
 * synchronously from the webhook payload alone.
 */

function verifySignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  try {
    // Signature verification is pure crypto (HMAC over payload+headers via
    // the webhook secret) — no network call, so any placeholder API key
    // works for the Resend client instance.
    const resend = new Resend("re_placeholder");
    resend.webhooks.verify({
      payload: rawBody,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
    return true;
  } catch {
    return false;
  }
}

async function parse(
  rawBody: string,
  ctx: InboundParseContext,
): Promise<CanonicalInboundEmail> {
  const warn = ctx.warn ?? ((message, meta) => console.warn(message, meta));
  if (!ctx.apiKey) {
    throw new Error("Resend inbound requires an API key to fetch the email body.");
  }

  let payload: { type: string; data: { email_id: string } };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    throw new InboundPayloadError("Resend webhook body is not valid JSON.");
  }

  if (payload.type !== "email.received" || !payload.data?.email_id) {
    throw new InboundPayloadError(`Unexpected Resend webhook event: ${payload.type}`);
  }

  const resend = new Resend(ctx.apiKey);

  const { data: email, error } = await resend.emails.receiving.get(
    payload.data.email_id,
  );
  if (error || !email) {
    throw new Error(error?.message ?? "Failed to fetch Resend inbound email.");
  }

  const attachments = await Promise.all(
    (email.attachments ?? []).map(async (attachment) => {
      const { data: signed, error: attachmentError } =
        await resend.emails.receiving.attachments.get({
          emailId: email.id,
          id: attachment.id,
        });
      const meta = {
        emailId: email.id,
        attachmentId: attachment.id,
        filename: attachment.filename ?? null,
      };
      if (attachmentError || !signed) {
        warn("Inbound attachment skipped: could not get a download URL", {
          ...meta,
          reason: attachmentError?.message ?? "no signed URL",
        });
        return null;
      }

      let content: Buffer | null;
      try {
        content = await readAttachmentBody(await fetch(signed.download_url));
      } catch (error) {
        warn("Inbound attachment skipped: download failed", {
          ...meta,
          reason: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
      if (!content) {
        warn(
          `Inbound attachment skipped: download was refused or larger than ${MAX_INBOUND_ATTACHMENT_BYTES} bytes`,
          meta,
        );
        return null;
      }

      return {
        filename: attachment.filename ?? signed.filename ?? "attachment",
        contentType: attachment.content_type,
        content,
      };
    }),
  );

  return {
    messageId: email.message_id,
    inReplyTo: email.headers?.["in-reply-to"] ?? undefined,
    references: email.headers?.references?.split(/\s+/).filter(Boolean),
    from: email.from,
    to: email.to,
    subject: email.subject,
    textBody: email.text ?? "",
    htmlBody: email.html ?? undefined,
    attachments: attachments.filter((a): a is NonNullable<typeof a> => a !== null),
    receivedAt: new Date(email.created_at),
  };
}

export const resendAdapter: InboundEmailAdapter = {
  provider: "resend",
  verifySignature,
  parse,
};
