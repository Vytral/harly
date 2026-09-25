import "server-only";

import type React from "react";

import {
  createEmailSender,
  type EmailSender,
  type EmailAttachment,
  type SendEmailResult,
} from "@harly/emails";

import { isDemoMode } from "@harly/config";

import { getWorkspaceEmailConfig } from "./config";
import { resolveSenderFromOverride } from "./sender-identity";
import { createLogger } from "@/lib/logger";

const log = createLogger("email");

export const emailSender = createEmailSender();

export type SendEmailOptions = {
  to: string;
  subject: string;
  react: React.ReactElement;
  replyTo?: string;
  messageId?: string;
  idempotencyKey?: string;
  attachments?: EmailAttachment[];
};

/** Send a platform-level email (welcome, invitations...) using the env-configured sender. */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  // Public demo: never send real outbound email (an anonymous visitor could
  // otherwise trigger invites/notifications to arbitrary addresses).
  if (isDemoMode()) {
    log.info({ to: options.to, subject: options.subject }, "[email] Suppressed (demo mode)");
    return;
  }

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
 *
 * `actorUserId`, when given, swaps the "From" for that recruiter's personal
 * virtual sender identity , but only once the workspace has configured its
 * own sending domain and that member has an identity provisioned. Otherwise
 * this is a no-op and behaves exactly as before.
 */
export async function getWorkspaceEmailSender(
  workspaceId: string,
  actorUserId?: string | null,
): Promise<EmailSender | null> {
  const config = await getWorkspaceEmailConfig(workspaceId);
  const resolved = await resolveSenderFromOverride(workspaceId, actorUserId, config);
  return createEmailSender(resolved);
}

/**
 * Send an email on behalf of a workspace, using its own provider when
 * configured or the platform default otherwise. Returns whether the email
 * was actually sent (false when no sender is configured, or on failure).
 */
export async function sendWorkspaceEmail(
  workspaceId: string,
  options: SendEmailOptions,
  actorUserId?: string | null,
): Promise<SendEmailResult | false> {
  // Public demo: swallow all workspace-scoped outbound email.
  if (isDemoMode()) {
    log.info({ to: options.to, subject: options.subject }, "[email] Suppressed workspace send (demo mode)");
    return false;
  }

  const sender = await getWorkspaceEmailSender(workspaceId, actorUserId);
  if (!sender) {
    return false;
  }

  try {
    return await sender.send(options);
  } catch (error) {
    log.error(error, "[email] Failed to send workspace email");
    return false;
  }
}
