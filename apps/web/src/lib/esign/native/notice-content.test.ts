import { describe, expect, it } from "vitest";

import { buildNativeNotice, formatNoticeDate } from "./notice-content";

describe("buildNativeNotice", () => {
  it("says earlier signatures are kept but do not carry over when voided", () => {
    const notice = buildNativeNotice({ event: "voided", audience: "signer", recipientEmail: "a@b.test", documentName: "Offer.pdf", actorName: "Sam", signedBefore: [{ name: "Ana", signedAt: null }] }, "Acme");
    expect(notice.paragraphs.join(" ")).toContain("Ana");
    expect(notice.paragraphs.join(" ")).toContain("kept in the audit record");
    expect(notice.paragraphs.join(" ")).toContain("sign again");
  });
  it("includes the decline reason for the sender", () => {
    const notice = buildNativeNotice({ event: "declined", audience: "sender", recipientEmail: "s@b.test", documentName: "Offer.pdf", actorName: "Ana", reason: "Salary" }, "Acme");
    expect(notice.subject).toContain("Ana declined");
    expect(notice.paragraphs.join(" ")).toContain("Salary");
  });
  it("counts remaining signers in the receipt", () => {
    const notice = buildNativeNotice({ event: "receipt", audience: "signer", recipientEmail: "a@b.test", documentName: "X.pdf", signerCount: 3, signedCount: 1 }, "Acme");
    expect(notice.paragraphs[0]).toContain("2 more people");
  });
  it("formats dates readably in UTC", () => {
    expect(formatNoticeDate("2026-11-14T15:30:00.000Z")).toBe("November 14, 2026 at 3:30 PM UTC");
  });
});
