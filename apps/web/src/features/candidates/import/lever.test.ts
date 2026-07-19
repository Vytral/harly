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
  it("backs off and retries a rate-limited request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "0.001" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ name: "Ada Lovelace", emails: ["ada@example.com"] }], hasNext: false })));
    const sleep = vi.fn(async () => {});

    await expect(
      fetchLeverCandidateImportRows("a".repeat(32), fetcher, sleep),
    ).resolves.toMatchObject({ rows: [{ values: { email: "ada@example.com" } }] });
    // retry-after 0.001s = 1ms; jitter for attempt 0 is min(250, 0) = 0 -> total 1ms.
    expect(sleep).toHaveBeenCalledWith(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects when the import exceeds the candidate cap", async () => {
    // One page claiming hasNext without a next offset would normally throw the
    // "no next offset" error first; instead, push enough rows in a single page
    // to trip the cap before pagination is re-evaluated.
    const over = Array.from({ length: 5001 }, (_, i) => ({ name: `C${i} Person`, emails: [`c${i}@example.com`] }));
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: over, hasNext: false })));
    await expect(fetchLeverCandidateImportRows("a".repeat(32), fetcher)).rejects.toThrow(/exceeds 5,000 opportunities/i);
  });
});
