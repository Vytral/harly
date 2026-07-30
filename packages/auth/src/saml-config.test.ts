import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeSamlCertificate,
  normalizeSsoDomain,
  normalizeSsoProviderId,
  parseSamlMetadata,
  validateSamlRegistration,
} from "./saml-config";

const testDirectory = resolve(fileURLToPath(import.meta.url), "../../test");

describe("SAML registration validation", () => {
  it("normalizes provider IDs and domains", () => {
    expect(normalizeSsoProviderId("  Okta-Prod ")).toBe("okta-prod");
    expect(normalizeSsoDomain("Example.COM.")).toBe("example.com");
  });

  it("rejects unsafe provider IDs, domains, and certificates", () => {
    expect(() => normalizeSsoProviderId("../../provider")).toThrow();
    expect(() => normalizeSsoDomain("https://example.com")).toThrow();
    expect(() => normalizeSamlCertificate("not-a-certificate")).toThrow();
  });

  it("rejects HTTP endpoints in production mode", () => {
    expect(() =>
      validateSamlRegistration({
        providerId: "okta-prod",
        issuer: "http://idp.example.com/entity",
        domain: "example.com",
        entryPoint: "http://idp.example.com/sso",
        cert: "not-a-certificate",
        appUrl: "https://harly.example.com",
      }),
    ).toThrow("SAML issuer must use HTTPS.");
  });

  it("parses the supplied IdP metadata and preserves signed-request requirements", () => {
    const metadata = readFileSync(resolve(testDirectory, "fixtures/mock-saml-metadata.xml"), "utf8");
    const parsed = parseSamlMetadata(metadata);

    expect(parsed.entityID).toBe("https://saml.example.com/entityid");
    expect(parsed.entryPoint).toBe("https://mocksaml.com/api/saml/sso");
    expect(parsed.wantAuthnRequestsSigned).toBe(true);
    expect(parsed.cert).toContain("BEGIN CERTIFICATE");
  });

  it("requires an SP private key when metadata requires signed AuthnRequests", () => {
    const metadata = readFileSync(resolve(testDirectory, "fixtures/mock-saml-metadata.xml"), "utf8");

    expect(() =>
      validateSamlRegistration({
        providerId: "mock-saml",
        issuer: "",
        domain: "example.com",
        entryPoint: "",
        cert: "",
        appUrl: "https://harly.example.com",
        metadata,
      }),
    ).toThrow("SP private key");
  });
});
