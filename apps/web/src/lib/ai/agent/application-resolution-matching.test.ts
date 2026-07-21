import { describe, expect, it } from "vitest";

import { rankApplicationMatches } from "./application-resolution-matching";

const applications = [
  {
    applicationId: "php-app",
    jobId: "php-job",
    job: "Junior Software Engineer (PHP)",
    stage: "Hired",
    status: "hired",
    isActive: false,
  },
  {
    applicationId: "go-app",
    jobId: "go-job",
    job: "Backend Engineer (Go)",
    stage: "Interview",
    status: "active",
    isActive: true,
  },
];

describe("application resolution", () => {
  it("matches a role by its meaningful tokens", () => {
    expect(rankApplicationMatches("Backend Go", applications)[0]).toMatchObject({
      application: { applicationId: "go-app" },
      reason: "job_tokens",
    });
  });

  it("ranks an exact role above a partial role", () => {
    expect(
      rankApplicationMatches("Junior Software Engineer (PHP)", applications)[0],
    ).toMatchObject({
      application: { applicationId: "php-app" },
      reason: "exact_job",
      score: 0.99,
    });
  });
});
