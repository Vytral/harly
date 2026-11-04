import { describe, expect, it } from "vitest";

import { activeJobs, baseJobs } from "./jobs";

const names = (demo: boolean) => activeJobs(demo).map((job) => job.name);

describe("activeJobs", () => {
  it("drops the demo-refused jobs and adds demo-reset in demo mode", () => {
    const demo = names(true);
    expect(demo).not.toContain("automations");
    expect(demo).not.toContain("domain-events");
    expect(demo).toContain("demo-reset");
  });

  it("keeps every other job in demo mode", () => {
    const demo = new Set(names(true));
    for (const job of baseJobs) {
      if (job.name === "automations" || job.name === "domain-events") continue;
      expect(demo.has(job.name)).toBe(true);
    }
  });

  it("schedules automations and domain-events, but not demo-reset, on a normal install", () => {
    const normal = names(false);
    expect(normal).toContain("automations");
    expect(normal).toContain("domain-events");
    expect(normal).not.toContain("demo-reset");
    expect(normal).toEqual(baseJobs.map((job) => job.name));
  });
});
