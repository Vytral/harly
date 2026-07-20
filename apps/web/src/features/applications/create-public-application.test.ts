import { beforeEach, describe, expect, it, vi } from "vitest";

// F1-07: a re-application must be detected as a duplicate BEFORE the existing
// candidate's contact/profile fields are overwritten. A retry must never clobber
// a candidate just because the new application itself is rejected.

const mocks = vi.hoisted(() => {
  const transactionImpl = vi.fn();
  return { transactionImpl };
});

vi.mock("@harly/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transactionImpl(fn),
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

vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));

// data.ts -> jobs/data -> workspaces/context -> @/lib/auth -> @harly/auth,
// which calls loadHarlyConfig() at module load. In CI without HARLY_URL set
// that throws, so stub the config module before the import chain runs.
vi.mock("@harly/config", () => ({
  loadHarlyConfig: () => ({ HARLY_URL: "https://test.local" }),
  formatConfigError: () => "config error",
}));

import { createPublicApplication } from "./data";

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

const JOB = { id: "job-1", title: "Engineer", workspaceId: "ws-1" };
const ORG = { name: "Acme", slug: "acme" };
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
} as never;

describe("F1-07 re-application duplicate detection order", () => {
  beforeEach(() => {
    mocks.transactionImpl.mockReset();
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
});
