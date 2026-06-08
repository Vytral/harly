import type React from "react";

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: React.ReactElement;
};

export type EmailSender = {
  send(options: SendEmailOptions): Promise<void>;
};

export function createEmailSender(): EmailSender | null {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  const from = process.env.EMAIL_FROM ?? "Harly <noreply@harly.dev>";

  return {
    async send({ to, subject, react }) {
      const [{ render }, { Resend }] = await Promise.all([
        import("@react-email/render"),
        import("resend"),
      ]);
      const resend = new Resend(apiKey);
      const html = await render(react);

      await resend.emails.send({ from, to, subject, html });
    },
  };
}
