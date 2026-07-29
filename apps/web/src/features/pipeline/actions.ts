"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, isNull, isNotNull } from "drizzle-orm";

import { db } from "@harly/db";
import {
  activityEvents,
  applications,
  applicationStageHistory,
  candidatePortalNotifications,
  candidates,
  jobs,
  jobStages,
  organization,
  workspaceSettings,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import {
  requireApplicationPermission,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
  type PersistedDomainEvent,
} from "@/server/events/emit";
import { normalizeStageEmailConfig } from "@/features/pipeline/data";
import {
  statusForStageName,
  terminalStageNameForStatus,
  type PipelineApplicationStatus,
} from "@/features/pipeline/state";
import {
  enqueueEmailOutbox,
  processEmailOutbox,
} from "@/lib/email/outbox-processor";

type ApplicationStatus = PipelineApplicationStatus;

type MoveApplicationStageInput = {
  applicationId: string;
  fromStageId: string | null;
  toStageId: string;
  workspaceId: string;
};

type MoveApplicationInPipelineInput = MoveApplicationStageInput & {
  orderedApplicationIds: string[];
};

type BulkMoveApplicationsInput = {
  applicationIds: string[];
  toStageId: string;
  workspaceId: string;
};

type UpdateApplicationStatusInput = {
  applicationIds: string[];
  workspaceId: string;
  status: ApplicationStatus;
};

type UpdateStageEmailSettingsInput = {
  workspaceId: string;
  jobId: string;
  stageId: string;
  candidateUpdatesEnabled: boolean;
};

type StageTransitionEvent = {
  applicationId: string;
  fromStageId: string | null;
  toStageId: string;
  status: ApplicationStatus;
  becameHired: boolean;
  becameRejected: boolean;
};

type PipelineEmail =
  | {
      type: "stage";
      applicationId: string;
      candidateEmail: string;
      candidateName: string;
      jobTitle: string;
      stageName: string;
      workspaceName: string;
    }
  | {
      type: "rejected";
      applicationId: string;
      candidateEmail: string;
      candidateName: string;
      jobTitle: string;
      workspaceName: string;
    };

import { createLogger } from "@/lib/logger";
import {
  ConcurrencyConflictError,
  withConcurrencyRetry,
} from "@/lib/concurrent";

const log = createLogger("pipeline");

async function sendPipelineEmails(
  workspaceId: string,
  emails: PipelineEmail[],
  actorId?: string,
) {
  if (emails.length === 0) return;

  const ids: string[] = [];
  for (const email of emails) {
    ids.push(
      await enqueueEmailOutbox(
        workspaceId,
        email.type === "stage" ? "pipeline.stage" : "pipeline.rejected",
        {
          candidateEmail: email.candidateEmail,
          candidateName: email.candidateName,
          applicationId: email.applicationId,
          jobTitle: email.jobTitle,
          stageName: email.type === "stage" ? email.stageName : undefined,
          workspaceName: email.workspaceName,
          type: email.type,
        },
        undefined,
        actorId,
      ),
    );
  }

  await processEmailOutbox({ ids, workspaceId });
}

async function getApplicationsForAction(
  applicationIds: string[],
  workspaceId: string,
) {
  if (applicationIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: applications.id,
      candidateId: applications.candidateId,
      jobId: applications.jobId,
      currentStageId: applications.currentStageId,
      updatedAt: applications.updatedAt,
      status: applications.status,
      candidateEmail: candidates.email,
      candidateFirstName: candidates.firstName,
      candidateLastName: candidates.lastName,
      jobTitle: jobs.title,
      workspaceName: organization.name,
    })
    .from(applications)
    .innerJoin(
      candidates,
      and(
        eq(candidates.workspaceId, workspaceId),
        eq(candidates.id, applications.candidateId),
      ),
    )
    .innerJoin(
      jobs,
      and(
        eq(jobs.workspaceId, workspaceId),
        eq(jobs.id, applications.jobId),
        isNull(jobs.deletedAt),
      ),
    )
    .innerJoin(organization, eq(organization.id, applications.workspaceId))
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        inArray(applications.id, applicationIds),
      ),
    );
}

