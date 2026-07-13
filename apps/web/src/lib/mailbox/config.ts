import "server-only";

import { eq } from "drizzle-orm";

import { db, mailboxes } from "@harly/db";

import { decryptSecret, isEncryptionConfigured } from "@/lib/crypto";

export type MailboxStatus = {
  configured: boolean;
  enabled: boolean;
  address: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapTls: boolean;
  imapUser: string | null;
  sourceFolder: string | null;
  sentFolder: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpTls: boolean;
  smtpUser: string | null;
  hasImapPassword: boolean;
  hasSmtpPassword: boolean;
  lastSyncedAt: string | null;
  lastHealthyAt: string | null;
  lastError: string | null;
  encryptionReady: boolean;
};

export type MailboxConfig = {
  id: string;
  workspaceId: string;
  address: string;
  enabled: boolean;
  imap: { host: string; port: number; tls: boolean; user: string; password: string; folder: string };
  smtp: { host: string; port: number; tls: boolean; user: string; password: string; sentFolder: string | null };
  uidValidity: string | null;
  lastUid: number;
};

export async function getMailboxStatus(workspaceId: string): Promise<MailboxStatus> {
  const [row] = await db.select().from(mailboxes).where(eq(mailboxes.workspaceId, workspaceId)).limit(1);
  return {
    configured: Boolean(row), enabled: Boolean(row?.enabled), address: row?.address ?? null,
    imapHost: row?.imapHost ?? null, imapPort: row?.imapPort ?? null, imapTls: Boolean(row?.imapTls),
    imapUser: row?.imapUser ?? null, sourceFolder: row?.sourceFolder ?? null, sentFolder: row?.sentFolder ?? null,
    smtpHost: row?.smtpHost ?? null, smtpPort: row?.smtpPort ?? null, smtpTls: Boolean(row?.smtpTls), smtpUser: row?.smtpUser ?? null,
    hasImapPassword: Boolean(row?.imapPasswordCiphertext), hasSmtpPassword: Boolean(row?.smtpPasswordCiphertext),
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null, lastHealthyAt: row?.lastHealthyAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null, encryptionReady: isEncryptionConfigured(),
  };
}

/** Returns decrypted credentials only to server-side mailbox operations. */
export async function getMailboxConfig(workspaceId: string): Promise<MailboxConfig | null> {
  if (!isEncryptionConfigured()) return null;
  const [row] = await db.select().from(mailboxes).where(eq(mailboxes.workspaceId, workspaceId)).limit(1);
  if (!row || !row.enabled) return null;
  try {
    return {
      id: row.id, workspaceId: row.workspaceId, address: row.address, enabled: row.enabled,
      imap: { host: row.imapHost, port: row.imapPort, tls: row.imapTls, user: row.imapUser, password: decryptSecret({ ciphertext: row.imapPasswordCiphertext, iv: row.imapPasswordIv, tag: row.imapPasswordTag }), folder: row.sourceFolder },
      smtp: { host: row.smtpHost, port: row.smtpPort, tls: row.smtpTls, user: row.smtpUser, password: decryptSecret({ ciphertext: row.smtpPasswordCiphertext, iv: row.smtpPasswordIv, tag: row.smtpPasswordTag }), sentFolder: row.sentFolder },
      uidValidity: row.uidValidity, lastUid: row.lastUid,
    };
  } catch { return null; }
}
