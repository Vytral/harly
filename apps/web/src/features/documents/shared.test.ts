import { describe, expect, it } from "vitest";

import {
  formatDocumentSize,
  isPreviewable,
  slugifyDocumentCategory,
} from "./shared";
import { documentExtensionMatches } from "@/lib/storage-validation";

describe("document helpers", () => {
  it("normalizes category slugs without leaking punctuation", () => {
    expect(slugifyDocumentCategory("  Employment Agreement / 2026 ")).toBe("employment-agreement-2026");
  });

  it("requires an extension consistent with the MIME type", () => {
    expect(documentExtensionMatches("offer.pdf", "application/pdf")).toBe(true);
    expect(documentExtensionMatches("offer.docx", "application/pdf")).toBe(false);
  });

  it("identifies supported previews and formats sizes", () => {
    expect(isPreviewable("application/pdf")).toBe(true);
    expect(isPreviewable("application/octet-stream")).toBe(false);
    expect(formatDocumentSize(1536)).toBe("2 KB");
  });
});
