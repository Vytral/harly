import "server-only";

import { and, count, desc, eq, isNull, notInArray, sql } from "drizzle-orm";

import {
  applications,
  db,
  invitation,
  jobs,
  member as authMembers,
  sampleDataItems,
  workflowDefinitions,
  workspaceSettings,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { getSampleDataStatus } from "@/features/sample-data/service";
import {
  buildSetupChecklist,
  type ChecklistFacts,
  type SetupChecklistModel,
} from "@/features/onboarding/checklist-model";
import { readChecklistPreferences } from "@/features/onboarding/checklist-state";

export type SetupChecklist = SetupChecklistModel & {
  /** Most recent open job, with the public link candidates would use. */
  publishedJob: { title: string; url: string } | null;
  /** True while a sample batch is tracked; drives the dashboard banner. */
  sampleDataActive: boolean;
};

/**
 * The guided first hour. Every completion flag is derived from real rows, and
 * sample rows never count as progress: a loaded sample must not make "create a
 * job" look finished. The model is pure (checklist-model.ts); this function
 * only gathers facts, so it stays a handful of cheap aggregate queries that can
 * run on every dashboard render.
 */
export async function getSetupChecklist(): Promise<SetupChecklist> {
  const context = await getWorkspaceContext();
  const workspaceId = context.organization.id;
  const userId = context.user.id;
  const canManage = context.role === "owner" || context.role === "admin";

  const sampleRows = (entityType: string) =>
    db
      .select({ id: sampleDataItems.entityId })
      .from(sampleDataItems)
      .where(
        and(
          eq(sampleDataItems.workspaceId, workspaceId),
          eq(sampleDataItems.entityType, entityType),
        ),
      );

  const [
    settingsRow,
    jobsAgg,
    publishedRows,
    applicationsAgg,
    membersRow,
    invitesRow,
    automationsRow,
    sampleStatus,
    preferences,
  ] = await Promise.all([
    db
      .select({
        emailEnabled: workspaceSettings.emailEnabled,
        gcalEnabled: workspaceSettings.gcalEnabled,
        zoomEnabled: workspaceSettings.zoomEnabled,
        calEnabled: workspaceSettings.calEnabled,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, workspaceId))
      .limit(1),
    db
      .select({
        total: sql<number>`count(*)::int`,
        published: sql<number>`count(*) filter (where ${jobs.status} = 'open')::int`,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          isNull(jobs.deletedAt),
          notInArray(jobs.id, sampleRows("job")),
        ),
      ),
    db
      .select({ title: jobs.title, slug: jobs.slug })
      .from(jobs)
      .where(
        and(
          eq(jobs.workspaceId, workspaceId),
          eq(jobs.status, "open"),
          isNull(jobs.deletedAt),
          notInArray(jobs.id, sampleRows("job")),
        ),
      )
      .orderBy(desc(jobs.publishedAt), desc(jobs.createdAt))
      .limit(1),
    db
      .select({ value: count() })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          notInArray(applications.id, sampleRows("application")),
        ),
      ),
    db
      .select({ value: count() })
      .from(authMembers)
      .where(eq(authMembers.organizationId, workspaceId)),
    db
      .select({ value: count() })
      .from(invitation)
      .where(eq(invitation.organizationId, workspaceId)),
    db
      .select({ value: count() })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.workspaceId, workspaceId)),
    getSampleDataStatus(workspaceId),
    readChecklistPreferences({ workspaceId, userId }),
  ]);

  const settings = settingsRow[0];
  const facts: ChecklistFacts = {
    jobCount: jobsAgg[0]?.total ?? 0,
    publishedJobCount: jobsAgg[0]?.published ?? 0,
    applicationCount: applicationsAgg[0]?.value ?? 0,
    emailConnected: Boolean(settings?.emailEnabled),
    calendarConnected: Boolean(
      settings?.gcalEnabled || settings?.zoomEnabled || settings?.calEnabled,
    ),
    automationCount: automationsRow[0]?.value ?? 0,
    teammateInvited: (membersRow[0]?.value ?? 0) > 1 || (invitesRow[0]?.value ?? 0) > 0,
  };

  const model = buildSetupChecklist({ facts, preferences, canManage });
  const openJob = publishedRows[0] ?? null;

  return {
    ...model,
    publishedJob: openJob
      ? {
          title: openJob.title,
          url: `${getHarlyPublicOrigin()}/jobs/${openJob.slug}`,
        }
      : null,
    sampleDataActive: sampleStatus.active,
  };
}
