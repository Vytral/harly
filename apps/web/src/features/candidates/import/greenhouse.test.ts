import { describe, expect, it, vi } from "vitest";

import { fetchGreenhouseCandidateImportRows, greenhouseCandidateToImportRow } from "./greenhouse";

describe("Greenhouse import", () => {
  it("maps supported profile data and rejects candidates without an email or full name", () => {
    expect(greenhouseCandidateToImportRow({ id: 1, first_name: "Ada", last_name: "Lovelace", company: "Analytical Engines", title: "Engineer", email_addresses: [{ value: "ADA@EXAMPLE.COM" }], phone_numbers: [{ value: "+56 9" }], addresses: [{ value: "Santiago" }], website_addresses: [{ type: "linkedin", url: "https://linkedin.com/in/ada" }, { type: "portfolio", url: "https://ada.example" }], tags: [{ name: "Mathematics" }], educations: [{ id: 3, school_name: "University of London", degree: "BA" }], employments: [{ id: 4, company_name: "Analytical Engines", title: "Engineer" }] }, 2)).toMatchObject({ values: { email: "ADA@EXAMPLE.COM", headline: "Engineer at Analytical Engines", linkedinUrl: "https://linkedin.com/in/ada", websiteUrl: "https://ada.example", skills: '["Mathematics"]', educationEntries: expect.stringContaining("University of London"), experienceEntries: expect.stringContaining("Analytical Engines") } });
    expect(greenhouseCandidateToImportRow({ id: 2, first_name: "Ada", last_name: "", company: null, title: null }, 3)).toBeNull();
  });

  it("follows Greenhouse pagination and omits invalid profiles", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, first_name: "Ada", last_name: "Lovelace", company: null, title: null, email_addresses: [{ value: "ada@example.com" }] }, { id: 2, first_name: "No", last_name: "Email", company: null, title: null }]), { headers: { Link: '<https://harvest.greenhouse.io/v1/candidates?page=2>; rel="next"' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, first_name: "Grace", last_name: "Hopper", company: null, title: null, email_addresses: [{ value: "grace@example.com" }] }])));
    await expect(fetchGreenhouseCandidateImportRows("a".repeat(32), fetcher)).resolves.toMatchObject({ skipped: 1, rows: [{ rowNumber: 2 }, { rowNumber: 4 }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