export async function moveApplicationInPipeline(
  input: MoveApplicationInPipelineInput,
): Promise<{ success: boolean; error?: string }> {
  await requireApplicationPermission("candidates:move", input.applicationId);
  const { organization: workspace, user } = await getWorkspaceContext();

  try {
    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    const [portalSettings] = await db
      .select({
        showApplicationStatus: workspaceSettings.portalShowApplicationStatus,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, input.workspaceId))
      .limit(1);
    const shouldNotifyPortalStatus =
      portalSettings?.showApplicationStatus !== false;

    // Captured inside the transaction, emitted after commit (see data.ts note).
    const stageEvents: StageTransitionEvent[] = [];
    const domainEvents: PersistedDomainEvent[] = [];

    const emails = await withConcurrencyRetry(
      async () => {
        domainEvents.length = 0;
        return db.transaction<PipelineEmail[]>(async (tx) => {
          const [application] = await tx
            .select({
              id: applications.id,
              candidateId: applications.candidateId,
              currentStageId: applications.currentStageId,
              updatedAt: applications.updatedAt,
              status: applications.status,
              candidateEmail: candidates.email,
              candidateFirstName: candidates.firstName,
              candidateLastName: candidates.lastName,
              jobTitle: jobs.title,
              workspaceName: organization.name,
              toStageName: jobStages.name,
              toStageEmailConfig: jobStages.emailConfig,
            })
            .from(applications)
            .innerJoin(
              candidates,
              and(
                eq(candidates.workspaceId, input.workspaceId),
                eq(candidates.id, applications.candidateId),
              ),
            )
            .innerJoin(
              jobs,
              and(
                eq(jobs.workspaceId, input.workspaceId),
                eq(jobs.id, applications.jobId),
                isNull(jobs.deletedAt),
              ),
            )
            .innerJoin(
              organization,
              eq(organization.id, applications.workspaceId),
            )
            .innerJoin(
              jobStages,
              and(
                eq(jobStages.workspaceId, input.workspaceId),
                eq(jobStages.jobId, applications.jobId),
                eq(jobStages.id, input.toStageId),
              ),
            )
            .where(
              and(
                eq(applications.id, input.applicationId),
                eq(applications.workspaceId, input.workspaceId),
              ),
            )
            .limit(1);

          // The join above also requires the target stage to belong to the
          // application's own job, so a stage from another job fails here.
          if (!application) {
            throw new Error("Application or target stage not found.");
          }

          const now = new Date();
          const changedStage = application.currentStageId !== input.toStageId;
          const nextStatus = statusForStageName(application.toStageName);
          const changedStatus = application.status !== nextStatus;

          const [updatedApplication] = await tx
            .update(applications)
            .set({
              currentStageId: input.toStageId,
              status: nextStatus,
              updatedAt: now,
            })
            .where(
              and(
                eq(applications.id, input.applicationId),
                eq(applications.workspaceId, input.workspaceId),
                input.fromStageId
                  ? eq(applications.currentStageId, input.fromStageId)
                  : undefined,
                eq(applications.updatedAt, application.updatedAt),
              ),
            )
            .returning({ id: applications.id });

          if (!updatedApplication) {
            throw new ConcurrencyConflictError();
          }

          if (input.orderedApplicationIds.length > 0) {
            await tx
              .update(applications)
              .set({ updatedAt: now })
              .where(
                and(
                  inArray(applications.id, input.orderedApplicationIds),
                  eq(applications.workspaceId, input.workspaceId),
                  eq(applications.currentStageId, input.toStageId),
                ),
              );

            for (const [
              index,
              applicationId,
            ] of input.orderedApplicationIds.entries()) {
              await tx
                .update(applications)
                .set({ pipelineOrder: index + 1 })
                .where(
                  and(
                    eq(applications.id, applicationId),
                    eq(applications.workspaceId, input.workspaceId),
                  ),
                );
            }
          }

          if (!changedStage && !changedStatus) {
            return [];
          }

          if (changedStage) {
            await tx.insert(applicationStageHistory).values({
              workspaceId: input.workspaceId,
              applicationId: input.applicationId,
              fromStageId: application.currentStageId,
              toStageId: input.toStageId,
              movedById: user.id,
            });

            await tx.insert(activityEvents).values({
              workspaceId: input.workspaceId,
              actorId: user.id,
              entityType: "application",
              entityId: input.applicationId,
              type: "stage.changed",
              metadata: {
                fromStageId: application.currentStageId,
                toStageId: input.toStageId,
                status: nextStatus,
              },
            });

            stageEvents.push({
              applicationId: input.applicationId,
              fromStageId: application.currentStageId,
              toStageId: input.toStageId,
              status: nextStatus,
              becameHired:
                application.status !== "hired" && nextStatus === "hired",
              becameRejected:
                application.status !== "rejected" && nextStatus === "rejected",
            });

            domainEvents.push(
              await persistDomainEvent(tx, {
                name: "application.stage_changed",
                workspaceId: input.workspaceId,
                actorId: user.id,
                aggregateType: "application",
                aggregateId: input.applicationId,
                payload: {
                  application: { id: input.applicationId },
                  fromStageId: application.currentStageId,
                  toStageId: input.toStageId,
                  status: nextStatus,
                },
              }),
            );
            if (application.status !== "hired" && nextStatus === "hired") {
              domainEvents.push(
                await persistDomainEvent(tx, {
                  name: "application.hired",
                  workspaceId: input.workspaceId,
                  actorId: user.id,
                  aggregateType: "application",
                  aggregateId: input.applicationId,
                  payload: { application: { id: input.applicationId } },
                }),
              );
            }
            if (application.status !== "rejected" && nextStatus === "rejected") {
              domainEvents.push(
                await persistDomainEvent(tx, {
                  name: "application.rejected",
                  workspaceId: input.workspaceId,
                  actorId: user.id,
                  aggregateType: "application",
                  aggregateId: input.applicationId,
                  payload: { application: { id: input.applicationId } },
                }),
              );
            }
          }

          if (changedStatus) {
            await tx.insert(activityEvents).values({
              workspaceId: input.workspaceId,
              actorId: user.id,
              entityType: "application",
              entityId: input.applicationId,
              type: `application.${nextStatus}`,
              metadata: { status: nextStatus },
            });
          }

          if (
            shouldNotifyPortalStatus &&
            application.status !== "rejected" &&
            nextStatus === "rejected"
          ) {
            await tx.insert(candidatePortalNotifications).values({
              workspaceId: input.workspaceId,
              candidateId: application.candidateId,
              type: "application_rejected",
              title: `Application for ${application.jobTitle} not selected`,
              body: "We appreciate your interest and encourage you to apply for other roles.",
              href: `/portal/applications/${application.id}`,
              metadata: { applicationId: application.id, status: nextStatus },
            });
          }

          if (
            shouldNotifyPortalStatus &&
            application.status !== "hired" &&
            nextStatus === "hired"
          ) {
            await tx.insert(candidatePortalNotifications).values({
              workspaceId: input.workspaceId,
              candidateId: application.candidateId,
              type: "application_hired",
              title: `Congratulations! You've been hired for ${application.jobTitle}`,
              body: "We're excited to have you on the team!",
              href: `/portal/applications/${application.id}`,
              metadata: { applicationId: application.id, status: nextStatus },
            });
          }

          const candidateName = `${application.candidateFirstName} ${application.candidateLastName}`;
          const stageEmailConfig = normalizeStageEmailConfig(
            application.toStageEmailConfig,
          );

          if (application.status !== "rejected" && nextStatus === "rejected") {
            return [
              {
                type: "rejected",
                applicationId: application.id,
                candidateEmail: application.candidateEmail,
                candidateName,
                jobTitle: application.jobTitle,
                workspaceName: application.workspaceName,
              },
            ];
          }

          if (
            nextStatus === "active" &&
            stageEmailConfig.candidateUpdatesEnabled
          ) {
            return [
              {
                type: "stage",
                applicationId: application.id,
                candidateEmail: application.candidateEmail,
                candidateName,
                jobTitle: application.jobTitle,
                stageName: application.toStageName,
                workspaceName: application.workspaceName,
              },
            ];
          }

          return [];
        });
      },
      {
        onExhausted: (error, attempts) =>
          log.error(
            { error, attempts, applicationId: input.applicationId },
            "moveApplicationInPipeline exhausted concurrency retries",
          ),
      },
    );

    revalidatePath("/dashboard/pipeline");
    void sendPipelineEmails(input.workspaceId, emails, user.id);
    await publishPersistedDomainEvents(domainEvents);

    for (const event of stageEvents) {
      await emitWebhookEvent(
        input.workspaceId,
        "application.stage_changed",
        {
          application: { id: event.applicationId },
          fromStageId: event.fromStageId,
          toStageId: event.toStageId,
          status: event.status,
        },
        { actorId: user.id, skipDomainEvent: true },
      );
      if (event.becameHired) {
        await emitWebhookEvent(
          input.workspaceId,
          "application.hired",
          {
            application: { id: event.applicationId },
          },
          { actorId: user.id, skipDomainEvent: true },
        );
      }
      if (event.becameRejected) {
        await emitWebhookEvent(
          input.workspaceId,
          "application.rejected",
          {
            application: { id: event.applicationId },
          },
          { actorId: user.id, skipDomainEvent: true },
        );
      }
    }

    return { success: true };
  } catch (error) {
    log.error(error, "moveApplicationInPipeline failed");
    return { success: false, error: "Unable to move application." };
  }
}

