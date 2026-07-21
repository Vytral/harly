import { describe, expect, it } from "vitest";

import { normalizeDocuSignRestBaseUrl } from "./config";

describe("DocuSign REST base URL", () => {
  it("normalizes regional HTTPS DocuSign hosts", () => {
    expect(normalizeDocuSignRestBaseUrl("https://eu.docusign.net")).toBe(
      "https://eu.docusign.net/restapi",
    );
    expect(normalizeDocuSignRestBaseUrl("https://demo.docusign.net/restapi")).toBe(
      "https://demo.docusign.net/restapi",
    );
  });

  it("rejects non-DocuSign or non-HTTPS hosts", () => {
    expect(normalizeDocuSignRestBaseUrl("http://eu.docusign.net")).toBeNull();
    expect(normalizeDocuSignRestBaseUrl("https://docusign.net.evil.example")).toBeNull();
    expect(normalizeDocuSignRestBaseUrl("https://example.com")).toBeNull();
  });
});
