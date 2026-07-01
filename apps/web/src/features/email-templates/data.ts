import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db, emailTemplates } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

export type TemplateType = "general" | "interview_invite" | "rejection" | "offer" | "screening";

export type EmailTemplateItem = {
  id: string;
  name: string;
  type: TemplateType;
  subject: string;
  body: string;
  updatedAt: string;
};

export async function listEmailTemplates(): Promise<EmailTemplateItem[]> {
  const { organization: workspace } = await getWorkspaceContext();

  const rows = await db
    .select({
      id: emailTemplates.id,
      name: emailTemplates.name,
      type: emailTemplates.type,
      subject: emailTemplates.subject,
      body: emailTemplates.body,
      updatedAt: emailTemplates.updatedAt,
    })
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
    .select({
      id: emailTemplates.id,
      name: emailTemplates.name,
      type: emailTemplates.type,
      subject: emailTemplates.subject,
      body: emailTemplates.body,
      updatedAt: emailTemplates.updatedAt,
    })
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
