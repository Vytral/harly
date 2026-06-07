import type React from "react";

import { createEmailSender } from "@openhire/emails";

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
    console.error("[OpenHire] Failed to send email:", error);
  }
}
