import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveSearchActor: vi.fn(),
  searchWorkspaceForActor: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("./workspace-search", () => ({
  resolveSearchActor: mocks.resolveSearchActor,
  searchWorkspaceForActor: mocks.searchWorkspaceForActor,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.logError, warn: vi.fn() }),
}));

import { searchWorkspaceAction } from "./actions";
import { emptyWorkspaceSearchResults } from "./results";

const scopedActor = {
  workspaceId: "ws-1",
  userId: "user-1",
  permissions: ["jobs:view", "tasks:read"] as const,
  scope: { jobAccess: "assigned" as const, departments: ["Engineering"], regions: [] },
};

describe("searchWorkspaceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSearchActor.mockResolvedValue(scopedActor);
    mocks.searchWorkspaceForActor.mockResolvedValue({
      ...emptyWorkspaceSearchResults("Ada"),
      groups: {
        jobs: { hits: [], hasMore: false, seeAllHref: "/dashboard/jobs" },
      },
    });
  });

  it("answers a scoped role with its permitted groups instead of throwing", async () => {
    const result = await searchWorkspaceAction("Ada");

    expect(result.ok).toBe(true);
    expect(mocks.searchWorkspaceForActor).toHaveBeenCalledWith(scopedActor, "Ada");
    if (result.ok) {
      expect(Object.keys(result.results.groups)).toEqual(["jobs"]);
    }
  });

  it("trims and collapses the query before searching", async () => {
    await searchWorkspaceAction("   Ada   Lovelace  ");
    expect(mocks.searchWorkspaceForActor).toHaveBeenCalledWith(
      scopedActor,
      "Ada Lovelace",
    );
  });

  it("answers an empty query without resolving the caller or querying", async () => {
    const result = await searchWorkspaceAction("   ");

    expect(result).toEqual({ ok: true, results: emptyWorkspaceSearchResults("") });
    expect(mocks.resolveSearchActor).not.toHaveBeenCalled();
    expect(mocks.searchWorkspaceForActor).not.toHaveBeenCalled();
  });

  it("rejects an oversized query without touching the database", async () => {
    const result = await searchWorkspaceAction("x".repeat(501));

    expect(result.ok).toBe(false);
    expect(mocks.resolveSearchActor).not.toHaveBeenCalled();
  });

  it("returns a recoverable error instead of throwing when the search fails", async () => {
    mocks.searchWorkspaceForActor.mockRejectedValue(new Error("db down"));

    const result = await searchWorkspaceAction("Ada");

    expect(result).toEqual({ ok: false, error: "Search didn't load. Try again." });
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "workspace search failed",
    );
  });

  it("returns a recoverable error when resolving the caller fails", async () => {
    mocks.resolveSearchActor.mockRejectedValue(new Error("policy lookup failed"));

    const result = await searchWorkspaceAction("Ada");

    expect(result.ok).toBe(false);
    expect(mocks.searchWorkspaceForActor).not.toHaveBeenCalled();
  });

  it("lets Next.js redirects through so signed-out users are still sent to sign-in", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    mocks.resolveSearchActor.mockRejectedValue(redirect);

    await expect(searchWorkspaceAction("Ada")).rejects.toBe(redirect);
  });
});
