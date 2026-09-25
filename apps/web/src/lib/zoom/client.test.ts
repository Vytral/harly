import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getZoomToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./config", () => ({
  getZoomToken: mocks.getZoomToken,
}));

vi.stubGlobal("fetch", mocks.fetch);

import { createMeeting, findMeetingByTrackingField } from "./client";

describe("Zoom meeting client reconciliation", () => {
  beforeEach(() => {
    mocks.getZoomToken.mockReset();
    mocks.fetch.mockReset();
    mocks.getZoomToken.mockResolvedValue("zoom-token");
  });

  it("creates a meeting with a hidden stable tracking marker", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 123,
        join_url: "https://zoom.us/j/123",
      }),
    });

    await createMeeting("workspace-1", {
      topic: "Screening",
      tracking_fields: [
        { field: "harly_interview_effect", value: "create:1:30:i-1", visible: false },
      ],
      start_time: "2030-01-01T10:00:00Z",
      duration: 30,
    });

    const [, request] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      topic: "Screening",
      tracking_fields: [
        { field: "harly_interview_effect", value: "create:1:30:i-1", visible: false },
      ],
    });
  });

  it("recovers only an exact marker across bounded pages", async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          meetings: [
            {
              id: 1,
              join_url: "https://zoom.us/j/1",
              topic: "Other",
              tracking_fields: [{ field: "harly_interview_effect", value: "other" }],
            },
          ],
          next_page_token: "page-2",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          meetings: [
            {
              id: 2,
              join_url: "https://zoom.us/j/2",
              topic: "Screening",
              tracking_fields: [
                { field: "harly_interview_effect", value: "create:1:30:i-1" },
              ],
            },
          ],
        }),
      });

    const result = await findMeetingByTrackingField(
      "workspace-1",
      "harly_interview_effect",
      "create:1:30:i-1",
    );

    expect(result?.id).toBe(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(String((mocks.fetch.mock.calls[1] as [string])[0])).toContain(
      "next_page_token=page-2",
    );
  });

  it("does not recover a merely similar meeting", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        meetings: [
          {
            id: 1,
            join_url: "https://zoom.us/j/1",
            topic: "Screening",
            tracking_fields: [
              { field: "harly_interview_effect", value: "create:1:30:other" },
            ],
          },
        ],
      }),
    });

    await expect(
      findMeetingByTrackingField(
        "workspace-1",
        "harly_interview_effect",
        "create:1:30:i-1",
      ),
    ).resolves.toBeNull();
  });
});
