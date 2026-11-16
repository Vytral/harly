import { describe, expect, it } from "vitest";

import { rankRiskJobs } from "./risk-order";

describe("rankRiskJobs", () => {
  it("orders by severity before the widget slices, keeping age order within a severity", () => {
    const jobs = [
      { id: "old-warning", severity: "warning" as const },
      { id: "old-danger", severity: "danger" as const },
      { id: "mid-warning", severity: "warning" as const },
      { id: "mid-danger", severity: "danger" as const },
      { id: "new-critical", severity: "critical" as const },
    ];
    expect(rankRiskJobs(jobs).slice(0, 4).map((j) => j.id)).toEqual([
      "new-critical",
      "old-danger",
      "mid-danger",
      "old-warning",
    ]);
  });
});
