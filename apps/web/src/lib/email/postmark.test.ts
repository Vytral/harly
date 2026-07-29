import { describe, expect, it } from "vitest";

import { postmarkAdapter } from "@harly/emails";

function basic(secret: string) {
  return `Basic ${Buffer.from(`user:${secret}`).toString("base64")}`;
}

describe("Postmark inbound authentication", () => {
  it("accepts the configured secret", () => {
    expect(postmarkAdapter.verifySignature("{}", new Headers({ authorization: basic("secret") }), "secret")).toBe(true);
  });

  it("rejects malformed or differently sized credentials without throwing", () => {
    expect(() => postmarkAdapter.verifySignature("{}", new Headers({ authorization: basic("wrong") }), "secret")).not.toThrow();
    expect(postmarkAdapter.verifySignature("{}", new Headers({ authorization: basic("wrong") }), "secret")).toBe(false);
    expect(postmarkAdapter.verifySignature("{}", new Headers({ authorization: "Basic !!!" }), "secret")).toBe(false);
    expect(postmarkAdapter.verifySignature("{}", new Headers({ authorization: "Basic dXNlcg==" }), "secret")).toBe(false);
  });
});
