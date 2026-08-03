import { describe, expect, it } from "vitest";

import { trustedDocusealArtifactUrl } from "./url-security";

const ctx = {
  baseUrl: "https://sign.example.test",
  apiUrl: "https://sign.example.test/api",
};

describe("trustedDocusealArtifactUrl", () => {
  it("allows same-origin absolute and relative artifact URLs", () => {
    expect(trustedDocusealArtifactUrl(ctx, "/uploads/signed.pdf")).toBe(
      "https://sign.example.test/uploads/signed.pdf",
    );
    expect(
      trustedDocusealArtifactUrl(ctx, "https://sign.example.test/uploads/signed.pdf"),
    ).toBe("https://sign.example.test/uploads/signed.pdf");
  });

  it("rejects a cross-origin URL before the bearer token can be sent", () => {
    expect(
      trustedDocusealArtifactUrl(ctx, "https://attacker.example/signed.pdf"),
    ).toBeNull();
    expect(
      trustedDocusealArtifactUrl(ctx, "https://sign.example.test.evil/signed.pdf"),
    ).toBeNull();
  });

  it("rejects credentials and non-http protocols", () => {
    expect(
      trustedDocusealArtifactUrl(ctx, "https://user:pass@sign.example.test/a"),
    ).toBeNull();
    expect(trustedDocusealArtifactUrl(ctx, "file:///etc/passwd")).toBeNull();
  });
});
