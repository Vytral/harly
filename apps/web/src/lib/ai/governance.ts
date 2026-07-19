import "server-only";

import { createHash } from "node:crypto";

import { logAuditEvent } from "@/lib/audit-log";

/**
 * Records an AI-assisted candidate evaluation without copying CVs, answers, or
 * generated prose into the audit trail. The fingerprints make a particular
 * input/output version traceable while keeping the audit log data-minimal.
 */
export async function logAiCandidateDecision(input: {
  workspaceId: string;
  candidateId: string;
  applicationId: string;
  jobId: string;
  provider: string;
  modelId: string;
  actor?: { id?: string; email?: string | null };
  /** Used only to create a one-way fingerprint; it is never persisted here. */
  inputFingerprintSource: unknown;
  /** Used only to create a one-way fingerprint; it is never persisted here. */
  outputFingerprintSource: unknown;
  inputSummary: {
    usedResume: boolean;
    answerCount: number;
    skillsCount: number;
  };
  outputSummary: {
    score: number;
    recommendation: string;
    criteriaCount: number;
  };
}): Promise<void> {
  await logAuditEvent({
    workspaceId: input.workspaceId,
    actorId: input.actor?.id,
    actorEmail: input.actor?.email ?? undefined,
    action: "ai.candidate_evaluation.generated",
    resourceType: "application",
    resourceId: input.applicationId,
    severity: "info",
    metadata: {
      governanceVersion: 1,
      purpose: "candidate_fit_evaluation",
      provider: input.provider,
      modelId: input.modelId,
      candidateId: input.candidateId,
      jobId: input.jobId,
      // Evaluations are advisory: a recruiter must review evidence before any
      // hiring decision. This is recorded alongside every generated output.
      humanReviewRequired: true,
      decisionAutomation: "advisory_only",
      input: {
        fingerprint: fingerprint(input.inputFingerprintSource),
        dataCategories: ["candidate_profile", "job_requirements", "application_answers"],
        ...input.inputSummary,
      },
      output: {
        fingerprint: fingerprint(input.outputFingerprintSource),
        ...input.outputSummary,
      },
    },
  });
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
