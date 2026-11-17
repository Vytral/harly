import { describe, expect, it } from "vitest";

import { sanitizeComposerHtml, sanitizeTemplateHtml } from "./template-html.server";

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

describe("sanitizeComposerHtml", () => {
  it("strips scripts, handlers, images and unsafe URLs from composer HTML", () => {
    const output = sanitizeComposerHtml(
      '<p onclick="x()">Hi</p><script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">go</a><iframe src="https://evil.example.test"></iframe>',
    );
    expect(output).not.toMatch(/script|onclick|onerror|<img|javascript:|iframe/i);
    expect(output).toContain("<p>Hi</p>");
  });

  it("keeps what the composer produces", () => {
    const output = sanitizeComposerHtml(
      '<h3>Title</h3><p style="text-align: center; position: fixed"><u>Hi</u> <a href="mailto:a@example.test">mail</a></p><pre><code>x</code></pre><hr>',
    );
    expect(output).toContain("<h3>Title</h3>");
    expect(output).toContain('style="text-align:center"');
    expect(output).not.toContain("position");
    expect(output).toContain("<u>Hi</u>");
    expect(output).toContain('href="mailto:a@example.test"');
    expect(output).toContain("<pre><code>x</code></pre>");
  });
});
