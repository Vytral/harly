"use server";

import { createElement } from "react";
import { WelcomeEmail, welcomeEmailSubject } from "@harly/emails";

import { sendEmail } from "@/lib/email";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export async function sendWelcomeEmailAction(email: string, name: string) {
  const appUrl = getHarlyPublicOrigin();

  await sendEmail({
    to: email,
    subject: welcomeEmailSubject,
    react: createElement(WelcomeEmail, {
      userName: name,
      dashboardUrl: `${appUrl}/dashboard`,
    }),
  });
}