export async function moveApplicationStage(
  input: MoveApplicationStageInput,
): Promise<{ success: boolean; error?: string }> {
  return moveApplicationInPipeline({
    ...input,
    orderedApplicationIds: [input.applicationId],
  });
}

export async function bulkMoveApplications(
  input: BulkMoveApplicationsInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (
      !Array.isArray(input.applicationIds) ||
      input.applicationIds.length === 0 ||
      input.applicationIds.length > 100 ||
      new Set(input.applicationIds).size !== input.applicationIds.length
    ) {
      return { success: false, error: "Invalid application move request." };
    }
    const uniqueApplicationIds = [...new Set(input.applicationIds)];

    await requirePermission("candidates:move");
    const { organization: workspace, user } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    const [portalSettings] = await db
      .select({
        showApplicationStatus: workspaceSettings.portalShowApplicationStatus,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, input.workspaceId))
      .limit(1);
    const shouldNotifyPortalStatus =
      portalSettings?.showApplicationStatus !== false;

    const stageEvents: StageTransitionEvent[] = [];
    const domainEvents: PersistedDomainEvent[] = [];

    const emails = await withConcurrencyRetry(
      async () => {
        domainEvents.length = 0;
        return db.transaction<PipelineEmail[]>(async (tx) => {
          const [targetStage] = await tx
            .select({
              id: jobStages.id,
              name: jobStages.name,
              emailConfig: jobStages.emailConfig,
            })
            .from(jobStages)
            .innerJoin(
              jobs,
              and(
                eq(jobs.workspaceId, input.workspaceId),
                eq(jobs.id, jobStages.jobId),
                isNull(jobs.deletedAt),
              ),
            )
            .where(
              and(
                eq(jobStages.workspaceId, input.workspaceId),
                eq(jobStages.id, input.toStageId),
              ),
            )
            .limit(1);

          if (!targetStage) {
            throw new Error("Target stage not found.");
          }

          const toStageName = targetStage.name;
          const stageEmailConfig = normalizeStageEmailConfig(
            targetStage.emailConfig,
          );

          const targetStageApplications = await tx
            .select({ id: applications.id, updatedAt: applications.updatedAt })
            .from(applications)
            .innerJoin(
              jobs,
              and(
                eq(jobs.workspaceId, input.workspaceId),
                eq(jobs.id, applications.jobId),
                isNull(jobs.deletedAt),
              ),
            )
            .where(
              and(
                eq(applications.workspaceId, input.workspaceId),
                eq(applications.currentStageId, input.toStageId),
              ),
            )
            .orderBy(
              asc(applications.pipelineOrder),
              asc(applications.appliedAt),
            );
          const existingIds = new Set(
            targetStageApplications.map((item) => item.id),
          );
          const versionById = new Map(
            targetStageApplications.map((item) => [item.id, item.updatedAt]),
          );
          const orderedIds = [
            ...targetStageApplications.map((item) => item.id),
            ...input.applicationIds.filter((id) => !existingIds.has(id)),
          ];
          const now = new Date();

          const allApplications = await tx
            .select({
              id: applications.id,
              candidateId: applications.candidateId,
              currentStageId: applications.currentStageId,
              updatedAt: applications.updatedAt,
              status: applications.status,
              candidateEmail: candidates.email,
              candidateFirstName: candidates.firstName,
              candidateLastName: candidates.lastName,
              jobTitle: jobs.title,
              workspaceName: organization.name,
            })
            .from(applications)
            .innerJoin(
              candidates,
              and(
                eq(candidates.workspaceId, input.workspaceId),
                eq(candidates.id, applications.candidateId),
              ),
            )
            .innerJoin(
              jobs,
              and(
                eq(jobs.workspaceId, input.workspaceId),
                eq(jobs.id, applications.jobId),
                isNull(jobs.deletedAt),
              ),
            )
            .innerJoin(
              jobStages,
              and(
                eq(jobStages.id, input.toStageId),
                eq(jobStages.jobId, applications.jobId),
              ),
            )
            .innerJoin(
              organization,
              eq(organization.id, applications.workspaceId),
            )
            .where(
              and(
                eq(applications.workspaceId, input.workspaceId),
                inArray(applications.id, uniqueApplicationIds),
              ),
            );

          const applicationsByStage = new Map<string, string[]>();
          const appDataById = new Map(allApplications.map((a) => [a.id, a]));

          for (const app of allApplications) {
            if (app.currentStageId === input.toStageId) continue;
            const stageApps = applicationsByStage.get(app.currentStageId) ?? [];
            stageApps.push(app.id);
            applicationsByStage.set(app.currentStageId, stageApps);
          }

          const collectedEmails: PipelineEmail[] = [];

          for (const [fromStageId, appIds] of applicationsByStage) {
            if (appIds.length === 0) continue;

            const nextStatus = statusForStageName(toStageName);

            for (const applicationId of appIds) {
              const appData = appDataById.get(applicationId);
              if (!appData) throw new Error("Application not found.");
              const [updated] = await tx
                .update(applications)
                .set({
                  currentStageId: input.toStageId,
                  status: nextStatus,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(applications.id, applicationId),
                    eq(applications.workspaceId, input.workspaceId),
                    eq(applications.updatedAt, appData.updatedAt),
                  ),
                )
                .returning({ id: applications.id });
              if (!updated) {
                throw new ConcurrencyConflictError(
                  "An application changed by another recruiter. Refresh and try again.",
                );
              }
              versionById.set(applicationId, now);
            }

            await tx.insert(applicationStageHistory).values(
              appIds.map((applicationId) => ({
                workspaceId: input.workspaceId,
                applicationId,
                fromStageId,
                toStageId: input.toStageId,
                movedById: user.id,
              })),
            );

            await tx.insert(activityEvents).values(
              appIds.map((applicationId) => ({
                workspaceId: input.workspaceId,
                actorId: user.id,
                entityType: "application" as const,
                entityId: applicationId,
                type: "stage.changed",
                metadata: {
                  fromStageId,
                  toStageId: input.toStageId,
                  bulk: true,
                  ...(nextStatus ? { status: nextStatus } : {}),
                },
              })),
            );

            for (const applicationId of appIds) {
              const appData = appDataById.get(applicationId);
              if (!appData) continue;

              const resolvedStatus = nextStatus;
              const becameRejected =
                appData.status !== "rejected" && resolvedStatus === "rejected";
              const becameHired =
                appData.status !== "hired" && resolvedStatus === "hired";

              stageEvents.push({
                applicationId,
                fromStageId,
                toStageId: input.toStageId,
                status: resolvedStatus,
                becameHired,
                becameRejected,
              });

              domainEvents.push(
                await persistDomainEvent(tx, {
                  name: "application.stage_changed",
                  workspaceId: input.workspaceId,
                  actorId: user.id,
                  aggregateType: "application",
                  aggregateId: applicationId,
                  payload: {
                    application: { id: applicationId },
                    fromStageId,
                    toStageId: input.toStageId,
                    status: resolvedStatus,
                  },
                }),
              );
              if (becameHired) {
                domainEvents.push(
                  await persistDomainEvent(tx, {
                    name: "application.hired",
                    workspaceId: input.workspaceId,
                    actorId: user.id,
                    aggregateType: "application",
                    aggregateId: applicationId,
                    payload: { application: { id: applicationId } },
                  }),
                );
              }
              if (becameRejected) {
                domainEvents.push(
                  await persistDomainEvent(tx, {
                    name: "application.rejected",
                    workspaceId: input.workspaceId,
                    actorId: user.id,
                    aggregateType: "application",
                    aggregateId: applicationId,
                    payload: { application: { id: applicationId } },
                  }),
                );
              }

              if (shouldNotifyPortalStatus && (becameRejected || becameHired)) {
                await tx.insert(candidatePortalNotifications).values({
                  workspaceId: input.workspaceId,
                  candidateId: appData.candidateId,
                  type: becameHired
                    ? "application_hired"
                    : "application_rejected",
                  title: becameHired
                    ? `Congratulations! You've been hired for ${appData.jobTitle}`
                    : `Application for ${appData.jobTitle} not selected`,
                  body: becameHired
                    ? "We're excited to have you on the team!"
                    : "We appreciate your interest and encourage you to apply for other roles.",
                  href: `/portal/applications/${applicationId}`,
                  metadata: {
                    applicationId,
                    status: resolvedStatus,
                  },
                });
              }

              const candidateName = `${appData.candidateFirstName} ${appData.candidateLastName}`;

              if (becameRejected) {
                collectedEmails.push({
                  type: "rejected",
                  applicationId: appData.id,
                  candidateEmail: appData.candidateEmail,
                  candidateName,
                  jobTitle: appData.jobTitle,
                  workspaceName: appData.workspaceName,
                });
              } else if (
                resolvedStatus === "active" &&
                stageEmailConfig.candidateUpdatesEnabled
              ) {
                collectedEmails.push({
                  type: "stage",
                  applicationId: appData.id,
                  candidateEmail: appData.candidateEmail,
                  candidateName,
                  jobTitle: appData.jobTitle,
                  stageName: toStageName,
                  workspaceName: appData.workspaceName,
                });
              }
            }
          }

          for (const [index, applicationId] of orderedIds.entries()) {
            const expectedVersion = versionById.get(applicationId);
            if (!expectedVersion) {
              throw new Error(
                "Application ordering changed. Refresh and try again.",
              );
            }
            const [updated] = await tx
              .update(applications)
              .set({ pipelineOrder: index + 1, updatedAt: now })
              .where(
                and(
                  eq(applications.id, applicationId),
                  eq(applications.workspaceId, input.workspaceId),
                  eq(applications.currentStageId, input.toStageId),
                  eq(applications.updatedAt, expectedVersion),
                ),
              )
              .returning({ id: applications.id });
            if (!updated) {
              throw new ConcurrencyConflictError(
                "Application ordering changed. Refresh and try again.",
              );
            }
            versionById.set(applicationId, now);
          }

          return collectedEmails;
        });
      },
      {
        onExhausted: (error, attempts) =>
          log.error(
            { error, attempts, workspaceId: input.workspaceId },
            "bulkMoveApplications exhausted concurrency retries",
          ),
      },
    );

    revalidatePath("/dashboard/pipeline");
    void sendPipelineEmails(input.workspaceId, emails, user.id);
    await publishPersistedDomainEvents(domainEvents);

    for (const evt of stageEvents) {
      void emitWebhookEvent(
        input.workspaceId,
        "application.stage_changed",
        {
          application: { id: evt.applicationId },
          fromStageId: evt.fromStageId,
          toStageId: input.toStageId,
          status: evt.status,
        },
        { actorId: user.id, skipDomainEvent: true },
      );
      if (evt.becameHired) {
        void emitWebhookEvent(
          input.workspaceId,
          "application.hired",
          {
            application: { id: evt.applicationId },
          },
          { actorId: user.id, skipDomainEvent: true },
        );
      }
      if (evt.becameRejected) {
        void emitWebhookEvent(
          input.workspaceId,
          "application.rejected",
          {
            application: { id: evt.applicationId },
          },
          { actorId: user.id, skipDomainEvent: true },
        );
      }
    }

    return { success: true };
  } catch (error) {
    log.error(error, "bulkMoveApplications failed");
    return { success: false, error: "Unable to move applications." };
  }
}

