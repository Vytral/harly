import "server-only";

import { getCandidateProfile } from "@/features/candidates/data";
import {
  rankApplicationMatches,
  type ApplicationSearchItem,
} from "./application-resolution-matching";

export type ApplicationResolution =
  | {
      status: "resolved";
      candidateId: string;
      application: ApplicationSearchItem;
      reason: "explicit_id" | "only_active" | "only_application" | "job_match";
    }
  | {
      status: "ambiguous";
      candidateId: string;
      applications: ApplicationSearchItem[];
    }
  | {
      status: "not_found";
      candidateId: string;
      reason: "candidate_not_found" | "application_not_found" | "job_not_found";
    };

function compactApplication(application: {
  id: string;
  jobId: string;
	jobTitle: string;
	currentStageId: string | null;
	currentStageName: string | null;
  status: string;
}): ApplicationSearchItem {
  return {
    applicationId: application.id,
    jobId: application.jobId,
    currentStageId: application.currentStageId,
    job: application.jobTitle,
    stage: application.currentStageName,
    status: application.status,
    isActive: application.status === "active",
  };
}

/**
 * Select the application a human phrase refers to. The candidate profile is
 * the server-scoped adapter; this module owns the ambiguity and default rules.
 */
export async function resolveCandidateApplication(input: {
  candidateId: string;
  jobQuery?: string | null;
  applicationId?: string | null;
}): Promise<ApplicationResolution> {
  const profile = await getCandidateProfile(input.candidateId);
  if (!profile) {
    return {
      status: "not_found",
      candidateId: input.candidateId,
      reason: "candidate_not_found",
    };
  }

  const applications = profile.applications.map(compactApplication);
  if (input.applicationId) {
    const application = applications.find(
      (candidateApplication) =>
        candidateApplication.applicationId === input.applicationId,
    );
    return application
      ? {
          status: "resolved",
          candidateId: input.candidateId,
          application,
          reason: "explicit_id",
        }
      : {
          status: "not_found",
          candidateId: input.candidateId,
          reason: "application_not_found",
        };
  }

  const activeApplications = applications.filter(
    (application) => application.isActive,
  );
  if (!input.jobQuery) {
    if (activeApplications.length === 1) {
      return {
        status: "resolved",
        candidateId: input.candidateId,
        application: activeApplications[0],
        reason: "only_active",
      };
    }
    if (activeApplications.length > 1) {
      return {
        status: "ambiguous",
        candidateId: input.candidateId,
        applications: activeApplications,
      };
    }
    if (applications.length === 1) {
      return {
        status: "resolved",
        candidateId: input.candidateId,
        application: applications[0],
        reason: "only_application",
      };
    }
    return {
      status: "ambiguous",
      candidateId: input.candidateId,
      applications,
    };
  }

  const matches = rankApplicationMatches(input.jobQuery, applications);
  const [top, second] = matches;
  if (!top) {
    return {
      status: "not_found",
      candidateId: input.candidateId,
      reason: "job_not_found",
    };
  }
  if (
    second &&
    top.score === second.score &&
    top.reason === "exact_job" &&
    second.reason === "exact_job"
  ) {
    return {
      status: "ambiguous",
      candidateId: input.candidateId,
      applications: matches.map((match) => match.application),
    };
  }

  return {
    status: "resolved",
    candidateId: input.candidateId,
    application: top.application,
    reason: "job_match",
  };
}
