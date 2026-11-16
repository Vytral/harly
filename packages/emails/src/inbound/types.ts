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

/**
 * The webhook payload itself is unusable (malformed JSON, an event type we do
 * not handle). Retrying cannot help, unlike a failed follow-up API call.
 */
export class InboundPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboundPayloadError";
  }
}

export type InboundParseContext = {
  apiKey?: string;
  /** Receives a note whenever an adapter has to leave something out of the email. */
  warn?: (message: string, meta?: Record<string, unknown>) => void;
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
    ctx: InboundParseContext,
  ): Promise<CanonicalInboundEmail>;
}
