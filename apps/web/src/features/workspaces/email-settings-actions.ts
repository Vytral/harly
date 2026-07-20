"use server";

import { createElement } from "react";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, workspaceSettings } from "@harly/db";
import { createEmailSender, type EmailProviderConfig } from "@harly/emails";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import { normalizeInboundReplyDomain } from "@/lib/email/inbound-token";
import {
  getWorkspaceEmailConfig,
  getWorkspaceEmailStatus,
  getWorkspaceInboundEmailStatus,
} from "@/lib/email/config";

const log = createLogger("workspace-email-settings");

export type EmailSettingsActionResult = { ok: boolean; error?: string };

const baseSchema = z.object({
  provider: z.enum(["resend", "smtp"]),
  from: z.string().trim().min(1, "Enter a from address.").max(200),
  // Optional: when blank, the previously stored secret is kept.
  apiKey: z.string().trim().max(500).optional(),
  smtpHost: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  smtpPort: z
    .union([z.coerce.number().int().min(1).max(65535), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
  smtpSecure: z.boolean().optional(),
  smtpUser: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

function refineSmtpFields(
  value: z.infer<typeof baseSchema>,
  ctx: z.RefinementCtx,
) {
  if (value.provider !== "smtp") return;

  if (!value.smtpHost) {
    ctx.addIssue({
      code: "custom",
      message: "Enter an SMTP host.",
      path: ["smtpHost"],
    });
  }
  if (value.smtpPort === null) {
    ctx.addIssue({
      code: "custom",
      message: "Enter an SMTP port.",
      path: ["smtpPort"],
    });
  }
}

const saveSchema = baseSchema
  .extend({ enabled: z.boolean() })
  .superRefine(refineSmtpFields);
const testSchema = baseSchema.superRefine(refineSmtpFields);

export async function saveEmailSettingsAction(input: {
  enabled: boolean;
  provider: "resend" | "smtp";
  from: string;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number | string;
  smtpSecure?: boolean;
  smtpUser?: string;
}): Promise<EmailSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error:
        "Server is missing AI_ENCRYPTION_KEY. Set it to store email credentials.",
    };
  }

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const { enabled, provider, from, apiKey, smtpHost, smtpPort, smtpSecure, smtpUser } =
    parsed.data;

  const status = await getWorkspaceEmailStatus(context.organization.id);
  if (enabled && provider === "resend" && !apiKey && !status.hasSecret) {
    return { ok: false, error: "Add a Resend API key before enabling." };
  }

  const encrypted = apiKey ? encryptSecret(apiKey) : null;
  const secretColumns = encrypted
    ? {
        emailApiKeyCiphertext: encrypted.ciphertext,
        emailApiKeyIv: encrypted.iv,
        emailApiKeyTag: encrypted.tag,
      }
    : {};

  const columns = {
    emailEnabled: enabled,
    emailProvider: provider,
    emailFrom: from,
    emailSmtpHost: provider === "smtp" ? (smtpHost ?? null) : null,
    emailSmtpPort: provider === "smtp" ? smtpPort : null,
    emailSmtpSecure: provider === "smtp" ? Boolean(smtpSecure) : false,
    emailSmtpUser: provider === "smtp" ? (smtpUser ?? null) : null,
    ...secretColumns,
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, ...columns })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { ...columns, updatedAt: new Date() },
    });

  revalidatePath("/settings");
  return { ok: true };
}

