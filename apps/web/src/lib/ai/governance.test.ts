import { describe, expect, it, vi } from "vitest";

const { logAuditEvent } = vi.hoisted(() => ({ logAuditEvent: vi.fn() }));

vi.mock("@/lib/audit-log", () => ({ logAuditEvent }));

import { logAiCandidateDecision } from "./governance";

describe("AI governance audit logging", () => {
  it("stores decision metadata and fingerprints, never raw input or output", async () => {
    await logAiCandidateDecision({
      workspaceId: "workspace-1",
      candidateId: "candidate-1",
      applicationId: "application-1",
      jobId: "job-1",
      provider: "openai",
      modelId: "gpt-test",
      inputFingerprintSource: { resume: "private resume", answer: "private answer" },
      outputFingerprintSource: { summary: "private generated summary", score: 72 },
      inputSummary: { usedResume: true, answerCount: 1, skillsCount: 3 },
      outputSummary: { score: 72, recommendation: "yes", criteriaCount: 2 },
    });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.candidate_evaluation.generated",
        resourceId: "application-1",
        metadata: expect.objectContaining({
          humanReviewRequired: true,
          decisionAutomation: "advisory_only",
          input: expect.objectContaining({
            fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
          output: expect.objectContaining({
            fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
            score: 72,
          }),
        }),
      }),
    );

    expect(JSON.stringify(logAuditEvent.mock.calls[0])).not.toContain("private resume");
    expect(JSON.stringify(logAuditEvent.mock.calls[0])).not.toContain("private generated summary");
  });
});
