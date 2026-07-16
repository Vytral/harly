import { describe, expect, it, vi } from "vitest";
import { fetchLeverCandidateImportRows, leverOpportunityToImportRow } from "./lever";

describe("Lever import", () => {
  it("maps opportunities to candidate rows", () => {
    expect(leverOpportunityToImportRow({ name: "Ada Lovelace", emails: ["ada@example.com"], links: ["https://linkedin.com/in/ada"], tags: ["Math"] }, 2)).toMatchObject({ values: { firstName: "Ada", linkedinUrl: "https://linkedin.com/in/ada", skills: '["Math"]' } });
  });
  it("follows Lever offset pagination", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ name: "Ada Lovelace", emails: ["ada@example.com"] }], hasNext: true, next: "cursor" }))).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ name: "Grace Hopper", emails: ["grace@example.com"] }], hasNext: false })));
    await expect(fetchLeverCandidateImportRows("a".repeat(32), fetcher)).resolves.toMatchObject({ rows: [{ values: { email: "ada@example.com" } }, { values: { email: "grace@example.com" } }] });
  });
});
