import { normalizeCandidateReference } from "./candidate-resolution-matching";

export type ApplicationSearchItem = {
  applicationId: string;
  jobId: string;
  currentStageId?: string | null;
  job: string;
  stage: string | null;
  status: string;
  isActive: boolean;
};

export type ApplicationMatch = {
  application: ApplicationSearchItem;
  score: number;
  reason: "exact_job" | "job_tokens" | "job_prefix" | "partial_job";
};

function tokens(value: string): string[] {
  return normalizeCandidateReference(value).split(/[\s.-]+/).filter(Boolean);
}

function scoreApplication(
  query: string,
  application: ApplicationSearchItem,
): ApplicationMatch {
  const normalizedQuery = normalizeCandidateReference(query);
  const normalizedJob = normalizeCandidateReference(application.job);
  const queryTokens = tokens(query);
  const jobTokens = tokens(application.job);

  if (normalizedJob === normalizedQuery) {
    return { application, score: 0.99, reason: "exact_job" };
  }

  if (
    queryTokens.length > 1 &&
    queryTokens.every((token) =>
      jobTokens.some((jobToken) => jobToken.startsWith(token)),
    )
  ) {
    return { application, score: 0.94, reason: "job_tokens" };
  }

  if (normalizedJob.startsWith(normalizedQuery)) {
    return { application, score: 0.86, reason: "job_prefix" };
  }

  return {
    application,
    score: normalizedJob.includes(normalizedQuery) ? 0.62 : 0,
    reason: "partial_job",
  };
}

export function rankApplicationMatches(
  query: string,
  applications: ApplicationSearchItem[],
): ApplicationMatch[] {
  return applications
    .map((application) => scoreApplication(query, application))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
}
