import { describe, expect, it } from "vitest";

import { CAREER_PRESETS, careerTemplates } from "@/features/career-page/config";

import {
  DEMO_DEFAULT_STYLE,
  DEMO_STYLES,
  applyDemoStyle,
  parseDemoStyle,
} from "./sandbox-styles";

describe("demo styles", () => {
  it("offers exactly the real career-page templates", () => {
    expect(DEMO_STYLES.map((style) => style.key).sort()).toEqual([...careerTemplates].sort());
  });

  it("falls back to the default for unknown input", () => {
    expect(parseDemoStyle("join")).toBe("join");
    expect(parseDemoStyle("greenhouse")).toBe(DEMO_DEFAULT_STYLE);
    expect(parseDemoStyle(undefined)).toBe(DEMO_DEFAULT_STYLE);
    expect(parseDemoStyle(null)).toBe(DEMO_DEFAULT_STYLE);
  });

  it("re-skins a config without touching its content", () => {
    const base = { ...CAREER_PRESETS.playful(), intro: { body: "<p>hi</p>", chips: [] } };
    const styled = applyDemoStyle(base, "minimal");
    expect(styled.template).toBe("minimal");
    expect(styled.theme.rounded).toBe("sharp");
    expect(styled.theme.accent).toBe(base.theme.accent);
    expect(styled.intro).toEqual(base.intro);
    // Pure: the input is left alone.
    expect(base.template).toBe("playful");
  });

  it("puts the showcase look on warm paper", () => {
    const styled = applyDemoStyle(CAREER_PRESETS.playful(), "showcase");
    expect(styled.template).toBe("showcase");
    expect(styled.theme.background).toBe("#f5f5f4");
    expect(parseDemoStyle("showcase")).toBe("showcase");
  });
});
