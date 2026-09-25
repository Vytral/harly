import { afterEach, describe, expect, it } from "vitest";

import { legacyWorkflowDispatchDisabled } from "./status";

const previous = process.env.AUTOMATIONS_DISABLE_V1_DISPATCH;

afterEach(() => {
  if (previous === undefined) delete process.env.AUTOMATIONS_DISABLE_V1_DISPATCH;
  else process.env.AUTOMATIONS_DISABLE_V1_DISPATCH = previous;
});

describe("legacy automation drain switch", () => {
  it("is disabled by default", () => {
    delete process.env.AUTOMATIONS_DISABLE_V1_DISPATCH;
    expect(legacyWorkflowDispatchDisabled()).toBe(false);
  });

  it("blocks new v1 creation only for the explicit production value", () => {
    process.env.AUTOMATIONS_DISABLE_V1_DISPATCH = "1";
    expect(legacyWorkflowDispatchDisabled()).toBe(true);
    process.env.AUTOMATIONS_DISABLE_V1_DISPATCH = "true";
    expect(legacyWorkflowDispatchDisabled()).toBe(false);
  });
});
