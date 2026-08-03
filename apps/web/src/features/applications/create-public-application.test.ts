import { beforeEach, describe, expect, it, vi } from "vitest";

// F1-07: a re-application must be detected as a duplicate BEFORE the existing
// candidate's contact/profile fields are overwritten. A retry must never clobber
// a candidate just because the new application itself is rejected.

const mocks = vi.hoisted(() => {
  const transactionImpl = vi.fn();
  const selectImpl = vi.fn();
  const storageRead = vi.fn();
  return { transactionImpl, selectImpl, storageRead };
});

vi.mock("@harly/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transactionImpl(fn),
    select: () => mocks.selectImpl(),
  },
  // auth.ts (imported transitively) wires drizzleAdapter(db, { schema }),
  // so the mock must surface a `schema` export or vitest throws on import.
  schema: {},
  applications: {},
  candidates: {},
  jobs: {},
  jobStages: {},
  organization: {},
  applicationQuestions: {},
  applicationAnswers: {},
  applicationStageHistory: {},
  candidateFiles: {},
  activityEvents: {},
  consentRecords: {},
  // Export names (not local aliases): data.ts imports `member as authMembers`
  // and `user as authUsers`; workspaces/context imports `member`/`organization`.
  member: {},
  user: {},
  workspaceSettings: {},
}));
vi.mock("@/lib/storage", () => ({
  storage: { read: mocks.storageRead },
}));

vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("@/features/jobs/data", () => ({
  publicJobVisibilityConditions: () => undefined,
}));

// data.ts -> jobs/data -> workspaces/context -> @/lib/auth -> @harly/auth,
// which calls loadHarlyConfig() at module load. In CI without HARLY_URL set
// that throws, so stub the config module before the import chain runs.
vi.mock("@harly/config", () => ({
  loadHarlyConfig: () => ({ HARLY_URL: "https://test.local" }),
  formatConfigError: () => "config error",
}));

import {
  createPublicApplication,
  getApplicationConflictMessage,
  getPublicJobApplicationContext,
} from "./data";

function makeTx(queue: unknown[]) {
  const calls = { select: 0, update: 0, insert: 0 };
  // Every query method returns a thenable that pops the shared queue in call
  // order, so the result of each `await` matches the order the action issues
  // them. Chaining methods return the same runnable.
  const runnable = new Proxy(
    function () {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(queue.shift());
        return () => runnable;
      },
      apply() {
        return runnable;
      },
    },
  );
  const tx = {
    select: () => {
      calls.select += 1;
      return runnable;
    },
    update: () => {
      calls.update += 1;
      return runnable;
    },
    insert: () => {
      calls.insert += 1;
      return runnable;
    },
  };
  return { tx, calls };
}

const JOB = {
  id: "job-1",
  title: "Engineer",
  workspaceId: "ws-1",
  applicationConfig: { resumeRequired: false },
};
const ORG = { name: "Acme", slug: "acme", portalEnabled: false };
const EXISTING_CANDIDATE = { id: "cand-1" };
const EXISTING_APPLICATION = { id: "app-existing" };

const VALUES = {
  firstName: "Retry",
  lastName: "User",
  email: "retry@example.com",
  phone: null,
  location: null,
  linkedinUrl: null,
  githubUrl: null,
  websiteUrl: null,
  photoUrl: null,
  headline: null,
  educationEntries: [],
  experienceEntries: [],
  skills: [],
  experienceYears: null,
  coverLetter: null,
  resumeKey: undefined,
  resumeUrl: undefined,
  resumeFileName: undefined,
  resumeFileType: undefined,
  resumeFileSize: undefined,
  questionAnswers: {},
} as unknown as Parameters<typeof createPublicApplication>[1];

