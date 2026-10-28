import { describe, expect, it } from "vitest";

import { applicationStatusForStage } from "@harly/db";

describe("application status from stage kind", () => {
  it.each([
    [{ kind: "hired", name: "Hired" }, "hired"],
    [{ kind: "rejected", name: "Rejected" }, "rejected"],
    [{ kind: "withdrawn", name: "Withdrawn" }, "withdrawn"],
    [{ kind: "interview", name: "Interview" }, "active"],
    [{ kind: "offer", name: "Offer" }, "active"],
    [{ kind: "custom", name: "Hired" }, "active"],
  ] as const)("maps stage %o to status %s", (stage, status) => {
    expect(applicationStatusForStage(stage)).toBe(status);
  });

  it("uses the stored kind even after an admin renames the stage", () => {
    expect(applicationStatusForStage({ kind: "hired", name: "Joined" })).toBe(
      "hired",
    );
  });

  it("falls back to the legacy name for rows with a NULL kind", () => {
    expect(applicationStatusForStage({ kind: null, name: " hired " })).toBe(
      "hired",
    );
    expect(applicationStatusForStage({ kind: null, name: "Interview" })).toBe(
      "active",
    );
  });
});
