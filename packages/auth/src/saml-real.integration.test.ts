import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import { parseSamlMetadata, validateSamlRegistration } from "./saml-config";

const integration = process.env.RUN_SAML_REAL_INTEGRATION === "1" ? describe : describe.skip;

/**
 * Live IdP smoke test. It is intentionally opt-in because it needs a public
 * IdP metadata URL and a reachable Harly ACS URL; the normal suite remains
 * deterministic and never sends credentials to an external provider.
 */
integration("real SAML IdP", () => {
  it("downloads metadata and validates the production SP contract", async () => {
    const metadataUrl = process.env.SAML_IDP_METADATA_URL;
    const appUrl = process.env.HARLY_PUBLIC_URL;
    const providerId = process.env.SAML_PROVIDER_ID ?? "live-saml";
    const domain = process.env.SAML_DOMAIN;

    if (!metadataUrl || !appUrl || !domain) {
      throw new Error(
        "RUN_SAML_REAL_INTEGRATION=1 requires SAML_IDP_METADATA_URL, HARLY_PUBLIC_URL, and SAML_DOMAIN.",
      );
    }

    const metadata = process.env.SAML_IDP_METADATA_FILE
      ? await readFile(process.env.SAML_IDP_METADATA_FILE, "utf8")
      : await (async () => {
          const response = await fetch(metadataUrl, { signal: AbortSignal.timeout(15_000) });
          expect(response.ok).toBe(true);
          return response.text();
        })();
    const parsed = parseSamlMetadata(metadata);
    const registration = validateSamlRegistration({
      providerId,
      issuer: "",
      domain,
      entryPoint: "",
      cert: "",
      appUrl,
      metadata,
      privateKey: process.env.SAML_SP_PRIVATE_KEY,
      authnRequestsSigned: parsed.wantAuthnRequestsSigned,
    });

    expect(registration.callbackUrl).toBe(
      `${appUrl.replace(/\/$/, "")}/api/auth/sso/saml2/sp/acs/${encodeURIComponent(providerId)}`,
    );
    expect(registration.issuer).toBe(parsed.entityID);
  });
});
