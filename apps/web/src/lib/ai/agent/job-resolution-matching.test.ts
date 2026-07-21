import { describe, expect, it } from "vitest";

import { rankJobMatches } from "./job-resolution-matching";

const jobs = [
  {
    id: "php",
    title: "Junior Software Engineer (PHP)",
    slug: "junior-software-engineer-php",
    department: "Engineering",
    location: "Remote",
    status: "open",
  },
  {
    id: "go",
    title: "Backend Engineer (Go)",
    slug: "backend-engineer-go",
    department: "Engineering",
    location: "Remote",
    status: "open",
  },
];

describe("job resolution matching", () => {
  it("ranks exact and token title matches above metadata matches", () => {
    expect(rankJobMatches("Junior Software Engineer PHP", jobs)[0]).toMatchObject({
      job: { id: "php" },
      reason: "exact_title",
    });
  });

  it("handles slugs and partial title references", () => {
    expect(rankJobMatches("backend-engineer-go", jobs)[0]).toMatchObject({
      job: { id: "go" },
      reason: "slug",
    });
    expect(rankJobMatches("PHP", jobs)[0].job.id).toBe("php");
  });

  it("returns no match for unrelated text", () => {
    expect(rankJobMatches("design researcher", jobs)).toEqual([]);
  });
});
