import { describe, expect, it, vi } from "vitest";

import {
  fetchJoinCandidateImportRows,
  joinApplicationToImportRow,
} from "./join";

describe("JOIN import", () => {
  it("maps nested candidate profiles and skips incomplete applications", () => {
    expect(
      joinApplicationToImportRow(
        {
          id: 42,
          candidate: {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
            phone: "+56 9",
            location: { city: "Santiago", country: "CL" },
            linkedInUrl: "https://linkedin.com/in/ada",
            skills: ["Math"],
            tags: [{ name: "Engineering" }],
            experience: [{ company: "Analytical Engines", title: "Engineer" }],
          },
        },
        2,
      ),
    ).toMatchObject({
      values: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        location: "Santiago, CL",
        linkedinUrl: "https://linkedin.com/in/ada",
        skills: '["Math","Engineering"]',
      },
    });
    expect(
      joinApplicationToImportRow({ id: 43, name: "No Email" }, 3),
    ).toBeNull();
  });

  it("follows JOIN pagination and sends the token as an authorization header", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 1,
                firstName: "Ada",
                lastName: "Lovelace",
                email: "ada@example.com",
              },
              ...Array.from({ length: 49 }, (_, index) => ({
                id: index + 2,
                firstName: "Candidate",
                lastName: String(index + 2),
                email: `candidate-${index + 2}@example.com`,
              })),
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })));

    const result = await fetchJoinCandidateImportRows("t".repeat(32), fetcher);
    expect(result).toMatchObject({ skipped: 0 });
    expect(result.rows).toHaveLength(50);
    expect(result.rows[0]).toMatchObject({ rowNumber: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.join.com/v2/applications?page=1&pageSize=50",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "t".repeat(32) },
    });
  });
});
