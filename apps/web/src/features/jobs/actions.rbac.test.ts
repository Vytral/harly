import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireJobPermission: vi.fn(),
  requirePermission: vi.fn(),
  updateJob: vi.fn(),
  updateJobStatus: vi.fn(),
  jobFormParse: vi.fn(),
  jobStatusParse: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: {},
  workspaceSettings: {},
}));
vi.mock("./data", () => ({
  createJob: vi.fn(),
  permanentlyDeleteJob: vi.fn(),
  restoreJob: vi.fn(),
  trashJob: vi.fn(),
  updateJob: mocks.updateJob,
  updateJobStatus: mocks.updateJobStatus,
}));
vi.mock("./validation", () => ({
  jobFormSchema: { parse: mocks.jobFormParse },
  jobStatusSchema: { parse: mocks.jobStatusParse },
}));
vi.mock("./approval", () => ({ getPendingJobApproval: vi.fn() }));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireJobPermission: mocks.requireJobPermission,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: vi.fn() }));
vi.mock("@/lib/ai/surfaces/generate-job", () => ({
  generateJobDraftWithAI: vi.fn(),
}));
vi.mock("@/features/career-page/config", () => ({
  normalizeCareerPageConfig: vi.fn(() => ({
    hero: {},
    intro: {},
    values: { enabled: false, items: [] },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

import { updateJobAction, updateJobStatusAction } from "./actions";

const JOB_ID = "job-1";

describe("job action authorization", () => {
  it("checks job scope before parsing or updating a job", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    const form = new FormData();
    form.set("jobId", JOB_ID);

    await expect(updateJobAction(form)).rejects.toThrow(
      "You are not assigned to this job.",
    );
    expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:edit", JOB_ID);
    expect(mocks.jobFormParse).not.toHaveBeenCalled();
    expect(mocks.updateJob).not.toHaveBeenCalled();
  });

  it("checks job scope before changing publication status", async () => {
    mocks.requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );

    const form = new FormData();
    form.set("jobId", JOB_ID);
    form.set("status", "open");

    await expect(updateJobStatusAction(form)).rejects.toThrow(
      "You are not assigned to this job.",
    );
    expect(mocks.requireJobPermission).toHaveBeenCalledWith("jobs:edit", JOB_ID);
    expect(mocks.updateJobStatus).not.toHaveBeenCalled();
  });
});
