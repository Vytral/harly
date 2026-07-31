import { describe, expect, it } from "vitest";

import { DELETE, GET, PATCH } from "./route";

describe("/api/v1/automations/:id", () => {
  it("returns gone for every operation while automations are disabled", async () => {
    for (const handler of [GET, PATCH, DELETE]) {
      const response = await handler(new Request("https://harly.dev"), undefined);
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({
        ok: false,
        error: "Automations are temporarily disabled.",
      });
    }
  });
});
