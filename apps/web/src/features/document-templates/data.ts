import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db, workflowDocumentTemplates } from "@harly/db";

import { getWorkspaceContext } from "@/features/workspaces/context";

import type { WorkflowDocumentTemplateItem } from "./shared";

const columns = {
  id: workflowDocumentTemplates.id,
  name: workflowDocumentTemplates.name,
  title: workflowDocumentTemplates.title,
  body: workflowDocumentTemplates.body,
  format: workflowDocumentTemplates.format,
  archivedAt: workflowDocumentTemplates.archivedAt,
  updatedAt: workflowDocumentTemplates.updatedAt,
};

export async function listWorkflowDocumentTemplates(): Promise<WorkflowDocumentTemplateItem[]> {
  const { organization } = await getWorkspaceContext();
  return db
    .select(columns)
    .from(workflowDocumentTemplates)
    .where(andWorkspace(organization.id))
    .orderBy(asc(workflowDocumentTemplates.name));
}

export async function getWorkflowDocumentTemplate(
  templateId: string,
): Promise<WorkflowDocumentTemplateItem | null> {
  const { organization } = await getWorkspaceContext();
  const [template] = await db
    .select(columns)
    .from(workflowDocumentTemplates)
    .where(andWorkspace(organization.id, templateId))
    .limit(1);
  return template ?? null;
}

function andWorkspace(workspaceId: string, templateId?: string) {
  return templateId
    ? and(
        eq(workflowDocumentTemplates.workspaceId, workspaceId),
        eq(workflowDocumentTemplates.id, templateId),
      )
    : eq(workflowDocumentTemplates.workspaceId, workspaceId);
}

export async function listActiveWorkflowDocumentTemplates() {
  const { organization } = await getWorkspaceContext();
  return db
    .select(columns)
    .from(workflowDocumentTemplates)
    .where(
      and(
        eq(workflowDocumentTemplates.workspaceId, organization.id),
        isNull(workflowDocumentTemplates.archivedAt),
      ),
    )
    .orderBy(asc(workflowDocumentTemplates.name));
}
