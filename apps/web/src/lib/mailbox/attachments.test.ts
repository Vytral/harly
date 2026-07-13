import { describe, expect, it } from "vitest";

import { validateMailboxAttachment } from "./attachments";

describe("validateMailboxAttachment", () => {
  it("sanitizes attachment names before constructing a storage key", () => {
    expect(
      validateMailboxAttachment({
        filename: "../../offer letter.pdf",
        contentType: "application/pdf",
        size: 12,
      }),
    ).toMatchObject({ ok: true, filename: "offer-letter.pdf" });
  });

  it("rejects executable and oversized payloads", () => {
    expect(validateMailboxAttachment({ filename: "run.exe", contentType: "application/x-msdownload", size: 12 })).toEqual({ ok: false, error: "Unsupported attachment type." });
    expect(validateMailboxAttachment({ filename: "large.pdf", contentType: "application/pdf", size: 26 * 1024 * 1024 })).toEqual({ ok: false, error: "Attachment exceeds the 25MB limit." });
  });
});
