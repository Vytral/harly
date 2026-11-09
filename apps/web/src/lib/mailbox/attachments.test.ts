import { describe, expect, it } from "vitest";

import { makeT } from "@/test-support/translator";

import { validateMailboxAttachment } from "./attachments";

const t = makeT("server.mailbox");

describe("validateMailboxAttachment", () => {
  it("sanitizes attachment names before constructing a storage key", () => {
    expect(
      validateMailboxAttachment({
        filename: "../../offer letter.pdf",
        contentType: "application/pdf",
        size: 12,
      }, t),
    ).toMatchObject({ ok: true, filename: "offer-letter.pdf" });
  });

  it("rejects executable and oversized payloads", () => {
    expect(validateMailboxAttachment({ filename: "run.exe", contentType: "application/x-msdownload", size: 12 }, t)).toEqual({ ok: false, error: t("attachments.unsupportedType") });
    expect(validateMailboxAttachment({ filename: "large.pdf", contentType: "application/pdf", size: 26 * 1024 * 1024 }, t)).toEqual({ ok: false, error: t("attachments.tooLarge") });
  });
});
