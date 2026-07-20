import { describe, expect, it } from "vitest";

import { normalizeInboundReplyDomain } from "./inbound-token";

describe("normalizeInboundReplyDomain", () => {
  it("accepts a hostname used for inbound replies", () => {
    expect(normalizeInboundReplyDomain(" Replies.Example.com ")).toBe(
      "replies.example.com",
    );
  });

  it("rejects URLs, ports, localhost, and malformed labels", () => {
    for (const value of [
      "https://replies.example.com",
      "localhost:3000",
      "replies.example.com:443",
      "-replies.example.com",
      "replies..example.com",
    ]) {
      expect(normalizeInboundReplyDomain(value)).toBeNull();
    }
  });
});
