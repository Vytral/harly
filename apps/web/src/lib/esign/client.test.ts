import { afterEach, describe, expect, it, vi } from "vitest";

import { archiveSubmissionIdempotent } from "./client";

afterEach(() => vi.restoreAllMocks());

describe("archiveSubmissionIdempotent", () => {
  it("accepts a provider response that says the submission is already archived", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("provider unavailable", { status: 409 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ archived_at: "2026-07-28T12:00:00Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      archiveSubmissionIdempotent(
        {
          baseUrl: "https://sign.test",
          apiUrl: "https://sign.test/api",
          apiToken: "test-token",
          webhookSecret: null,
          offerSignatureChannel: "esign",
        },
        "submission-1",
      ),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
