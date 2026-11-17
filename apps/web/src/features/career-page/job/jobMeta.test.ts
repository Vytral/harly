import { describe, expect, it } from "vitest";

import { toPublicJobLike } from "./jobMeta";

describe("toPublicJobLike", () => {
  it("drops internal columns before the job reaches a client component", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000001",
      workspaceId: "ws_internal",
      createdById: "user_internal",
      evaluationMode: "strict",
      applicationConfig: { questions: [{ label: "internal" }] },
      boardConfig: { secret: true },
      status: "open",
      slug: "engineer",
      title: "Engineer",
      department: "Platform",
      location: "Remote",
      employmentType: "full_time",
      workplaceType: "remote",
      experienceLevel: "senior",
      salaryMin: 1,
      salaryMax: 2,
      currency: "EUR",
      salaryPeriod: "annual",
    };
    const out = toPublicJobLike(row);
    expect(Object.keys(out).sort()).toEqual(
      [
        "currency", "department", "employmentType", "experienceLevel", "location",
        "salaryMax", "salaryMin", "salaryPeriod", "slug", "title", "workplaceType",
      ],
    );
    expect(JSON.stringify(out)).not.toContain("internal");
  });
});
