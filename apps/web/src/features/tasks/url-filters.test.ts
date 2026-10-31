import { describe, expect, it } from "vitest";

import { matchesDue, matchesStatus, parseTaskFilters, withTaskFilter } from "./url-filters";

const parse = (query: string) => parseTaskFilters(new URLSearchParams(query), "me-id");

describe("parseTaskFilters", () => {
  it("defaults to no filters", () => {
    expect(parse("")).toEqual({ assignee: "all", priority: "all", status: "all", due: "all" });
  });

  it("reads the Home 'Tasks due' link", () => {
    expect(parse("owner=me&due=overdue,today")).toMatchObject({
      assignee: "me-id",
      due: "overdue,today",
    });
  });

  it("normalizes order and ignores unknown values", () => {
    expect(parse("due=today,bogus,overdue&status=nope&priority=urgent")).toEqual({
      assignee: "all",
      priority: "urgent",
      status: "all",
      due: "overdue,today",
    });
    expect(parse("priority=bogus").priority).toBe("all");
  });

  it("accepts a user id as owner", () => {
    expect(parse("owner=someone").assignee).toBe("someone");
  });
});

describe("withTaskFilter", () => {
  it("writes and clears params, keeping others", () => {
    const base = new URLSearchParams("task=1&owner=me");
    const set = withTaskFilter(base, "due", "overdue,today", "me-id");
    expect(set.get("due")).toBe("overdue,today");
    expect(set.get("task")).toBe("1");
    expect(withTaskFilter(set, "due", "all", "me-id").has("due")).toBe(false);
  });

  it("writes the viewer as 'me'", () => {
    expect(withTaskFilter(new URLSearchParams(), "assignee", "me-id", "me-id").get("owner")).toBe("me");
    expect(withTaskFilter(new URLSearchParams(), "assignee", "other", "me-id").get("owner")).toBe("other");
  });
});

describe("matchesDue / matchesStatus", () => {
  const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString();

  it("counts overdue only for open tasks", () => {
    expect(matchesDue({ status: "pending", dueDate: yesterday }, "overdue,today")).toBe(true);
    expect(matchesDue({ status: "completed", dueDate: yesterday }, "overdue,today")).toBe(false);
    expect(matchesDue({ status: "pending", dueDate: null }, "overdue,today")).toBe(false);
  });

  it("matches no_due and any status list", () => {
    expect(matchesDue({ status: "pending", dueDate: null }, "no_due")).toBe(true);
    expect(matchesStatus({ status: "in_progress" }, "pending,in_progress")).toBe(true);
    expect(matchesStatus({ status: "completed" }, "pending,in_progress")).toBe(false);
  });
});
