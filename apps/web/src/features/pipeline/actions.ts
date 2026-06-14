"use server";

import { revalidatePath } from "next/cache";
import { createElement } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  CandidateRejected,
  CandidateStageUpdate,
  candidateRejectedSubject,
  candidateStageUpdateSubject,
} from "@harly/emails";

import { db } from "@harly/db";
import {
  activityEvents,
  applications,
  applicationStageHistory,
  candidates,
  jobs,
  jobStages,
  organization,
} from "@harly/db";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { sendWorkspaceEmail } from "@/lib/email";
import { emitWebhookEvent } from "@/server/webhooks/emit";

type ApplicationStatus = "active" | "hired" | "rejected" | "withdrawn";

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
  stageId: string;
  candidateUpdatesEnabled: boolean;
};

type PipelineEmail =
  | {
      type: "stage";
      candidateEmail: string;
      candidateName: string;
      jobTitle: string;
      stageName: string;
      workspaceName: string;
    }
  | {
      type: "rejected";
      candidateEmail: string;
      candidateName: string;
      jobTitle: string;
      workspaceName: string;
    };

function normalizeStageEmailConfig(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "candidateUpdatesEnabled" in value &&
    typeof value.candidateUpdatesEnabled === "boolean"
  ) {
    return {
      candidateUpdatesEnabled: value.candidateUpdatesEnabled,
    };
  }

  return { candidateUpdatesEnabled: true };
}

async function sendPipelineEmails(workspaceId: string, emails: PipelineEmail[]) {
  await Promise.allSettled(
    emails.map((email) => {
      if (email.type === "stage") {
        return sendWorkspaceEmail(workspaceId, {
          to: email.candidateEmail,
          subject: candidateStageUpdateSubject({
            jobTitle: email.jobTitle,
          }),
          react: createElement(CandidateStageUpdate, {
            candidateName: email.candidateName,
            jobTitle: email.jobTitle,
            stageName: email.stageName,
            companyName: email.workspaceName,
          }),
        });
      }

      return sendWorkspaceEmail(workspaceId, {
        to: email.candidateEmail,
        subject: candidateRejectedSubject({
          jobTitle: email.jobTitle,
        }),
        react: createElement(CandidateRejected, {
          candidateName: email.candidateName,
          jobTitle: email.jobTitle,
          companyName: email.workspaceName,
        }),
      });
    }),
  );
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
      currentStageId: applications.currentStageId,
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
    .innerJoin(jobs, and(eq(jobs.workspaceId, workspaceId), eq(jobs.id, applications.jobId)))
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
  try {
    const { organization: workspace, user } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    // Captured inside the transaction, emitted after commit (see data.ts note).
    const stageEvent: {
      current: { status: ApplicationStatus; becameRejected: boolean } | null;
    } = { current: null };

    const emails = await db.transaction<PipelineEmail[]>(async (tx) => {
      const [application] = await tx
        .select({
          id: applications.id,
          currentStageId: applications.currentStageId,
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
          ),
        )
        .innerJoin(organization, eq(organization.id, applications.workspaceId))
        .innerJoin(
          jobStages,
          and(
            eq(jobStages.workspaceId, input.workspaceId),
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

      if (!application) {
        throw new Error("Application not found.");
      }

      const now = new Date();
      const changedStage = application.currentStageId !== input.toStageId;
      const nextStatus =
        application.toStageName.toLowerCase() === "rejected"
          ? "rejected"
          : application.status;

      await tx
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
          ),
        );

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

        for (const [index, applicationId] of input.orderedApplicationIds.entries()) {
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

      if (!changedStage) {
        return [];
      }

      await tx.insert(applicationStageHistory).values({
        workspaceId: input.workspaceId,
        applicationId: input.applicationId,
        fromStageId: input.fromStageId,
        toStageId: input.toStageId,
        movedById: user.id,
      });

      stageEvent.current = {
        status: nextStatus,
        becameRejected: application.status === "active" && nextStatus === "rejected",
      };

      await tx.insert(activityEvents).values({
        workspaceId: input.workspaceId,
        actorId: user.id,
        entityType: "application",
        entityId: input.applicationId,
        type: "stage.changed",
        metadata: {
          fromStageId: input.fromStageId,
          toStageId: input.toStageId,
          status: nextStatus,
        },
      });

      const candidateName = `${application.candidateFirstName} ${application.candidateLastName}`;
      const stageEmailConfig = normalizeStageEmailConfig(
        application.toStageEmailConfig,
      );

      if (application.status === "active" && nextStatus === "rejected") {
        return [
          {
            type: "rejected",
            candidateEmail: application.candidateEmail,
            candidateName,
            jobTitle: application.jobTitle,
            workspaceName: application.workspaceName,
          },
        ];
      }

      if (nextStatus === "active" && stageEmailConfig.candidateUpdatesEnabled) {
        return [
          {
            type: "stage",
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

    revalidatePath("/dashboard/pipeline");
    void sendPipelineEmails(input.workspaceId, emails);

    if (stageEvent.current) {
      await emitWebhookEvent(input.workspaceId, "application.stage_changed", {
        application: { id: input.applicationId },
        fromStageId: input.fromStageId,
        toStageId: input.toStageId,
        status: stageEvent.current.status,
      });
      if (stageEvent.current.becameRejected) {
        await emitWebhookEvent(input.workspaceId, "application.rejected", {
          application: { id: input.applicationId },
        });
      }
    }

    return { success: true };
  } catch (error) {
    const message =
      "Unable to move application.";

    console.error("Failed to move application in pipeline", error);

    return { success: false, error: message };
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
    const { organization: workspace, user } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    await db.transaction(async (tx) => {
      const targetStageApplications = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            eq(applications.currentStageId, input.toStageId),
          ),
        )
        .orderBy(asc(applications.pipelineOrder), asc(applications.appliedAt));
      const existingIds = new Set(targetStageApplications.map((item) => item.id));
      const orderedIds = [
        ...targetStageApplications.map((item) => item.id),
        ...input.applicationIds.filter((id) => !existingIds.has(id)),
      ];
      const now = new Date();

      const allApplications = await tx
        .select({ id: applications.id, currentStageId: applications.currentStageId })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            inArray(applications.id, input.applicationIds),
          ),
        );

      const applicationsByStage = new Map<string, string[]>();
      const stageByApplication = new Map<string, string>();

      for (const app of allApplications) {
        if (app.currentStageId === input.toStageId) continue;
        stageByApplication.set(app.id, app.currentStageId);
        const stageApps = applicationsByStage.get(app.currentStageId) ?? [];
        stageApps.push(app.id);
        applicationsByStage.set(app.currentStageId, stageApps);
      }

      for (const [fromStageId, appIds] of applicationsByStage) {
        if (appIds.length === 0) continue;

        await tx
          .update(applications)
          .set({
            currentStageId: input.toStageId,
            updatedAt: now,
          })
          .where(
            and(
              inArray(applications.id, appIds),
              eq(applications.workspaceId, input.workspaceId),
            ),
          );

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
            },
          })),
        );
      }

      for (const [index, applicationId] of orderedIds.entries()) {
        await tx
          .update(applications)
          .set({ pipelineOrder: index + 1, updatedAt: now })
          .where(
            and(
              eq(applications.id, applicationId),
              eq(applications.workspaceId, input.workspaceId),
              eq(applications.currentStageId, input.toStageId),
            ),
          );
      }
    });

    revalidatePath("/dashboard/pipeline");

    return { success: true };
  } catch (error) {
    const message =
      "Unable to move applications.";

    console.error("Failed to bulk move applications", error);

    return { success: false, error: message };
  }
}

