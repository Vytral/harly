import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db, emailTemplates } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  interpolateTemplate,
  sanitizeTemplateHtml,
  type TemplateValues,
} from "@/features/email-templates/interpolate";

import type { EmailTemplateItem, TemplateType } from "./shared";
import { SYSTEM_TEMPLATE_TYPES } from "./shared";

export type { EmailTemplateItem, TemplateType } from "./shared";
export { SYSTEM_TEMPLATE_TYPES } from "./shared";

const templateColumns = {
  id: emailTemplates.id,
  name: emailTemplates.name,
  type: emailTemplates.type,
  subject: emailTemplates.subject,
  body: emailTemplates.body,
  isActive: emailTemplates.isActive,
  updatedAt: emailTemplates.updatedAt,
};

export async function listEmailTemplates(): Promise<EmailTemplateItem[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select(templateColumns)
    .from(emailTemplates)
    .where(eq(emailTemplates.workspaceId, workspace.id))
    .orderBy(desc(emailTemplates.updatedAt));

  return rows.map((row) => ({
    ...row,
    type: (row.type ?? "general") as TemplateType,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getEmailTemplate(
  templateId: string,
): Promise<EmailTemplateItem | null> {
  const { organization: workspace } = await getWorkspaceContext();

  const [row] = await db
    .select(templateColumns)
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.workspaceId, workspace.id),
        eq(emailTemplates.id, templateId),
      ),
    )
    .limit(1);

  return row
    ? { ...row, type: (row.type ?? "general") as TemplateType, updatedAt: row.updatedAt.toISOString() }
    : null;
}

/**
 * The workspace's active custom template for a system trigger type, if any.
 * Used by the pipeline/offers/interviews auto-email senders to override the
 * hardcoded react-email default. Returns null when the workspace hasn't
 * designated a template as active for that type.
 */
export async function getActiveEmailTemplate(
  workspaceId: string,
  type: (typeof SYSTEM_TEMPLATE_TYPES)[number],
): Promise<{ subject: string; body: string } | null> {
  const [row] = await db
    .select({ subject: emailTemplates.subject, body: emailTemplates.body })
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.workspaceId, workspaceId),
        eq(emailTemplates.type, type),
        eq(emailTemplates.isActive, true),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Fetch + interpolate + sanitize the workspace's active template for a
 * system trigger, ready to drop into `CustomTemplateEmail`. Returns null
 * when no template is active for that type (caller falls back to the
 * hardcoded react-email default).
 */
export async function renderActiveEmailTemplate(
  workspaceId: string,
  type: (typeof SYSTEM_TEMPLATE_TYPES)[number],
  values: TemplateValues,
): Promise<{ subject: string; bodyHtml: string } | null> {
  const template = await getActiveEmailTemplate(workspaceId, type);
  if (!template) return null;

  return {
    subject: interpolateTemplate(template.subject, values),
    bodyHtml: sanitizeTemplateHtml(interpolateTemplate(template.body, values)),
  };
}