export async function disableEmailAction(): Promise<EmailSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({ emailEnabled: false, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath("/settings");
  return { ok: true };
}

const inboundSchema = z.object({
  provider: z.enum(["resend", "postmark"]),
  replyDomain: z.string().trim().min(1, "Enter a reply domain.").max(200),
  // Optional: when blank, the previously stored secret is kept.
  webhookSecret: z.string().trim().max(500).optional(),
  // Resend only. Optional: when blank, the previously stored key is kept.
  resendApiKey: z.string().trim().max(500).optional(),
});

export async function saveInboundEmailSettingsAction(input: {
  enabled: boolean;
  provider: "resend" | "postmark";
  replyDomain: string;
  webhookSecret?: string;
  resendApiKey?: string;
}): Promise<EmailSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  if (input.enabled && !isEncryptionConfigured()) {
    return { ok: false, error: "Server is missing AI_ENCRYPTION_KEY." };
  }

  const parsed = inboundSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const { enabled, provider, replyDomain, webhookSecret, resendApiKey } = input;
  if (enabled && !normalizeInboundReplyDomain(replyDomain)) {
    return {
      ok: false,
      error: "Enter a valid reply domain, for example replies.example.com.",
    };
  }
  const status = await getWorkspaceInboundEmailStatus(context.organization.id);

  if (enabled && !webhookSecret && !status.hasWebhookSecret) {
    return { ok: false, error: "Add a webhook secret before enabling." };
  }
  if (
    enabled &&
    provider === "resend" &&
    !resendApiKey &&
    !status.hasResendApiKey
  ) {
    return { ok: false, error: "Add a Resend API key before enabling." };
  }

  const resendKeyColumns =
    provider === "resend" && resendApiKey
      ? (() => {
          const encrypted = encryptSecret(resendApiKey);
          return {
            emailInboundResendApiKeyCiphertext: encrypted.ciphertext,
            emailInboundResendApiKeyIv: encrypted.iv,
            emailInboundResendApiKeyTag: encrypted.tag,
          };
        })()
      : provider === "postmark"
        ? {
            emailInboundResendApiKeyCiphertext: null,
            emailInboundResendApiKeyIv: null,
            emailInboundResendApiKeyTag: null,
          }
        : {};

  const columns = {
    emailInboundEnabled: enabled,
    emailInboundProvider: provider,
    emailInboundReplyDomain: replyDomain,
    ...(webhookSecret ? { emailInboundWebhookSecret: webhookSecret } : {}),
    ...resendKeyColumns,
  };

  await db
    .insert(workspaceSettings)
    .values({ organizationId: context.organization.id, ...columns })
    .onConflictDoUpdate({
      target: workspaceSettings.organizationId,
      set: { ...columns, updatedAt: new Date() },
    });

  revalidatePath("/settings");
  revalidatePath("/settings/email");
  return { ok: true };
}

export async function disableInboundEmailAction(): Promise<EmailSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  await db
    .update(workspaceSettings)
    .set({ emailInboundEnabled: false, updatedAt: new Date() })
    .where(eq(workspaceSettings.organizationId, context.organization.id));

  revalidatePath("/settings");
  revalidatePath("/settings/email");
  return { ok: true };
}

export async function sendTestEmailAction(input: {
  provider: "resend" | "smtp";
  from: string;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number | string;
  smtpSecure?: boolean;
  smtpUser?: string;
}): Promise<EmailSettingsActionResult> {
  const context = await requirePermission("integrations:manage");

  if (!isEncryptionConfigured()) {
    return { ok: false, error: "Server is missing AI_ENCRYPTION_KEY." };
  }

  const parsed = testSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const { provider, from, apiKey, smtpHost, smtpPort, smtpSecure, smtpUser } =
    parsed.data;

  let config: EmailProviderConfig;
  if (provider === "resend") {
    let key = apiKey;
    if (!key) {
      const stored = await getWorkspaceEmailConfig(context.organization.id);
      if (!stored || stored.provider !== "resend") {
        return { ok: false, error: "Enter an API key to test." };
      }
      key = stored.apiKey;
    }
    config = { provider: "resend", apiKey: key, from };
  } else {
    if (!smtpHost || !smtpPort) {
      return { ok: false, error: "Enter an SMTP host and port to test." };
    }

    let pass = apiKey;
    if (!pass) {
      const stored = await getWorkspaceEmailConfig(context.organization.id);
      if (stored?.provider === "smtp") {
        pass = stored.pass;
      }
    }

    config = {
      provider: "smtp",
      from,
      host: smtpHost,
      port: smtpPort,
      secure: Boolean(smtpSecure),
      user: smtpUser,
      pass,
    };
  }

  const sender = createEmailSender(config);
  if (!sender) {
    return { ok: false, error: "Could not create a sender from these settings." };
  }

  try {
    if (sender.verify) {
      await sender.verify();
      return { ok: true };
    }

    await sender.send({
      to: context.user.email,
      subject: "Harly test email",
      react: createElement(
        "div",
        { style: { fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.6 } },
        createElement(
          "p",
          null,
          `This is a test email from ${context.organization.name} via Harly.`,
        ),
        createElement("p", null, "If you received this, your email settings are working."),
      ),
    });
    return { ok: true };
  } catch (error) {
    log.error(error, "sendTestEmailAction failed");
    return {
      ok: false,
      error:
        error instanceof Error ? `Test failed: ${error.message}` : "Test failed.",
    };
  }
}
