import "server-only";

import type React from "react";

import { createEmailSender, type EmailSender } from "@harly/emails";

import { getWorkspaceEmailConfig } from "./config";
import { createLogger } from "@/lib/logger";

const log = createLogger("email");

export const emailSender = createEmailSender();

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: React.ReactElement;
};

/** Send a platform-level email (welcome, invitations...) using the env-configured sender. */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  if (!emailSender) {
    return;
  }

  try {
    await emailSender.send(options);
  } catch (error) {
    log.error(error, "[email] Failed to send email");
  }
}

/**
 * Resolve the email sender for a workspace: its own configured provider
 * (Resend or SMTP) when enabled, falling back to the platform's
 * RESEND_API_KEY/EMAIL_FROM env vars. Returns null when neither is available.
 */
export async function getWorkspaceEmailSender(
  workspaceId: string,
): Promise<EmailSender | null> {
  const config = await getWorkspaceEmailConfig(workspaceId);
  return createEmailSender(config);
}

/**
 * Send an email on behalf of a workspace, using its own provider when
 * configured or the platform default otherwise. Returns whether the email
 * was actually sent (false when no sender is configured, or on failure).
 */
export async function sendWorkspaceEmail(
  workspaceId: string,
  options: SendEmailOptions,
): Promise<boolean> {
  const sender = await getWorkspaceEmailSender(workspaceId);
  if (!sender) {
    return false;
  }

  try {
    await sender.send(options);
    return true;
  } catch (error) {
    log.error(error, "[email] Failed to send workspace email");
    return false;
  }
}
