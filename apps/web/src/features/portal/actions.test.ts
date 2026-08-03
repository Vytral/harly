import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  dbSelect: vi.fn(),
  transaction: vi.fn(),
  resolvePortalSession: vi.fn(),
  validatePortalApplication: vi.fn(),
  verifyResumeUpload: vi.fn(),
  lockApplicationPipelineOrder: vi.fn(),
  persistDomainEvent: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
  emitWebhookEvent: vi.fn(),
  sendApplicationReceivedEmails: vi.fn(),
  getApplicationConflictMessage: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: vi.fn(),
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  count: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@harly/db", () => ({
  db: { select: mocks.dbSelect, transaction: mocks.transaction },
  applications: {},
  applicationStageHistory: {},
  activityEvents: {},
  applicationAnswers: {},
  applicationQuestions: {},
  candidateFiles: {},
  jobs: {},
  jobStages: {},
  offers: {},
  signatureRecipients: {},
  workspaceSettings: {},
  consentRecords: {},
  candidatePortalMagicLinks: {},
  member: {},
  organization: {},
  user: {},
}));
vi.mock("@/lib/portal-auth", () => ({
  PORTAL_SESSION_COOKIE: "portal-session",
  resolvePortalSession: mocks.resolvePortalSession,
}));
vi.mock("@/features/jobs/config", () => ({
  normalizeJobApplicationConfig: () => ({
    sections: { profile: { resume: { visibility: "optional" } } },
  }),
}));
vi.mock("@/features/portal/application-validation", () => ({
  validatePortalApplication: mocks.validatePortalApplication,
}));
vi.mock("@/features/applications/resume-upload", () => ({
  verifyResumeUpload: mocks.verifyResumeUpload,
}));
vi.mock("@/features/applications/pipeline-order", () => ({
  lockApplicationPipelineOrder: mocks.lockApplicationPipelineOrder,
}));
vi.mock("@/features/applications/data", () => ({
  getApplicationConflictMessage: mocks.getApplicationConflictMessage,
}));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: mocks.persistDomainEvent,
  publishPersistedDomainEvents: mocks.publishPersistedDomainEvents,
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: mocks.emitWebhookEvent,
}));
vi.mock("@/features/applications/notifications", () => ({
  sendApplicationReceivedEmails: mocks.sendApplicationReceivedEmails,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));
vi.mock("@harly/emails", () => ({}));
vi.mock("@/lib/email", () => ({ getWorkspaceEmailSender: vi.fn() }));

import { applyToJobAction } from "./actions";

function query(value: unknown) {
  const builder = new Proxy(
    function () {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (result: unknown) => void) => resolve(value);
        }
        return () => builder;
      },
      apply() {
        return builder;
      },
    },
  );
  return builder;
}

function makeTransaction() {
  const inserts: unknown[] = [];
  const values = [
    [{ value: 1 }],
    [{ id: "application-1" }],
    [],
    [],
    [],
    [],
  ];
  const builder = new Proxy(
    function () {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (result: unknown) => void) =>
            resolve(values.shift() ?? []);
        }
        if (property === "values") {
          return (value: unknown) => {
            inserts.push(value);
            return builder;
          };
        }
        return () => builder;
      },
      apply() {
        return builder;
      },
    },
  );
  return {
    inserts,
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    execute: vi.fn().mockResolvedValue([]),
  };
}

