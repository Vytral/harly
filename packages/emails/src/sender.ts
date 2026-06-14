import type React from "react";

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: React.ReactElement;
};

export type EmailSender = {
  send(options: SendEmailOptions): Promise<void>;
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
    async send({ to, subject, react }) {
      const [{ render }, { Resend }] = await Promise.all([
        import("@react-email/render"),
        import("resend"),
      ]);
      const resend = new Resend(config.apiKey);
      const html = await render(react);

      await resend.emails.send({ from: config.from, to, subject, html });
    },
  };
}

function createSmtpSender(config: SmtpProviderConfig): EmailSender {
  async function transporter() {
    const { default: nodemailer } = await import("nodemailer");

    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  return {
    async send({ to, subject, react }) {
      const [{ render }, transport] = await Promise.all([
        import("@react-email/render"),
        transporter(),
      ]);
      const html = await render(react);

      await transport.sendMail({ from: config.from, to, subject, html });
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