describe("F1-07 re-application duplicate detection order", () => {
  beforeEach(() => {
    mocks.transactionImpl.mockReset();
    mocks.selectImpl.mockReset();
    mocks.storageRead.mockReset();
  });

  it("publishes legal configuration through the public job application context", async () => {
    const query = new Proxy(
      function () {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (value: unknown) => void) =>
              resolve([
                {
                  id: "job-1",
                  workspaceId: "ws-1",
                  keywords: ["typescript"],
                  applicationConfig: { questions: [] },
                  legalConfigured: true,
                  consentText: "Acme privacy terms",
                },
              ]);
          }
          return () => query;
        },
        apply() {
          return query;
        },
      },
    );
    mocks.selectImpl.mockReturnValue(query);

    const context = await getPublicJobApplicationContext({
      jobSlug: "engineer",
      workspaceSlug: "acme",
    });

    expect(context?.applicationConfig).toMatchObject({
      legalConfigured: true,
      consentText: "Acme privacy terms",
    });
  });

  it("rejects a duplicate application for an existing candidate without overwriting their profile", async () => {
    // Queue mirrors the queries issued before the duplicate check:
    // 1) job lookup, 2) org lookup, 3) candidate by email, 4) duplicate application.
    const { tx, calls } = makeTx([
      [JOB],
      [ORG],
      [EXISTING_CANDIDATE],
      [EXISTING_APPLICATION],
    ]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    const result = await createPublicApplication(
      { jobSlug: "engineer", workspaceSlug: "acme" },
      VALUES,
    );

    // The application is rejected as a duplicate…
    expect(result.ok).toBe(false);
    expect((result as { message?: string }).message ?? "").toMatch(/already applied/i);

    // …and crucially the candidate was never updated (no overwrite on retry).
    expect(calls.update).toBe(0);
    expect(calls.insert).toBe(0);
  });

  it("creates a new application for another job without overwriting the canonical profile", async () => {
    const canonicalCandidate = {
      id: "cand-1",
      firstName: "Canonical",
      lastName: "Profile",
      email: "retry@example.com",
      phone: "+56 9 1111 1111",
      workspaceId: "ws-1",
    };
    const insertValues: unknown[] = [];
    const queue = [
      [JOB],
      [{ ...ORG, legalConfigured: true, consentText: "Canonical privacy terms" }],
      [canonicalCandidate],
      [],
      [{ id: "stage-1" }],
      [{ value: 1 }],
      [{ id: "application-2" }],
      [],
      [],
      [],
      [],
      [{ email: "owner@example.com" }],
    ];
    const calls = { update: 0, insert: 0 };
    const runnable = new Proxy(
      function () {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (value: unknown) => void) => resolve(queue.shift());
          }
          if (prop === "values") {
            return (values: unknown) => {
              insertValues.push(values);
              return runnable;
            };
          }
          return () => runnable;
        },
        apply() {
          return runnable;
        },
      },
    );
    const tx = {
      select: () => runnable,
      update: () => {
        calls.update += 1;
        return runnable;
      },
      insert: () => {
        calls.insert += 1;
        return runnable;
      },
    };
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    const result = await createPublicApplication(
      { jobSlug: "another-job", workspaceSlug: "acme" },
      VALUES,
      {
        consent: {
          consentText: "untrusted browser text",
          ipAddress: "203.0.113.20",
          userAgent: "candidate-browser/1.0",
        },
      },
    );

    expect(result).toMatchObject({
      ok: true,
      candidateId: "cand-1",
      email: {
        candidateName: "Canonical Profile",
        candidateEmail: "retry@example.com",
      },
    });
    expect(calls.update).toBe(0);
    expect(calls.insert).toBeGreaterThan(0);
    expect(insertValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: "cand-1",
          jobId: "job-1",
          source: "public_form",
          pipelineOrder: 1,
          snapshot: expect.objectContaining({
            firstName: "Retry",
            lastName: "User",
          }),
        }),
        expect.objectContaining({
          consentText: "Canonical privacy terms",
          ipAddress: "203.0.113.20",
          userAgent: "candidate-browser/1.0",
          granted: true,
        }),
      ]),
    );
  });

  it("enforces legal consent inside the domain transaction", async () => {
    const { tx, calls } = makeTx([
      [JOB],
      [{ ...ORG, legalConfigured: true, consentText: "Acme privacy terms" }],
    ]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    const result = await createPublicApplication(
      { jobSlug: "engineer", workspaceSlug: "acme" },
      VALUES,
    );

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringMatching(/privacy policy/i),
    });
    expect(calls.update).toBe(0);
    expect(calls.insert).toBe(0);
  });

  it("maps an application uniqueness race to the known idempotent conflict", () => {
    expect(
      getApplicationConflictMessage({
        code: "23505",
        constraint: "applications_workspace_candidate_job_idx",
      }),
    ).toBe("You've already applied to this job.");
  });

  it("rejects an external resume URL when it is not backed by a canonical key", async () => {
    const { tx, calls } = makeTx([[JOB]]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    const result = await createPublicApplication(
      { jobSlug: "engineer", workspaceSlug: "acme" },
      {
        ...VALUES,
        resumeUrl: "https://attacker.example/resume.pdf",
      },
    );

    expect(result).toEqual({ ok: false, message: "Resume upload is invalid." });
    expect(calls.insert).toBe(0);
  });

  it("rejects a canonical-looking resume key when the object does not exist", async () => {
    mocks.storageRead.mockRejectedValue(new Error("not found"));
    const { tx, calls } = makeTx([[JOB]]);
    mocks.transactionImpl.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx),
    );

    const result = await createPublicApplication(
      { jobSlug: "engineer", workspaceSlug: "acme" },
      {
        ...VALUES,
        resumeKey: "workspaces/ws-1/resumes/upload/cv.pdf",
        resumeUrl: "https://harly.example/api/storage/file?key=forged",
        resumeFileName: "cv.pdf",
        resumeFileType: "application/pdf",
        resumeFileSize: 100,
      },
    );

    expect(result).toEqual({ ok: false, message: "Resume upload is invalid." });
    expect(calls.insert).toBe(0);
  });
});
