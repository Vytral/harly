import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listUpcomingInterviews: vi.fn(),
}));

vi.mock("@/features/interviews/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/interviews/data")>()),
  listUpcomingInterviews: mocks.listUpcomingInterviews,
}));

import { buildHarlyTools } from "./index";

const ADA = "5f1c2a3e-0000-4000-8000-000000000001";

describe("upcomingInterviews tool output", () => {
  it("maps the candidate, job and time fields the interview query returns", async () => {
    mocks.listUpcomingInterviews.mockResolvedValue([
      {
        id: "1e7e2000-0000-4000-8000-000000000001",
        applicationId: "9a7b0c1d-0000-4000-8000-0000000000a1",
        type: "technical",
        scheduledAt: "2026-11-02T10:30:00.000Z",
        jobId: "c0ffee00-0000-4000-8000-000000000b01",
        jobTitle: "Data Analyst",
        candidateId: ADA,
        candidateName: "Ada Lovelace",
        meetLink: null,
      },
    ]);

    const tools = buildHarlyTools({
      workspaceId: "workspace-1",
      userId: "user-1",
      permissions: undefined,
    }) as unknown as Record<string, { execute: (input: unknown, options: unknown) => Promise<unknown> }>;

    const out = (await tools.upcomingInterviews!.execute({}, {})) as {
      count: number;
      interviews: Array<Record<string, unknown>>;
    };

    expect(out.count).toBe(1);
    expect(out.interviews[0]).toEqual({
      id: "1e7e2000-0000-4000-8000-000000000001",
      candidateId: ADA,
      candidateName: "Ada Lovelace",
      job: "Data Analyst",
      type: "technical",
      scheduledAt: "2026-11-02T10:30:00.000Z",
    });
  });
});
