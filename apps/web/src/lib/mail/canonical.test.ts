import { describe, expect, it } from "vitest";

import { legacyMailFingerprint, normalizeFingerprintBody, normalizeMailSubject } from "./canonical";

describe("canonical mail identity", () => {
  it("normalizes subject and body deterministically", () => {
    expect(normalizeMailSubject(" Re:  FWD: Availability  ")).toBe("availability");
    expect(normalizeFingerprintBody("hello\r\nworld  \n")).toBe("hello\nworld");
  });

  it("keeps retries stable across line endings, whitespace, and seconds", () => {
    const first = legacyMailFingerprint({
      workspaceId: "workspace-1",
      candidateId: "candidate-1",
      applicationId: "application-1",
      direction: "inbound",
      fromEmail: " Candidate@Example.com ",
      toEmails: ["reply@example.com"],
      subject: "Re: Availability",
      body: " I can meet.\r\n",
      createdAt: new Date("2026-07-12T12:00:12.000Z"),
    });
    const retry = legacyMailFingerprint({
      workspaceId: "workspace-1",
      candidateId: "candidate-1",
      applicationId: "application-1",
      direction: "inbound",
      fromEmail: "candidate@example.com",
      toEmails: ["reply@example.com"],
      subject: " availability ",
      body: "I can meet.\n",
      createdAt: new Date("2026-07-12T12:00:59.000Z"),
    });
    expect(first).toBe(retry);
  });
});
