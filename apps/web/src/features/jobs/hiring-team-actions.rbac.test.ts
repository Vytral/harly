import { beforeEach, describe, expect, it, vi } from "vitest";

const requireJobPermission = vi.hoisted(() => vi.fn());

vi.mock("@harly/db", () => ({
  db: {},
  jobHiringTeam: {},
  member: {},
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requireJobPermission,
}));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addHiringTeamMember,
  removeHiringTeamMember,
  updateHiringTeamRole,
} from "./hiring-team-actions";

const JOB_ID = "job-1";

describe("hiring-team authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireJobPermission.mockRejectedValue(
      new Error("You are not assigned to this job."),
    );
  });

  it.each([
    ["add", () => addHiringTeamMember({ jobId: JOB_ID, userId: "user-1", role: "recruiter" })],
    ["update", () => updateHiringTeamRole({ id: "member-1", jobId: JOB_ID, role: "recruiter" })],
    ["remove", () => removeHiringTeamMember({ id: "member-1", jobId: JOB_ID })],
  ])("requires job scope before %s", async (_name, action) => {
    await expect(action()).resolves.toEqual({
      success: false,
      error: expect.stringContaining("Unable"),
    });
    expect(requireJobPermission).toHaveBeenCalledWith(
      "hiring_team:manage",
      JOB_ID,
    );
  });
});
