import type React from "react";

import { createEmailSender } from "@harly/emails";

export const emailSender = createEmailSender();

export async function sendEmail(options: {
  to: string;
  subject: string;
  react: React.ReactElement;
}): Promise<void> {
  if (!emailSender) {
    return;
  }

  try {
    await emailSender.send(options);
  } catch (error) {
    console.error("[Harly] Failed to send email:", error);
  }
}
