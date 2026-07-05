export type CanonicalInboundAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

/**
 * Provider-agnostic shape every inbound email is normalized to before
 * reaching the processor. Adapters are the only code that knows about a
 * given provider's payload format.
 */
export type CanonicalInboundEmail = {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  from: string;
  to: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  attachments: CanonicalInboundAttachment[];
  receivedAt: Date;
};

export type InboundProviderId = "resend" | "postmark";

/**
 * A provider-specific inbound email adapter. `parse` is async because some
 * providers (Resend) only send metadata in the webhook payload and require
 * a follow-up API call to fetch the body/attachments; others (Postmark)
 * resolve synchronously from the payload alone.
 */
export interface InboundEmailAdapter {
  provider: InboundProviderId;
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean;
  parse(
    rawBody: string,
    ctx: { apiKey?: string },
  ): Promise<CanonicalInboundEmail>;
}