export async function updateApplicationStatus(
  input: UpdateApplicationStatusInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { organization: workspace, user } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    const applicationRows = await getApplicationsForAction(
      input.applicationIds,
      input.workspaceId,
    );
    const applicationIds = applicationRows.map((application) => application.id);

    if (applicationIds.length === 0) {
      return { success: false, error: "No applications selected." };
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(applications)
        .set({ status: input.status, updatedAt: now })
        .where(
          and(
            eq(applications.workspaceId, input.workspaceId),
            inArray(applications.id, applicationIds),
          ),
        );

      for (const applicationId of applicationIds) {
        await tx.insert(activityEvents).values({
          workspaceId: input.workspaceId,
          actorId: user.id,
          entityType: "application",
          entityId: applicationId,
          type: `application.${input.status}`,
          metadata: { status: input.status },
        });
      }
    });

    revalidatePath("/dashboard/pipeline");

    if (input.status === "rejected") {
      void sendPipelineEmails(
        input.workspaceId,
        applicationRows.map((application) => ({
          type: "rejected",
          candidateEmail: application.candidateEmail,
          candidateName: `${application.candidateFirstName} ${application.candidateLastName}`,
          jobTitle: application.jobTitle,
          workspaceName: application.workspaceName,
        })),
      );
    }

    return { success: true };
  } catch (error) {
    const message =
      "Unable to update status.";

    console.error("Failed to update application status", error);

    return { success: false, error: message };
  }
}

export async function updateStageEmailSettings(
  input: UpdateStageEmailSettingsInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { organization: workspace } = await getWorkspaceContext();

    if (workspace.id !== input.workspaceId) {
      return { success: false, error: "Workspace access denied." };
    }

    await db
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
        ),
      );

    revalidatePath("/dashboard/pipeline");

    return { success: true };
  } catch (error) {
    const message =
      "Unable to update stage email.";

    console.error("Failed to update stage email settings", error);

    return { success: false, error: message };
  }
}
