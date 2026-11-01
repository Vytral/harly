import { describe, expect, it } from "vitest";

import {
  deriveSignerState,
  describeExpiry,
  documentStateMeta,
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

describe("signature state helpers", () => {
  const now = Date.parse("2026-03-10T12:00:00Z");

  it("derives per-signer state from the recipient row", () => {
    expect(deriveSignerState({ status: "created", linkExpiresAt: null }, now)).toBe("waiting");
    expect(deriveSignerState({ status: "sent", linkExpiresAt: "2026-03-20T00:00:00Z" }, now)).toBe("invited");
    expect(deriveSignerState({ status: "sent", linkExpiresAt: "2026-03-01T00:00:00Z" }, now)).toBe("expired");
    expect(deriveSignerState({ status: "signed", linkExpiresAt: "2026-03-01T00:00:00Z" }, now)).toBe("signed");
    expect(deriveSignerState({ status: "voided", linkExpiresAt: null }, now)).toBe("voided");
  });

  it("combines archive, signature and date into one document state", () => {
    expect(documentStateMeta({ status: "archived", signatureStatus: "signed", expiresAt: null }).key).toBe("archived");
    expect(documentStateMeta({ status: "active", signatureStatus: "pending", expiresAt: null }).key).toBe("pending");
    expect(documentStateMeta({ status: "active", signatureStatus: "signed", expiresAt: "2020-01-01T00:00:00Z" }).key).toBe("signed");
    expect(documentStateMeta({ status: "active", signatureStatus: "unsigned", expiresAt: "2020-01-01T00:00:00Z" }).key).toBe("lapsed");
  });

  it("describes a date relative to now", () => {
    expect(describeExpiry(null, now)).toBeNull();
    expect(describeExpiry("2026-03-22T12:00:00Z", now)).toMatchObject({ label: "in 12 days", tone: "warning" });
    expect(describeExpiry("2026-03-07T12:00:00Z", now)).toMatchObject({ label: "3 days ago", tone: "danger" });
  });
});
