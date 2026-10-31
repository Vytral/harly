import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import {
  db,
  workflowDefinitionVersions,
  workflowDefinitions,
  workflowDrafts,
  workflowDocumentTemplates,
} from "@harly/db";

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

/**
 * How many workflows reference each template, from their current published
 * version and working draft. Matched on the template id inside the stored
 * graph, so it is a heads-up for the archive prompt rather than an exact join.
 */
export async function countWorkflowsUsingTemplates(
  templateIds: string[],
): Promise<Record<string, number>> {
  if (templateIds.length === 0) return {};
  const { organization } = await getWorkspaceContext();
  const entries = await Promise.all(
    templateIds.map(async (templateId) => {
      const needle = `%${templateId}%`;
      const [published, drafts] = await Promise.all([
        db
          .select({ id: workflowDefinitionVersions.workflowId })
          .from(workflowDefinitionVersions)
          .innerJoin(
            workflowDefinitions,
            and(
              eq(workflowDefinitions.id, workflowDefinitionVersions.workflowId),
              eq(workflowDefinitions.definitionVersion, workflowDefinitionVersions.version),
            ),
          )
          .where(
            and(
              eq(workflowDefinitionVersions.workspaceId, organization.id),
              sql`(${workflowDefinitionVersions.graph}::text like ${needle} or ${workflowDefinitionVersions.actions}::text like ${needle})`,
            ),
          ),
        db
          .select({ id: workflowDrafts.workflowId })
          .from(workflowDrafts)
          .where(
            and(
              eq(workflowDrafts.workspaceId, organization.id),
              sql`${workflowDrafts.graph}::text like ${needle}`,
            ),
          ),
      ]);
      return [templateId, new Set([...published, ...drafts].map((row) => row.id)).size] as const;
    }),
  );
  return Object.fromEntries(entries);
}
