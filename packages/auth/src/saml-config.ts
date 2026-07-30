import { createPrivateKey, X509Certificate } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

const providerIdPattern = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type ValidatedSamlRegistration = {
  providerId: string;
  issuer: string;
  domain: string;
  entryPoint: string;
  cert: string;
  callbackUrl: string;
  audience: string;
  spMetadata: { entityID: string };
  idpMetadata?: { metadata: string };
  privateKey?: string;
  authnRequestsSigned: boolean;
};

export type ParsedSamlMetadata = {
  entityID: string;
  entryPoint: string;
  cert: string;
  wantAuthnRequestsSigned: boolean;
  metadata: string;
};

function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function parseSamlMetadata(metadata: string): ParsedSamlMetadata {
  if (Buffer.byteLength(metadata, "utf8") > 100 * 1024) {
    throw new Error("SAML metadata must be smaller than 100 KB.");
  }
  if (!metadata.trim() || /<!DOCTYPE/i.test(metadata)) {
    throw new Error("SAML metadata must be XML without a DOCTYPE declaration.");
  }

  let parsed: Record<string, any>;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      removeNSPrefix: true,
      processEntities: false,
      trimValues: true,
    }).parse(metadata);
  } catch {
    throw new Error("SAML metadata is not valid XML.");
  }

  const descriptor = parsed.EntityDescriptor;
  const idp = asArray(descriptor?.IDPSSODescriptor)[0];
  const entityID = typeof descriptor?.["@_entityID"] === "string" ? descriptor["@_entityID"] : "";
  const services = asArray(idp?.SingleSignOnService);
  const service = services.find((item) => item?.["@_Binding"] === "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST") ?? services[0];
  const entryPoint = typeof service?.["@_Location"] === "string" ? service["@_Location"] : "";
  const keyDescriptor = asArray(idp?.KeyDescriptor).find((item) => !item?.["@_use"] || item["@_use"] === "signing") ?? asArray(idp?.KeyDescriptor)[0];
  const certificate = keyDescriptor?.KeyInfo?.X509Data?.X509Certificate;
  const cert = typeof certificate === "string" ? certificate : "";

  if (!entityID || !entryPoint || !cert) {
    throw new Error("SAML metadata must include entityID, a SingleSignOnService, and a signing certificate.");
  }

  return {
    entityID,
    entryPoint,
    cert: normalizeSamlCertificate(cert),
    wantAuthnRequestsSigned: idp?.["@_WantAuthnRequestsSigned"] === true || idp?.["@_WantAuthnRequestsSigned"] === "true",
    metadata,
  };
}

function requireUrl(value: string, label: string, allowHttp: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} must not contain credentials or a fragment.`);
  }
  if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
    throw new Error(`${label} must use HTTPS.`);
  }
  return parsed.toString();
}

export function normalizeSsoProviderId(value: string): string {
  const providerId = value.trim().toLowerCase();
  if (!providerIdPattern.test(providerId)) {
    throw new Error("Provider ID must be 2-64 characters using lowercase letters, numbers, dots, hyphens, or underscores.");
  }
  return providerId;
}

export function normalizeSsoDomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (!domainPattern.test(domain) || domain.includes("..")) {
    throw new Error("Email domain must be a valid DNS name.");
  }
  return domain;
}

export function normalizeSamlCertificate(value: string): string {
  const compact = value
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new Error("SAML certificate must be a valid PEM-encoded X.509 certificate.");
  }
  const certificate = `-----BEGIN CERTIFICATE-----\n${compact.match(/.{1,64}/g)?.join("\n")}\n-----END CERTIFICATE-----`;
  let parsed: X509Certificate;
  try {
    parsed = new X509Certificate(certificate);
  } catch {
    throw new Error("SAML certificate must be a valid PEM-encoded X.509 certificate.");
  }
  const now = Date.now();
  if (now < Date.parse(parsed.validFrom) || now > Date.parse(parsed.validTo)) {
    throw new Error("SAML certificate is expired or not yet valid.");
  }
  return certificate;
}

export function normalizeSamlPrivateKey(value: string): string {
  const key = value.trim();
  if (!key || !/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(key)) {
    throw new Error("SP private key must be a PEM-encoded private key.");
  }
  try {
    createPrivateKey(key);
  } catch {
    throw new Error("SP private key must be a valid PEM-encoded private key.");
  }
  return key;
}

export function validateSamlRegistration(input: {
  providerId: string;
  issuer: string;
  domain: string;
  entryPoint: string;
  cert: string;
  appUrl: string;
  allowHttp?: boolean;
  metadata?: string;
  privateKey?: string;
  authnRequestsSigned?: boolean;
}): ValidatedSamlRegistration {
  const metadata = input.metadata ? parseSamlMetadata(input.metadata) : undefined;
  const providerId = normalizeSsoProviderId(input.providerId);
  const issuer = requireUrl(metadata?.entityID || input.issuer, "SAML issuer", input.allowHttp ?? false);
  const entryPoint = requireUrl(metadata?.entryPoint || input.entryPoint, "SAML entry point", input.allowHttp ?? false);
  const appUrl = requireUrl(input.appUrl, "Harly public URL", input.allowHttp ?? false).replace(/\/$/, "");
  const domain = normalizeSsoDomain(input.domain);
  const cert = normalizeSamlCertificate(metadata?.cert || input.cert);
  const privateKey = input.privateKey ? normalizeSamlPrivateKey(input.privateKey) : undefined;
  const authnRequestsSigned = input.authnRequestsSigned ?? metadata?.wantAuthnRequestsSigned ?? false;
  if (authnRequestsSigned && !privateKey) {
    throw new Error("This Identity Provider requires signed AuthnRequests. Configure an SP private key.");
  }
  const callbackUrl = `${appUrl}/api/auth/sso/saml2/sp/acs/${encodeURIComponent(providerId)}`;
  return {
    providerId,
    issuer,
    domain,
    entryPoint,
    cert,
    callbackUrl,
    audience: appUrl,
    spMetadata: { entityID: appUrl },
    idpMetadata: metadata ? { metadata: metadata.metadata } : undefined,
    privateKey,
    authnRequestsSigned,
  };
}
