"use server";

import { createElement } from "react";
import { WelcomeEmail, welcomeEmailSubject } from "@harly/emails";

import { sendEmail } from "@/lib/email";

export async function sendWelcomeEmailAction(email: string, name: string) {
  await sendEmail({
    to: email,
    subject: welcomeEmailSubject,
    react: createElement(WelcomeEmail, {
      userName: name,
    }),
  });
}
