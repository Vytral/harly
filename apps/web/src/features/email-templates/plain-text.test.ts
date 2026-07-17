import { describe, expect, it } from "vitest";

import { templateHtmlToPlainText } from "./plain-text";

describe("templateHtmlToPlainText", () => {
  it("keeps template structure and decodes common entities for plain-text composers", () => {
    expect(
      templateHtmlToPlainText(
        "<p>Hi <strong>{{candidate_first_name}}</strong>,</p><p>We&apos;d like to talk &amp; learn more.</p><ul><li>Bring a CV</li><li>Ask questions</li></ul>",
      ),
    ).toBe(
      "Hi {{candidate_first_name}},\n\nWe'd like to talk & learn more.\n\n• Bring a CV\n• Ask questions",
    );
  });

  it("drops embedded executable or styling content instead of exposing it in the message", () => {
    expect(
      templateHtmlToPlainText(
        '<p>Hello</p><script>alert("no")</script><style>body { color: red; }</style><p>World</p>',
      ),
    ).toBe("Hello\n\nWorld");
  });
});
