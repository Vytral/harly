"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, mailboxes } from "@harly/db";

import { requirePermission } from "@/features/workspaces/permissions-server";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { syncMailbox } from "@/lib/mailbox/sync";

const schema = z.object({
  enabled: z.boolean(), address: z.string().email(),
  imapHost: z.string().trim().min(1).max(255), imapPort: z.coerce.number().int().min(1).max(65535), imapTls: z.boolean(), imapUser: z.string().trim().min(1).max(255), imapPassword: z.string().max(500).optional(), sourceFolder: z.string().trim().min(1).max(255),
  smtpHost: z.string().trim().min(1).max(255), smtpPort: z.coerce.number().int().min(1).max(65535), smtpTls: z.boolean(), smtpUser: z.string().trim().min(1).max(255), smtpPassword: z.string().max(500).optional(), sentFolder: z.string().trim().max(255).optional(),
});

export type MailboxActionResult = { ok: boolean; error?: string };

export async function saveMailboxSettingsAction(input: z.input<typeof schema>): Promise<MailboxActionResult> {
  const context = await requirePermission("integrations:manage");
  if (!isEncryptionConfigured()) return { ok: false, error: "Server encryption is not configured." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid mailbox settings." };
  const value = parsed.data;
  const [existing] = await db.select().from(mailboxes).where(eq(mailboxes.workspaceId, context.organization.id)).limit(1);
  if (!existing && (!value.imapPassword || !value.smtpPassword)) return { ok: false, error: "Add both mailbox passwords before saving." };
  const imap = value.imapPassword ? encryptSecret(value.imapPassword) : null;
  const smtp = value.smtpPassword ? encryptSecret(value.smtpPassword) : null;
  const columns = {
    address: value.address, enabled: value.enabled, imapHost: value.imapHost, imapPort: value.imapPort, imapTls: value.imapTls, imapUser: value.imapUser, sourceFolder: value.sourceFolder,
    smtpHost: value.smtpHost, smtpPort: value.smtpPort, smtpTls: value.smtpTls, smtpUser: value.smtpUser, sentFolder: value.sentFolder || null,
    ...(imap ? { imapPasswordCiphertext: imap.ciphertext, imapPasswordIv: imap.iv, imapPasswordTag: imap.tag } : {}),
    ...(smtp ? { smtpPasswordCiphertext: smtp.ciphertext, smtpPasswordIv: smtp.iv, smtpPasswordTag: smtp.tag } : {}),
  };
  if (existing) await db.update(mailboxes).set(columns).where(eq(mailboxes.id, existing.id));
  else await db.insert(mailboxes).values({ workspaceId: context.organization.id, ...columns, imapPasswordCiphertext: imap!.ciphertext, imapPasswordIv: imap!.iv, imapPasswordTag: imap!.tag, smtpPasswordCiphertext: smtp!.ciphertext, smtpPasswordIv: smtp!.iv, smtpPasswordTag: smtp!.tag });
  revalidatePath("/settings/email"); revalidatePath("/dashboard/inbox");
  return { ok: true };
}

export async function testMailboxConnectionAction(): Promise<MailboxActionResult> {
  const context = await requirePermission("integrations:manage");
  try { await syncMailbox(context.organization.id); revalidatePath("/settings/email"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Connection test failed." }; }
}
