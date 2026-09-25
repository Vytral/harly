import { describe, expect, it } from "vitest";

import { sanitizeLegalHtml } from "@/features/legal/sanitize-html.server";

describe("sanitizeLegalHtml", () => {
  it("removes executable markup and unsafe URL schemes", () => {
    const result = sanitizeLegalHtml(
      '<p>Hello</p><img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">click</a>',
    );

    expect(result).toContain("<p>Hello</p>");
    expect(result).not.toContain("script");
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("javascript:");
  });

  it("keeps safe legal links and text formatting", () => {
    const result = sanitizeLegalHtml(
      '<h2 class="heading">Terms</h2><a href="https://example.com" target="_blank">Read</a>',
    );

    expect(result).toContain('<h2 class="heading">Terms</h2>');
    expect(result).toContain('href="https://example.com"');
  });
});
