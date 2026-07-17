import { describe, expect, it } from "vitest";

import { sanitizeTemplateHtml } from "./template-html.server";

describe("sanitizeTemplateHtml", () => {
  it("removes scripts, event handlers, and unsafe URLs", () => {
    const output = sanitizeTemplateHtml(
      '<p onclick=alert(1)>Hello<script>alert(2)</script><a href="javascript:alert(3)" onmouseover=alert(4)>link</a></p>',
    );

    expect(output).toBe('<p>Hello<a target="_blank" rel="noopener noreferrer">link</a></p>');
  });

  it("preserves the supported rich-text surface and safe links", () => {
    const output = sanitizeTemplateHtml(
      '<h2>Welcome</h2><p><strong>Hi</strong> <a href="https://harly.dev">there</a></p><ul><li>One</li></ul>',
    );

    expect(output).toContain("<h2>Welcome</h2>");
    expect(output).toContain("<strong>Hi</strong>");
    expect(output).toContain('href="https://harly.dev"');
    expect(output).toContain('<ul><li>One</li></ul>');
  });
});
