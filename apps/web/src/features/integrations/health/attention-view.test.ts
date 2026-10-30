import { describe, expect, it } from "vitest";

import { INTEGRATION_HEALTH_KEYS } from "./model";
import { ATTENTION_TARGET, attentionMessage, reconnectHref } from "./attention-view";

describe("integration attention view", () => {
  it("names every health key and points its Reconnect link at a settings page", () => {
    for (const key of INTEGRATION_HEALTH_KEYS) {
      expect(ATTENTION_TARGET[key].name.length).toBeGreaterThan(0);
      expect(reconnectHref(key)).toBe(`/settings/integrations/${ATTENTION_TARGET[key].slug}`);
    }
  });

  it("tells a revoked connection apart from a failing one", () => {
    expect(attentionMessage({ state: "needs_reconnect" })).toMatch(/revoked|expired/);
    expect(attentionMessage({ state: "degraded" })).toMatch(/failing/);
  });
});
