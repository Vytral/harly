import { describe, expect, it } from "vitest";

import { GET, POST } from "./route";

describe("/api/v1/automations", () => {
  it("returns gone while the public automations API is withdrawn", async () => {
    for (const handler of [GET, POST]) {
      const response = await handler(new Request("https://harly.dev"), undefined);
      expect(response.status).toBe(410);
      const body = await response.json();
      expect(body.error.code).toBe("gone");
      expect(body.error.message).toMatch(/withdrawn/i);
    }
  });
});