export async function updateApplicationStatus(
  input: UpdateApplicationStatusInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (
      !input ||
      !Array.isArray(input.applicationIds) ||
      input.applicationIds.length === 0 ||
      input.applicationIds.length > 100 ||
      new Set(input.applicationIds).size !== input.applicationIds.length ||
      !["active", "hired", "rejected", "withdrawn"].includes(input.status)
    ) {
      return { success: false, error: "Invalid application status request." };
    }

    await requirePermission("candidates:edit");
    const { organization: workspace, user } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    let applicationRows = await getApplicationsForAction(
      input.applicationIds,
      input.workspaceId,
    );
    const applicationIds = applicationRows.map((application) => application.id);

    if (applicationIds.length !== input.applicationIds.length) {
      return {
        success: false,
        error: "One or more applications were not found.",
      };
    }

    const [portalSettings] = await db
      .select({
        showApplicationStatus: workspaceSettings.portalShowApplicationStatus,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, input.workspaceId))
      .limit(1);
    const shouldNotifyStatus = portalSettings?.showApplicationStatus !== false;

    const stageEvents: StageTransitionEvent[] = [];
    const statusEvents: string[] = [];
    const domainEvents: PersistedDomainEvent[] = [];
    const emails = await withConcurrencyRetry(
      async () => {
        applicationRows = await getApplicationsForAction(
          input.applicationIds,
          input.workspaceId,
        );
        if (applicationRows.length !== input.applicationIds.length) {
          throw new Error("One or more applications were not found.");
        }
        stageEvents.length = 0;
        statusEvents.length = 0;
        domainEvents.length = 0;
        return db.transaction<PipelineEmail[]>(async (tx) => {
          const now = new Date();
          const collectedEmails: PipelineEmail[] = [];

          for (const application of applicationRows) {
            let targetStageId = application.currentStageId;
            let targetStage: {
              id: string;
              name: string;
              emailConfig: unknown;
            } | null = null;

            const terminalStageName = terminalStageNameForStatus(input.status);
            if (terminalStageName) {
              const [terminalStage] = await tx
                .select({
                  id: jobStages.id,
                  name: jobStages.name,
                  emailConfig: jobStages.emailConfig,
                })
                .from(jobStages)
                .where(
                  and(
                    eq(jobStages.workspaceId, input.workspaceId),
                    eq(jobStages.jobId, application.jobId),
                    eq(jobStages.name, terminalStageName),
                  ),
                )
                .limit(1);
              targetStage = terminalStage ?? null;
              if (targetStage) targetStageId = targetStage.id;
            } else if (input.status === "active") {
              const [currentStage] = await tx
                .select({
                  id: jobStages.id,
                  name: jobStages.name,
                  emailConfig: jobStages.emailConfig,
                })
                .from(jobStages)
                .where(
                  and(
                    eq(jobStages.workspaceId, input.workspaceId),
                    eq(jobStages.jobId, application.jobId),
                    eq(jobStages.id, application.currentStageId),
                  ),
                )
                .limit(1);

              if (
                currentStage &&
                statusForStageName(currentStage.name) !== "active"
              ) {
                const [previousStage] = await tx
                  .select({ fromStageId: applicationStageHistory.fromStageId })
                  .from(applicationStageHistory)
                  .where(
                    and(
                      eq(
                        applicationStageHistory.workspaceId,
                        input.workspaceId,
                      ),
                      eq(applicationStageHistory.applicationId, application.id),
                      eq(
                        applicationStageHistory.toStageId,
                        application.currentStageId,
                      ),
                      isNotNull(applicationStageHistory.fromStageId),
                    ),
                  )
                  .orderBy(
                    desc(applicationStageHistory.createdAt),
                    desc(applicationStageHistory.id),
                  )
                  .limit(1);

                targetStageId =
                  previousStage?.fromStageId ?? application.currentStageId;
                if (targetStageId === application.currentStageId) {
                  const [firstStage] = await tx
                    .select({
                      id: jobStages.id,
                      name: jobStages.name,
                      emailConfig: jobStages.emailConfig,
                    })
                    .from(jobStages)
                    .where(
                      and(
                        eq(jobStages.workspaceId, input.workspaceId),
                        eq(jobStages.jobId, application.jobId),
                      ),
                    )
                    .orderBy(asc(jobStages.order))
                    .limit(1);
                  targetStageId = firstStage?.id ?? targetStageId;
                  targetStage = firstStage ?? null;
                } else {
                  const [previousStageDetails] = await tx
                    .select({
                      id: jobStages.id,
                      name: jobStages.name,
                      emailConfig: jobStages.emailConfig,
                    })
                    .from(jobStages)
                    .where(
                      and(
                        eq(jobStages.workspaceId, input.workspaceId),
                        eq(jobStages.jobId, application.jobId),
                        eq(jobStages.id, targetStageId),
                      ),
                    )
                    .limit(1);
                  targetStage = previousStageDetails ?? null;
                }
              }
            }

            const stageChanged = targetStageId !== application.currentStageId;
            const statusChanged = application.status !== input.status;
            if (!stageChanged && !statusChanged) continue;

            const [updated] = await tx
              .update(applications)
              .set({
                status: input.status,
                currentStageId: targetStageId,
                updatedAt: now,
              })
              .where(
                and(
                  eq(applications.workspaceId, input.workspaceId),
                  eq(applications.id, application.id),
                  eq(applications.updatedAt, application.updatedAt),
                ),
              )
              .returning({ id: applications.id });

            if (!updated) {
              throw new ConcurrencyConflictError();
            }

            if (stageChanged) {
              await tx.insert(applicationStageHistory).values({
                workspaceId: input.workspaceId,
                applicationId: application.id,
                fromStageId: application.currentStageId,
                toStageId: targetStageId,
                movedById: user.id,
              });
              await tx.insert(activityEvents).values({
                workspaceId: input.workspaceId,
                actorId: user.id,
                entityType: "application",
                entityId: application.id,
                type: "stage.changed",
                metadata: {
                  fromStageId: application.currentStageId,
                  toStageId: targetStageId,
                  status: input.status,
                  source: "status_change",
                },
              });
              stageEvents.push({
                applicationId: application.id,
                fromStageId: application.currentStageId,
                toStageId: targetStageId,
                status: input.status,
                becameHired:
                  application.status !== "hired" && input.status === "hired",
                becameRejected:
                  application.status !== "rejected" &&
                  input.status === "rejected",
              });
              domainEvents.push(
                await persistDomainEvent(tx, {
                  name: "application.stage_changed",
                  workspaceId: input.workspaceId,
                  actorId: user.id,
                  aggregateType: "application",
                  aggregateId: application.id,
                  payload: {
                    application: { id: application.id },
                    fromStageId: application.currentStageId,
                    toStageId: targetStageId,
                    status: input.status,
                  },
                }),
              );
            }

            if (statusChanged) {
              statusEvents.push(application.id);
              if (input.status === "hired" || input.status === "rejected") {
                domainEvents.push(
                  await persistDomainEvent(tx, {
                    name:
                      input.status === "hired"
                        ? "application.hired"
                        : "application.rejected",
                    workspaceId: input.workspaceId,
                    actorId: user.id,
                    aggregateType: "application",
                    aggregateId: application.id,
                    payload: { application: { id: application.id } },
                  }),
                );
              }
              await tx.insert(activityEvents).values({
                workspaceId: input.workspaceId,
                actorId: user.id,
                entityType: "application",
                entityId: application.id,
                type: `application.${input.status}`,
                metadata: { status: input.status },
              });

              if (
                shouldNotifyStatus &&
                (input.status === "hired" || input.status === "rejected")
              ) {
                await tx.insert(candidatePortalNotifications).values({
                  workspaceId: input.workspaceId,
                  candidateId: application.candidateId,
                  type:
                    input.status === "hired"
                      ? "application_hired"
                      : "application_rejected",
                  title:
                    input.status === "hired"
                      ? `Congratulations! You've been hired for ${application.jobTitle}`
                      : `Application for ${application.jobTitle} not selected`,
                  body:
                    input.status === "hired"
                      ? "We're excited to have you on the team!"
                      : "We appreciate your interest and encourage you to apply for other roles.",
                  href: `/portal/applications/${application.id}`,
                  metadata: {
                    applicationId: application.id,
                    status: input.status,
                  },
                });
              }
            }

            if (input.status === "rejected" && statusChanged) {
              collectedEmails.push({
                type: "rejected",
                applicationId: application.id,
                candidateEmail: application.candidateEmail,
                candidateName: `${application.candidateFirstName} ${application.candidateLastName}`,
                jobTitle: application.jobTitle,
                workspaceName: application.workspaceName,
              });
            } else if (
              stageChanged &&
              input.status === "active" &&
              targetStage &&
              normalizeStageEmailConfig(targetStage.emailConfig)
                .candidateUpdatesEnabled
            ) {
              collectedEmails.push({
                type: "stage",
                applicationId: application.id,
                candidateEmail: application.candidateEmail,
                candidateName: `${application.candidateFirstName} ${application.candidateLastName}`,
                jobTitle: application.jobTitle,
                stageName: targetStage.name,
                workspaceName: application.workspaceName,
              });
            }
          }

          return collectedEmails;
        });
      },
      {
        onExhausted: (error, attempts) =>
          log.error(
            { error, attempts, workspaceId: input.workspaceId },
            "updateApplicationStatus exhausted concurrency retries",
          ),
      },
    );

    revalidatePath("/dashboard/pipeline");
    await publishPersistedDomainEvents(domainEvents);

    for (const applicationId of statusEvents) {
      if (input.status === "hired") {
        void emitWebhookEvent(
          input.workspaceId,
          "application.hired",
          {
            application: { id: applicationId },
          },
          { actorId: user.id, skipDomainEvent: true },
        );
      } else if (input.status === "rejected") {
        void emitWebhookEvent(
          input.workspaceId,
          "application.rejected",
          {
            application: { id: applicationId },
          },
          { actorId: user.id, skipDomainEvent: true },
        );
      }
    }
    for (const event of stageEvents) {
      void emitWebhookEvent(
        input.workspaceId,
        "application.stage_changed",
        {
          application: { id: event.applicationId },
          fromStageId: event.fromStageId,
          toStageId: event.toStageId,
          status: event.status,
        },
        { actorId: user.id, skipDomainEvent: true },
      );
    }
    void sendPipelineEmails(input.workspaceId, emails, user.id);

    return { success: true };
  } catch (error) {
    log.error(error, "updateApplicationStatus failed");
    return { success: false, error: "Unable to update status." };
  }
}

export async function updateStageEmailSettings(
  input: UpdateStageEmailSettingsInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission("settings:edit");
    const { organization: workspace } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    const [updatedStage] = await db
      .update(jobStages)
      .set({
        emailConfig: {
          candidateUpdatesEnabled: input.candidateUpdatesEnabled,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobStages.id, input.stageId),
          eq(jobStages.workspaceId, input.workspaceId),
          eq(jobStages.jobId, input.jobId),
        ),
      )
      .returning({ id: jobStages.id });

    if (!updatedStage) {
      return { success: false, error: "Stage not found." };
    }

    revalidatePath("/dashboard/pipeline");

    return { success: true };
  } catch (error) {
    log.error(error, "updateStageEmailSettings failed");
    return { success: false, error: "Unable to update stage email." };
  }
}
