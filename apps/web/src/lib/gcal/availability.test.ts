import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceGCalConfig: vi.fn(),
  recordGCalCallFailure: vi.fn(async () => false),
  getFreeBusy: vi.fn(),
  recordIntegrationSuccess: vi.fn(async () => undefined),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  lt: vi.fn(),
  ne: vi.fn(),
}));
vi.mock("@harly/db", () => ({
  db: { select: vi.fn() },
  interviews: {},
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContext: async () => ({ organization: { id: "workspace-1" } }),
}));
vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationSuccess: mocks.recordIntegrationSuccess,
}));
vi.mock("@/lib/gcal/config", () => ({
  getWorkspaceGCalConfig: mocks.getWorkspaceGCalConfig,
  recordGCalCallFailure: mocks.recordGCalCallFailure,
}));
vi.mock("@/lib/gcal/client", () => ({
  getFreeBusy: mocks.getFreeBusy,
}));

import { checkAvailability } from "./availability";

const timeMin = new Date("2030-06-01T09:00:00.000Z");
const timeMax = new Date("2030-06-01T10:00:00.000Z");

describe("checkAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceGCalConfig.mockResolvedValue({ oauth2Client: {}, calendarId: "primary" });
  });

  it("reports the calendar as checked when Google answered", async () => {
    mocks.getFreeBusy.mockResolvedValue([]);

    const result = await checkAvailability({ timeMin, timeMax });

    expect(result).toMatchObject({ gcalBusy: [], gcalAvailability: "checked" });
    expect(mocks.recordIntegrationSuccess).toHaveBeenCalledWith("workspace-1", "gcal", {
      startedAt: expect.any(Date),
    });
  });

  it("reports availability unknown, and never records success, when Google cannot read the calendar", async () => {
    mocks.getFreeBusy.mockRejectedValue(new Error("Google Calendar free/busy could not be read: notFound"));

    const result = await checkAvailability({ timeMin, timeMax });

    expect(result).toMatchObject({ gcalBusy: [], gcalAvailability: "unknown" });
    expect(mocks.recordGCalCallFailure).toHaveBeenCalledWith("workspace-1", expect.any(Error));
    expect(mocks.recordIntegrationSuccess).not.toHaveBeenCalled();
  });

  it("reports not_connected when Google Calendar is not configured", async () => {
    mocks.getWorkspaceGCalConfig.mockResolvedValue(null);

    const result = await checkAvailability({ timeMin, timeMax });

    expect(result).toMatchObject({ gcalBusy: [], gcalAvailability: "not_connected" });
    expect(mocks.getFreeBusy).not.toHaveBeenCalled();
  });
});
