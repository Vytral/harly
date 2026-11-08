import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  setArg: null as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@harly/db", () => {
  const chain = (rows: () => unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy"]) c[m] = () => c;
    c.limit = () => Promise.resolve(rows());
    return c;
  };
  const tx = {
    update: () => ({
      set: (arg: Record<string, unknown>) => {
        state.setArg = arg;
        return {
          where: () => ({
            returning: () => Promise.resolve([{ ...state.existing, ...arg, createdAt: new Date(), updatedAt: new Date(), publishedAt: null }]),
          }),
        };
      },
    }),
  };
  return {
    db: {
      select: (fields?: unknown) => chain(() => (!fields && state.existing ? [state.existing] : [])),
      transaction: (fn: (t: unknown) => unknown) => fn(tx),
    },
    defaultStageRows: vi.fn(),
    jobApprovalRequests: {},
    jobHiringTeam: {},
    jobs: {},
    jobStages: {},
  };
});
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn() }));
vi.mock("@/lib/public-origin", () => ({ getHarlyPublicOrigin: () => "http://x" }));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(async () => ({ eventId: "e" })),
  publishPersistedDomainEvents: vi.fn(),
}));
vi.mock("./data", () => ({ generateUniqueJobSlug: vi.fn() }));

import { updateJobForApi } from "./service";

const base = {
  id: "j1",
  workspaceId: "w1",
  title: "T",
  description: "desc",
  status: "draft",
  department: "Eng",
  location: "Remote",
  employmentType: "full_time",
  workplaceType: "remote",
  requirements: "r",
  benefits: "b",
  keywords: [],
  salaryMin: 10,
  salaryMax: 20,
  currency: "USD",
  salaryPeriod: "annual",
  publishedAt: null,
};

describe("updateJobForApi", () => {
  beforeEach(() => {
    state.existing = { ...base };
    state.setArg = null;
  });

  it("lets null clear optional fields while absent keeps them", async () => {
    await updateJobForApi({
      workspaceId: "w1",
      jobId: "j1",
      values: { department: null, salaryMin: null, salaryMax: null, salaryPeriod: null },
    });
    expect(state.setArg).toMatchObject({
      department: null,
      salaryMin: null,
      salaryMax: null,
      salaryPeriod: null,
      location: "Remote",
      currency: "USD",
    });
  });

  it("refuses to publish a job without a description", async () => {
    state.existing = { ...base, description: "" };
    await expect(
      updateJobForApi({ workspaceId: "w1", jobId: "j1", values: { status: "open" } }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it.each(["<p><br></p>", "&nbsp;&nbsp;&nbsp;", "short"])("refuses unreadable published content: %s", async (description) => {
    state.existing = { ...base, status: "open", description: "A valid description" };
    await expect(updateJobForApi({ workspaceId: "w1", jobId: "j1", values: { description } }))
      .rejects.toMatchObject({ status: 422 });
    expect(state.setArg).toBeNull();
  });

  it("publishes a dashboard-created job with sections and no description", async () => {
    state.existing = { ...base, description: "", contentSections: [{ id: "requirements", title: "Requirements", body: "Relevant experience" }] };
    await expect(updateJobForApi({ workspaceId: "w1", jobId: "j1", values: { status: "open" } })).resolves.toBeDefined();
    expect(state.setArg).toMatchObject({ status: "open" });
  });
});
