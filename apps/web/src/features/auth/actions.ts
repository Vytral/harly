"use server";

import { createElement } from "react";
import { WelcomeEmail, welcomeEmailSubject } from "@harly/emails";

import { sendEmail } from "@/lib/email";

export async function sendWelcomeEmailAction(email: string, name: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  await sendEmail({
    to: email,
    subject: welcomeEmailSubject,
    react: createElement(WelcomeEmail, {
      userName: name,
      dashboardUrl: `${appUrl}/dashboard`,
    }),
  });
}
