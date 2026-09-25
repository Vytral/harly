import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("/api/v1/automations/:id/runs", () => {
  it("returns gone while the public automations API is withdrawn", async () => {
    const response = await GET(new Request("https://harly.dev"), undefined);
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/withdrawn/i);
  });
});
