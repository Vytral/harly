import { describe, expect, it } from "vitest";

import { GET, POST } from "./route";

describe("/api/v1/automations", () => {
  it("returns gone while automations are disabled", async () => {
    for (const handler of [GET, POST]) {
      const response = await handler(new Request("https://harly.dev"), undefined);
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({
        ok: false,
        error: "Automations are temporarily disabled.",
      });
    }
  });
});
