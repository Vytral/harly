import type React from "react";

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
  messageId?: string;
  idempotencyKey?: string;
  /** Extra headers, e.g. `X-Harly-Outbox-Id` for SMTP traceability. */
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
};

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendEmailResult = { messageId?: string };

/**
 * The provider may have accepted the message even though the caller never
 * heard back (a socket timed out or reset after the message was handed over).
 * Callers must not resend automatically: the email could arrive twice.
 */
export class DeliveryOutcomeUnknownError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DeliveryOutcomeUnknownError";
  }
}

const AMBIGUOUS_SMTP_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ESOCKET", "EPIPE", "ECONNECTION"]);

/**
 * True when an SMTP failure may have happened after the message was handed
 * over. A server reply with a response code is definitive (the message was
 * rejected), and so is a connection that was refused before anything was sent.
 */
export function isAmbiguousSmtpError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { code, responseCode } = error as { code?: unknown; responseCode?: unknown };
  if (typeof responseCode === "number") return false;
  if (typeof code === "string" && AMBIGUOUS_SMTP_CODES.has(code)) return true;
  return /timed out|timeout|socket (closed|hang up)|connection (closed|reset)/i.test(error.message);
}

export type EmailSender = {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
  /**
   * Cheap connectivity/credentials check that doesn't send mail. Only
   * available for providers that support it (SMTP). Resend has no such
   * endpoint — callers should send a real test email instead.
   */
  verify?(): Promise<void>;
};

export type ResendProviderConfig = {
  provider: "resend";
  apiKey: string;
  from: string;
};

export type SmtpProviderConfig = {
  provider: "smtp";
  from: string;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
};

export type EmailProviderConfig = ResendProviderConfig | SmtpProviderConfig;

function createResendSender(config: ResendProviderConfig): EmailSender {
  return {
    async send({ to, subject, react, replyTo, messageId, idempotencyKey, headers, attachments }) {
      const [{ render }, { Resend }] = await Promise.all([
        import("@react-email/render"),
        import("resend"),
      ]);
      const resend = new Resend(config.apiKey);
      const html = await render(react);

      const result = await resend.emails.send(
        {
          from: config.from,
          to,
          subject,
          html,
          replyTo,
          headers: messageId || headers ? { ...headers, ...(messageId ? { "Message-ID": messageId } : {}) } : undefined,
          attachments: attachments?.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType,
          })),
        },
        idempotencyKey ? { idempotencyKey } : undefined,
      );
      if (result.error) {
        throw new Error(
          `Resend rejected email (${result.error.name}): ${result.error.message}`,
        );
      }
      if (!result.data?.id) {
        throw new Error("Resend accepted the email without returning a message ID.");
      }
      return { messageId: result.data.id };
    },
  };
}

/**
 * Bounded waits. A hung server must not hold a stage move or the outbox worker
 * for nodemailer's default ten minutes.
 */
const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;

function createSmtpSender(config: SmtpProviderConfig): EmailSender {
  async function transporter() {
    const { default: nodemailer } = await import("nodemailer");

    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      ...SMTP_TIMEOUTS,
    });
  }

  return {
    async send({ to, subject, react, replyTo, messageId, headers, attachments }) {
      const [{ render }, transport] = await Promise.all([
        import("@react-email/render"),
        transporter(),
      ]);
      const html = await render(react);

      let info: { messageId?: string };
      try {
        info = await transport.sendMail({
          from: config.from,
          to,
          subject,
          html,
          replyTo,
          messageId,
          headers,
          attachments: attachments?.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType,
          })),
        });
      } catch (error) {
        if (isAmbiguousSmtpError(error)) {
          throw new DeliveryOutcomeUnknownError(
            `SMTP delivery was interrupted after the message was handed over (${(error as Error).message}).`,
            { cause: error },
          );
        }
        throw error;
      }
      return { messageId: info.messageId };
    },
    async verify() {
      const transport = await transporter();
      await transport.verify();
    },
  };
}

function envConfig(): EmailProviderConfig | null {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  const from = process.env.EMAIL_FROM ?? "Harly <noreply@harly.dev>";

  return { provider: "resend", apiKey, from };
}

/**
 * Create an email sender. Pass a workspace's bring-your-own provider config
 * to send on its behalf; omit it to fall back to the platform's
 * `RESEND_API_KEY`/`EMAIL_FROM` env vars. Returns null when neither is
 * available — callers should treat this as "sending is disabled".
 */
export function createEmailSender(
  config?: EmailProviderConfig | null,
): EmailSender | null {
  const resolved = config ?? envConfig();

  if (!resolved) {
    return null;
  }

  return resolved.provider === "resend"
    ? createResendSender(resolved)
    : createSmtpSender(resolved);
}
