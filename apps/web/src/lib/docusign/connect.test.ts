import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  connectEnvelopeId,
  connectEventKey,
  verifyDocuSignHmac,
} from "./connect";

describe("DocuSign Connect", () => {
  it("verifies the raw body against any rotated signature key", () => {
    const body = Buffer.from('{"event":"envelope-completed"}', "utf8");
    const activeKey = "active-connect-key-123456";
    const signature = createHmac("sha256", activeKey).update(body).digest("base64");

    expect(
      verifyDocuSignHmac(
        body,
        {
          "x-docusign-signature-1": "not-the-key",
          "X-DocuSign-Signature-2": signature,
        },
        ["retired-connect-key-123456", activeKey],
      ),
    ).toBe(true);
  });

  it("rejects a changed payload", () => {
    const body = Buffer.from('{"event":"envelope-completed"}', "utf8");
    const signature = createHmac("sha256", "connect-key-123456")
      .update(body)
      .digest("base64");

    expect(
      verifyDocuSignHmac(
        Buffer.from('{"event":"envelope-declined"}', "utf8"),
        { "x-docusign-signature-1": signature },
        ["connect-key-123456"],
      ),
    ).toBe(false);
  });

  it("extracts envelope ids from the payload or Connect URI", () => {
    expect(
      connectEnvelopeId({
        event: "envelope-completed",
        data: { envelopeId: "env-direct" },
      }),
    ).toBe("env-direct");

    const fromUri = {
      event: "envelope-completed",
      uri: "/restapi/v2.1/accounts/account/envelopes/env-from-uri",
      data: {},
    };
    expect(connectEnvelopeId(fromUri)).toBe("env-from-uri");
    expect(connectEventKey(fromUri)).toContain("env-from-uri");
  });
});
