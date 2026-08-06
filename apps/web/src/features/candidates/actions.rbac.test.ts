import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  requireCandidatePermission: vi.fn(),
  requirePermission: vi.fn(),
  requireJobPermission: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {},
  activityEvents: {},
  applications: {},
  candidates: {},
  candidateFiles: {},
  candidateNotes: {},
  candidateTags: {},
  jobStages: {},
  jobs: {},
  member: {},
  notifications: {},
  scorecards: {},
  mailMessages: {},
  mailThreads: {},
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: vi.fn(),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireCandidatePermission: mocks.requireCandidatePermission,
  requirePermission: mocks.requirePermission,
  requireJobPermission: mocks.requireJobPermission,
}));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: vi.fn() }));
vi.mock("@/lib/ai/surfaces/parse-resume", () => ({
  parseResumeStructured: vi.fn(),
}));
vi.mock("@/features/mailbox/compose-shared", () => ({
  composerAttachmentsSchema: z.array(z.unknown()).optional(),
  decodeComposerAttachments: vi.fn(),
  richBodyReact: vi.fn(),
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/email", () => ({ getWorkspaceEmailSender: vi.fn() }));
vi.mock("@/lib/email/inbound-token", () => ({ getInboundReplyTo: vi.fn() }));
vi.mock("@/lib/mail/canonical", () => ({ insertCanonicalMessage: vi.fn() }));
vi.mock("@/lib/mail/send-canonical-email", () => ({ sendCanonicalEmail: vi.fn() }));
vi.mock("@/lib/mail/feature-flag", () => ({ isMailUnificationEnabled: vi.fn() }));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("./service", () => ({ serializeCandidate: vi.fn() }));
vi.mock("./referrals/service", () => ({
  createReferralRecord: vi.fn(),
  serializeReferral: vi.fn(),
}));
vi.mock("@/features/pipeline/actions", () => ({ updateApplicationStatus: vi.fn() }));
vi.mock("./data", () => ({
  permanentlyDeleteCandidate: vi.fn(),
  deleteCandidate: vi.fn(),
  restoreCandidate: vi.fn(),
  listCandidateDirectory: vi.fn(),
}));
vi.mock("@/lib/csv", () => ({ toSafeCsv: vi.fn() }));
vi.mock("@/lib/storage-validation", () => ({
  allowedResumeContentTypes: new Set(),
  maxResumeFileSize: 1,
  isWorkspaceStorageKey: vi.fn(),
}));
vi.mock("@/features/applications/resume-autofill", () => ({
  extractResumeAutofillFields: vi.fn(),
}));
vi.mock("@/lib/resume/extract-text", () => ({ extractResumeText: vi.fn() }));
vi.mock("@/lib/resume/storage-key", () => ({ resumeKeyFromUrl: vi.fn() }));
vi.mock("./create-candidate-errors", () => ({ isCandidateEmailConflict: vi.fn() }));
vi.mock("@/lib/storage", () => ({ storage: {} }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("./deletion-jobs", () => ({
  enqueueCandidateDeletionJob: vi.fn(),
  markCandidateDeletionBlocked: vi.fn(),
  markCandidateDeletionCompleted: vi.fn(),
  markCandidateDeletionFailed: vi.fn(),
  requeueCandidateDeletionJob: vi.fn(),
  startCandidateDeletionJob: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  generateEmailDraftAction,
  refineScorecardTextAction,
  suggestScorecardAttributesAction,
} from "./actions";

describe("candidate AI authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCandidatePermission.mockRejectedValue(
      new Error("You do not have access to this candidate."),
    );
  });

  it("authorizes the candidate before generating an email draft", async () => {
    await expect(
      generateEmailDraftAction({ candidateId: "candidate-1", type: "followup" }),
    ).rejects.toThrow("You do not have access to this candidate.");
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "collab:write",
      "candidate-1",
    );
  });

  it("authorizes the candidate before refining scorecard text", async () => {
    await expect(
      refineScorecardTextAction({ comment: "Private note", candidateId: "candidate-1" }),
    ).rejects.toThrow("You do not have access to this candidate.");
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "collab:write",
      "candidate-1",
    );
  });

  it("authorizes the candidate before suggesting scorecard attributes", async () => {
    await expect(
      suggestScorecardAttributesAction({ candidateId: "candidate-1" }),
    ).rejects.toThrow("You do not have access to this candidate.");
    expect(mocks.requireCandidatePermission).toHaveBeenCalledWith(
      "collab:write",
      "candidate-1",
    );
  });
});
