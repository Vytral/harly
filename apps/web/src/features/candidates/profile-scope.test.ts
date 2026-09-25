import { describe, expect, it } from "vitest";

import { filterApplicationScopedItems } from "./profile-scope";

describe("candidate profile application scope", () => {
  it("keeps candidate-wide rows and drops rows tied to inaccessible applications", () => {
    const visibleApplicationIds = new Set(["application-visible"]);
    const rows = [
      { id: "candidate-wide", applicationId: null },
      { id: "visible", applicationId: "application-visible" },
      { id: "hidden", applicationId: "application-hidden" },
    ];

    expect(filterApplicationScopedItems(rows, visibleApplicationIds)).toEqual([
      rows[0],
      rows[1],
    ]);
  });
});
