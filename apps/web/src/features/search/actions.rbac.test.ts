import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveSearchActor: vi.fn(),
  searchWorkspaceForActor: vi.fn(),
  visibleRecentRefsForActor: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("./workspace-search", () => ({
  resolveSearchActor: mocks.resolveSearchActor,
  searchWorkspaceForActor: mocks.searchWorkspaceForActor,
  visibleRecentRefsForActor: mocks.visibleRecentRefsForActor,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.logError, warn: vi.fn() }),
}));

import {
  recentsViewerAction,
  searchWorkspaceAction,
  visibleRecentsAction,
} from "./actions";
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

  it("answers a one-character query with no results and no database work", async () => {
    const result = await searchWorkspaceAction("a");

    expect(result).toEqual({ ok: true, results: emptyWorkspaceSearchResults("") });
    expect(mocks.resolveSearchActor).not.toHaveBeenCalled();
    expect(mocks.searchWorkspaceForActor).not.toHaveBeenCalled();
  });

  it("removes control characters before the query reaches the database", async () => {
    await searchWorkspaceAction("Ada\u0000Lovelace");
    expect(mocks.searchWorkspaceForActor).toHaveBeenCalledWith(
      scopedActor,
      "AdaLovelace",
    );
  });

  it("logs only the error class and database code when a search fails", async () => {
    const typed = "Ada Lovelace ada@example.test";
    const driverError = Object.assign(new Error("invalid byte sequence for encoding"), {
      code: "22021",
    });
    const failure = Object.assign(
      new Error(`Failed query: select ... where lower(email) like $1 params: %${typed}%`),
      { cause: driverError },
    );
    mocks.searchWorkspaceForActor.mockRejectedValue(failure);

    const result = await searchWorkspaceAction(typed);

    expect(result).toEqual({ ok: false, error: "Search didn't load. Try again." });
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(mocks.logError.mock.calls[0]);
    expect(logged).not.toContain("Ada");
    expect(logged).not.toContain("ada@example.test");
    expect(logged).toContain("22021");
    expect(logged).toContain("Error");
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
      { failure: { errorClass: "Error" } },
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

describe("recents actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSearchActor.mockResolvedValue(scopedActor);
    mocks.visibleRecentRefsForActor.mockResolvedValue([]);
  });

  it("tells the palette which user the recents belong to", async () => {
    await expect(recentsViewerAction()).resolves.toEqual({ ok: true, userId: "user-1" });
  });

  it("checks well-formed recent references against the viewer's access", async () => {
    mocks.visibleRecentRefsForActor.mockResolvedValue([{ group: "jobs", id: "job-1" }]);
    const result = await visibleRecentsAction([{ group: "jobs", id: "job-1" }]);

    expect(mocks.visibleRecentRefsForActor).toHaveBeenCalledWith(scopedActor, [
      { group: "jobs", id: "job-1" },
    ]);
    expect(result).toEqual({ ok: true, visible: [{ group: "jobs", id: "job-1" }] });
  });

  it("rejects malformed or oversized reference lists without querying", async () => {
    const oversized = Array.from({ length: 9 }, (_, i) => ({ group: "jobs", id: `j-${i}` }));
    for (const input of [
      oversized,
      [{ group: "secrets", id: "x" }],
      [{ group: "jobs", id: "" }],
      "jobs",
      null,
    ]) {
      const result = await visibleRecentsAction(input);
      expect(result.ok).toBe(false);
    }
    expect(mocks.resolveSearchActor).not.toHaveBeenCalled();
    expect(mocks.visibleRecentRefsForActor).not.toHaveBeenCalled();
  });

  it("answers an empty list without resolving the caller", async () => {
    await expect(visibleRecentsAction([])).resolves.toEqual({ ok: true, visible: [] });
    expect(mocks.resolveSearchActor).not.toHaveBeenCalled();
  });
});
