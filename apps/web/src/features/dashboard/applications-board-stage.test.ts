import { describe, expect, it } from "vitest";

import {
  matchesStageFilter,
  stageFilterValue,
} from "@/features/dashboard/applications-board-stage";

describe("stageFilterValue", () => {
  it("filters a stage by its kind, so a renamed screening stage is still screening", () => {
    expect(stageFilterValue({ kind: "screening", name: "Phone screen" })).toBe("screening");
  });

  it("filters a NULL-kind row through its legacy name", () => {
    expect(stageFilterValue({ kind: null, name: "Interview" })).toBe("interview");
  });

  it("filters a custom stage by its own name", () => {
    expect(stageFilterValue({ kind: "custom", name: "Panel review" })).toBe("Panel review");
    expect(stageFilterValue({ kind: null, name: "Panel review" })).toBe("Panel review");
  });
});

describe("matchesStageFilter", () => {
  const renamed = { stageKind: "screening" as const, stageName: "Phone screen" };
  const custom = { stageKind: "custom" as const, stageName: "Panel review" };

  it("matches by kind", () => {
    expect(matchesStageFilter(renamed, "screening")).toBe(true);
    expect(matchesStageFilter(renamed, "interview")).toBe(false);
  });

  it("still accepts display-name URLs from before stage kinds existed", () => {
    expect(matchesStageFilter({ stageKind: "screening", stageName: "Screening" }, "Screening")).toBe(true);
    expect(matchesStageFilter(custom, "Panel review")).toBe(true);
    expect(matchesStageFilter(custom, "Other")).toBe(false);
  });

  it("never matches an application with no stage", () => {
    expect(matchesStageFilter({ stageKind: null, stageName: null }, "screening")).toBe(false);
  });
});
