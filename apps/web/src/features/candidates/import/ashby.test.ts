import { describe, expect, it, vi } from "vitest";
import { ashbyCandidateToImportRow, fetchAshbyCandidateImportRows } from "./ashby";

describe("Ashby import", () => {
  it("maps an Ashby profile", () => {
    expect(ashbyCandidateToImportRow({ id: "a", name: "Ada Lovelace", email: "ada@example.com", linkedInUrl: "https://linkedin.com/in/ada", tags: ["Math"] }, 2)).toMatchObject({ values: { firstName: "Ada", lastName: "Lovelace", linkedinUrl: "https://linkedin.com/in/ada", skills: '["Math"]' } });
  });
  it("uses cursor pagination and gets full profiles", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ id: "a" }], moreDataAvailable: false, syncToken: "sync" }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: "a", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" })));
    await expect(fetchAshbyCandidateImportRows("a".repeat(32), fetcher)).resolves.toMatchObject({ syncToken: "sync", rows: [{ values: { email: "ada@example.com" } }] });
  });
});
