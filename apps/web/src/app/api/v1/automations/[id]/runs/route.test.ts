import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("/api/v1/automations/:id/runs", () => {
  it("returns gone while automations are disabled", async () => {
    const response = await GET(new Request("https://harly.dev"), undefined);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Automations are temporarily disabled.",
    });
  });
});
