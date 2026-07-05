import { Resend } from "resend";

import type { CanonicalInboundEmail, InboundEmailAdapter } from "./types";

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
  ctx: { apiKey?: string },
): Promise<CanonicalInboundEmail> {
  if (!ctx.apiKey) {
    throw new Error("Resend inbound requires an API key to fetch the email body.");
  }

  const payload = JSON.parse(rawBody) as {
    type: string;
    data: { email_id: string };
  };

  if (payload.type !== "email.received") {
    throw new Error(`Unexpected Resend webhook event: ${payload.type}`);
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
      if (attachmentError || !signed) return null;

      const response = await fetch(signed.download_url);
      if (!response.ok) return null;

      return {
        filename: attachment.filename ?? signed.filename ?? "attachment",
        contentType: attachment.content_type,
        content: Buffer.from(await response.arrayBuffer()),
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
