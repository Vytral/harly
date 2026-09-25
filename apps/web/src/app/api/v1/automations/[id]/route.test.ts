import { describe, expect, it } from "vitest";

import { DELETE, GET, PATCH } from "./route";

describe("/api/v1/automations/:id", () => {
  it("returns gone for every operation while the public automations API is withdrawn", async () => {
    for (const handler of [GET, PATCH, DELETE]) {
      const response = await handler(new Request("https://harly.dev"), undefined);
      expect(response.status).toBe(410);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/withdrawn/i);
    }
  });
});
