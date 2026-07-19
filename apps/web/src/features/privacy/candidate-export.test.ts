import { describe, expect, it } from "vitest";

import { candidateExportCsv } from "./candidate-export";

describe("candidateExportCsv", () => {
  it("keeps one portable profile row and neutralizes spreadsheet formulas", () => {
    const csv = candidateExportCsv({
      candidate: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "=dangerous@example.com",
        phone: null,
        address: null,
        location: "London",
        linkedinUrl: null,
        githubUrl: null,
        websiteUrl: null,
        headline: null,
        summary: null,
        skills: ["Math"],
        experienceYears: 5,
        educationEntries: [],
        experienceEntries: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      applications: [],
    });

    expect(csv).toContain('"candidate"');
    expect(csv).toContain('"\'=dangerous@example.com"');
    expect(csv).toContain('"[""Math""]"');
  });
});
