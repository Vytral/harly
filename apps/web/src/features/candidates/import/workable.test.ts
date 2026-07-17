import { describe, expect, it, vi } from "vitest";

import { fetchWorkableCandidateImportRows, workableCandidateToImportRow } from "./workable";

describe("Workable import", () => {
  it("maps full profile details", () => {
    expect(workableCandidateToImportRow({ id: "1", name: "Ada Lovelace", email: "ada@example.com", skills: ["Math"], social_profiles: [{ type: "linkedin", url: "https://linkedin.com/in/ada" }], experience_entries: [{ company: "Analytical Engines", title: "Engineer" }] }, 2)).toMatchObject({ values: { firstName: "Ada", lastName: "Lovelace", linkedinUrl: "https://linkedin.com/in/ada", skills: '["Math"]', experienceEntries: expect.stringContaining("Analytical Engines") } });
  });

  it("paginates then fetches candidate details", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ id: "a" }], paging: { next: "https://demo.workable.com/spi/v3/candidates?page=2" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ id: "b" }], paging: {} })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "a", firstname: "Ada", lastname: "Lovelace", email: "ada@example.com" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "b", firstname: "Grace", lastname: "Hopper", email: "grace@example.com" })));
    await expect(fetchWorkableCandidateImportRows({ subdomain: "demo", apiToken: "a".repeat(32) }, fetcher)).resolves.toMatchObject({ skipped: 0, rows: [{ values: { email: "ada@example.com" } }, { values: { email: "grace@example.com" } }] });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("backs off and retries a rate-limited request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "0.001" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ id: "a" }], paging: {} })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "a", firstname: "Ada", lastname: "Lovelace", email: "ada@example.com" })));
    const sleep = vi.fn(async () => {});

    await expect(
      fetchWorkableCandidateImportRows(
        { subdomain: "demo", apiToken: "a".repeat(32) },
        fetcher,
        sleep,
      ),
    ).resolves.toMatchObject({ skipped: 0, rows: [{ values: { email: "ada@example.com" } }] });
    expect(sleep).toHaveBeenCalledWith(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
