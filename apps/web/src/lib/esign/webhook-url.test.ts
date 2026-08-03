import { describe, expect, it } from "vitest";

import { buildEsignWebhookUrl } from "./webhook-url";

describe("buildEsignWebhookUrl", () => {
  it("serializes only the workspace selector", () => {
    const url = buildEsignWebhookUrl(
      "https://harly.test/api/integrations/docuseal/webhook",
      "workspace/1",
    );
    expect(url).toBe("https://harly.test/api/integrations/docuseal/webhook?ws=workspace%2F1");
    expect(url).not.toContain("secret");
  });
});
