import { describe, expect, it } from "vitest";

import {
  DEFAULT_ASSISTANT_BRANDING,
  assistantBrandingSchema,
  readAssistantBranding,
  toClientAssistantBranding,
  writeAssistantBranding,
} from "./assistant-branding-shared";

describe("assistant branding", () => {
  it("defaults when metadata is empty, null or malformed", () => {
    expect(readAssistantBranding(null)).toEqual(DEFAULT_ASSISTANT_BRANDING);
    expect(readAssistantBranding("not json")).toEqual(DEFAULT_ASSISTANT_BRANDING);
    expect(readAssistantBranding('{"other":1}')).toEqual(DEFAULT_ASSISTANT_BRANDING);
  });

  it("preserves other metadata keys when writing", () => {
    const raw = JSON.stringify({ harlyDemoSandbox: { a: 1 } });
    const next = writeAssistantBranding(raw, {
      assistantName: "Aria",
      assistantAvatar: { kind: "upload", url: "/uploads/a.png" },
      showPoweredBy: false,
    });
    expect(JSON.parse(next).harlyDemoSandbox).toEqual({ a: 1 });
    const read = readAssistantBranding(next);
    expect(read.assistantName).toBe("Aria");
    expect(toClientAssistantBranding(read)).toEqual({
      name: "Aria",
      avatarUrl: "/uploads/a.png",
      showPoweredBy: false,
    });
  });

  it("falls back per field on bad stored values", () => {
    const raw = JSON.stringify({
      assistantBranding: {
        assistantName: "x".repeat(40),
        assistantAvatar: { kind: "upload", url: "javascript:alert(1)" },
        showPoweredBy: false,
      },
    });
    const read = readAssistantBranding(raw);
    expect(read.assistantName).toBe("Harly AI");
    expect(read.assistantAvatar).toEqual({ kind: "harly" });
    expect(read.showPoweredBy).toBe(false);
  });

  it("validates input", () => {
    const base = { assistantAvatar: { kind: "harly" }, showPoweredBy: true };
    expect(assistantBrandingSchema.safeParse({ ...base, assistantName: " " }).success).toBe(false);
    expect(assistantBrandingSchema.safeParse({ ...base, assistantName: "x".repeat(25) }).success).toBe(false);
    expect(assistantBrandingSchema.safeParse({ ...base, assistantName: "Aria" }).success).toBe(true);
  });
});
