import { describe, expect, it } from "vitest";

import { sanitizeRichHtml } from "./rich-html";
import { accentOnSurface, contrastRatio, normalizeHex, readableInk, withAlpha } from "./color";

describe("sanitizeRichHtml", () => {
  it("keeps formatting and drops scripts, handlers and unsafe URLs", () => {
    const out = sanitizeRichHtml(
      '<h2>Hi</h2><p onclick="x()">a <strong>b</strong> <a href="javascript:alert(1)">bad</a> <a href="https://e.com" target="_blank">ok</a></p><script>alert(1)</script><img src="x" onerror="y()">',
      { allowEmbeds: true },
    );
    expect(out).toContain("<h2>Hi</h2>");
    expect(out).toContain("<strong>b</strong>");
    expect(out).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("replaces iframes with the opt-in placeholder until embeds are allowed", () => {
    const html = '<p>x</p><iframe src="https://player.example.com/v"></iframe>';
    expect(sanitizeRichHtml(html, { allowEmbeds: false })).toContain("data-allow-embeds");
    expect(sanitizeRichHtml(html, { allowEmbeds: false })).not.toContain("<iframe");
    expect(sanitizeRichHtml(html, { allowEmbeds: true })).toContain("<iframe");
  });

  it("drops non-http iframe sources", () => {
    const out = sanitizeRichHtml('<iframe src="javascript:alert(1)"></iframe>', { allowEmbeds: true });
    expect(out).not.toContain("javascript:");
  });
});

describe("career colour helpers", () => {
  it("expands 3-digit hex so alpha never produces invalid CSS", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(withAlpha("#abc", 0.9)).toBe("rgba(170, 187, 204, 0.9)");
  });

  it("readableInk clears 4.5:1 on risky accents", () => {
    for (const bg of ["#f4c100", "#B8F04A", "#7a7a7a", "#808080", "#2563eb", "#111111", "#ff0000"]) {
      expect(contrastRatio(readableInk(bg), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("accentOnSurface darkens or lightens until legible", () => {
    expect(contrastRatio(accentOnSurface("#B8F04A", "#ffffff"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accentOnSurface("#1e3a8a", "#161614"), "#161614")).toBeGreaterThanOrEqual(4.5);
  });
});
