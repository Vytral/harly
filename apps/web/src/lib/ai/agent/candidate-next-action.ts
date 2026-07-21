import "server-only";

import { getNextStage } from "@/features/pipeline/data";
import { resolveCandidateApplication } from "./application-resolution";

export type CandidateNextAction =
  | {
      status: "ready";
      candidateId: string;
      application: {
        applicationId: string;
        jobId: string;
        job: string;
        currentStage: string | null;
        currentStageId: string | null;
        nextStage: { id: string; name: string; order: number };
      };
    }
  | {
      status: "terminal";
      candidateId: string;
      application: {
        applicationId: string;
        jobId: string;
        job: string;
        currentStage: string | null;
        currentStageId: string | null;
      };
    }
  | {
      status: "ambiguous" | "not_found";
      candidateId: string;
      reason: string;
      applications?: unknown[];
    };

/** Resolve the role and next valid stage in one read-only operation. */
export async function resolveCandidateNextAction(input: {
  candidateId: string;
  jobQuery?: string | null;
  applicationId?: string | null;
}): Promise<CandidateNextAction> {
  const resolution = await resolveCandidateApplication(input);
  if (resolution.status !== "resolved") {
    return {
      status: resolution.status,
      candidateId: input.candidateId,
      reason:
        resolution.status === "ambiguous"
          ? "application_required"
          : resolution.reason,
      ...(resolution.status === "ambiguous"
        ? { applications: resolution.applications }
        : {}),
    };
  }

  const application = resolution.application;
  const nextStage = await getNextStage(
    application.jobId,
    application.currentStageId ?? null,
  );
  const current = {
    applicationId: application.applicationId,
    jobId: application.jobId,
    job: application.job,
    currentStage: application.stage,
    currentStageId: application.currentStageId ?? null,
  };

  return nextStage
    ? {
        status: "ready",
        candidateId: input.candidateId,
        application: { ...current, nextStage },
      }
    : { status: "terminal", candidateId: input.candidateId, application: current };
}