describe("applyToJobAction", () => {
  function seedDbSelects() {
    mocks.dbSelect
      .mockReturnValueOnce(query([
        {
          id: "job-1",
          title: "Engineer",
          status: "open",
          applicationConfig: { resumeRequired: false },
        },
      ]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ legalConfigured: false, consentCheckboxText: null }]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ id: "stage-1" }]))
      .mockReturnValueOnce(query([{ name: "Acme", slug: "acme" }]))
      .mockReturnValueOnce(query([]));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbSelect.mockReset();
    mocks.cookies.mockResolvedValue({
      get: () => ({ value: "session-token" }),
    });
    mocks.resolvePortalSession.mockResolvedValue({
      workspaceId: "workspace_1",
      candidateId: "candidate_1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    mocks.validatePortalApplication.mockReturnValue({ ok: true, answers: {} });
    mocks.verifyResumeUpload.mockResolvedValue(null);
    mocks.getApplicationConflictMessage.mockReturnValue(null);
    mocks.persistDomainEvent.mockResolvedValue({
      eventId: "event-1",
      eventName: "application.created",
      workspaceId: "workspace_1",
      payload: {},
    });
    seedDbSelects();
  });

  it("persists the same durable event and assigns portal source/order", async () => {
    const transaction = makeTransaction();
    mocks.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) =>
      callback(transaction),
    );

    const result = await applyToJobAction({
      jobId: "job-1",
      answers: {},
      consentGiven: false,
    });

    expect(result).toEqual({ ok: true, applicationId: "application-1" });
    expect(mocks.lockApplicationPipelineOrder).toHaveBeenCalledWith(
      transaction,
      "workspace_1",
      "stage-1",
    );
    expect(mocks.persistDomainEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        name: "application.created",
        workspaceId: "workspace_1",
        aggregateId: "application-1",
        payload: expect.objectContaining({
          candidate: expect.objectContaining({ name: "Ada Lovelace" }),
        }),
      }),
    );
    expect(mocks.publishPersistedDomainEvents).toHaveBeenCalledWith([
      expect.objectContaining({ eventId: "event-1" }),
    ]);
    expect(mocks.emitWebhookEvent).toHaveBeenCalledWith(
      "workspace_1",
      "application.created",
      expect.any(Object),
      { skipDomainEvent: true, eventId: "event-1" },
    );
    expect(transaction.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "portal",
          pipelineOrder: 1,
        }),
      ]),
    );
  });

  it("turns a duplicate race into the known conflict result", async () => {
    seedDbSelects();
    const tx = makeTransaction();
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "applications_workspace_candidate_job_idx",
    });
    mocks.transaction.mockRejectedValue(duplicate);
    mocks.getApplicationConflictMessage.mockReturnValue(
      "You have already applied to this job.",
    );

    await expect(
      applyToJobAction({ jobId: "job-1", answers: {} }),
    ).resolves.toEqual({
      ok: false,
      error: "You have already applied to this job.",
    });
    expect(tx).toBeDefined();
  });

  it("does not bypass a required resume when the storage object is absent", async () => {
    mocks.dbSelect.mockReset();
    mocks.dbSelect
      .mockReturnValueOnce(query([
        {
          id: "job-1",
          title: "Engineer",
          status: "open",
          applicationConfig: { resumeRequired: true },
        },
      ]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ legalConfigured: false }]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ id: "stage-1" }]));
    mocks.validatePortalApplication.mockReturnValue({ ok: true, answers: {} });

    await expect(
      applyToJobAction({
        jobId: "job-1",
        answers: {},
        resumeKey: "workspaces/workspace_1/resumes/upload/cv.pdf",
      }),
    ).resolves.toEqual({ ok: false, error: "Resume upload is invalid." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("waits for the durable email enqueue before returning success", async () => {
    const transaction = makeTransaction();
    let release: (() => void) | undefined;
    mocks.sendApplicationReceivedEmails.mockImplementation(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    mocks.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) =>
      callback(transaction),
    );

    let settled = false;
    const resultPromise = applyToJobAction({ jobId: "job-1", answers: {} }).then(
      (result) => {
        settled = true;
        return result;
      },
    );

    await vi.waitFor(() => expect(mocks.sendApplicationReceivedEmails).toHaveBeenCalled());
    expect(settled).toBe(false);
    release?.();
    await expect(resultPromise).resolves.toEqual({
      ok: true,
      applicationId: "application-1",
    });
  });
});
