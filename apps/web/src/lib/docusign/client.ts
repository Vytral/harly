import "server-only";

import { encryptSecret } from "@/lib/crypto";
import { db, workspaceSettings } from "@harly/db";
import { eq } from "drizzle-orm";

import {
  DEFAULT_DOCUSIGN_BASE_URL,
  getWorkspaceDocuSignConfig,
  getWorkspaceDocuSignCredentials,
} from "@/lib/docusign/config";

/**
 * DocuSign eSignature REST client — plain fetch, mirroring lib/outlook/client.ts.
 * No SDK dependency. Every REST call goes against the per-workspace resolved
 * base URL (from getUserInfo: account baseUri + "/restapi"); OAuth token
 * exchange/refresh goes against the OAuth host (account-d / account).
 */

/** OAuth token-exchange response. */
type DocuSignTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** getUserInfo response — one row per account the user belongs to. */
type DocuSignUserInfoAccount = {
  account_id?: string;
  is_default?: boolean;
  base_uri?: string;
  name?: string;
};

type DocuSignUserInfo = {
  sub?: string;
  name?: string;
  email?: string;
  accounts?: DocuSignUserInfoAccount[];
};

/**
 * Generic REST fetch wrapper against a DocuSign account base URL (already
 * includes /restapi). Throws on non-2xx with the body for diagnosis.
 */
export async function docusignFetch<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  // baseUrl is e.g. https://eu.docusign.net/restapi ; path starts with /v2.1/...
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DocuSign REST API ${res.status}: ${body}`);
  }

  // 204 No Content (e.g. some deletes) — no JSON to parse.
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/**
 * Exchange an authorization code for access + refresh tokens. Uses HTTP Basic
 * auth with client_id:client_secret (Authorization Code grant).
 */
export async function exchangeDocuSignCode(opts: {
  authBaseUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<DocuSignTokenResponse> {
  const res = await fetch(`${opts.authBaseUrl.replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${opts.clientId}:${opts.clientSecret}`,
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  });

  const data = (await res.json()) as DocuSignTokenResponse;
  if (!data.access_token) {
    throw new Error(
      `DocuSign token exchange failed: ${data.error ?? "unknown"} , ${data.error_description ?? ""}`,
    );
  }
  return data;
}

/** Fetch the authenticated user's profile + accounts. */
export async function getDocuSignUserInfo(
  accessToken: string,
  authBaseUrl: string,
): Promise<DocuSignUserInfo> {
  const res = await fetch(
    `${authBaseUrl.replace(/\/$/, "")}/oauth/userinfo`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DocuSign getUserInfo ${res.status}: ${body}`);
  }
  return (await res.json()) as DocuSignUserInfo;
}

/**
 * Refresh an expired access token using the stored refresh token. Persists the
 * rotated token pair. Mirrors refreshOutlookToken. Returns the fresh access token.
 */
export async function refreshDocuSignToken(opts: {
  workspaceId: string;
  authBaseUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const res = await fetch(
    `${opts.authBaseUrl.replace(/\/$/, "")}/oauth/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${opts.clientId}:${opts.clientSecret}`,
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: opts.refreshToken,
      }),
    },
  );

  const data = (await res.json()) as DocuSignTokenResponse;
  if (!data.access_token) {
    throw new Error(
      `DocuSign token refresh failed: ${data.error ?? "unknown"} , ${data.error_description ?? ""}`,
    );
  }

  // Refresh token may rotate; keep whichever we got back.
  const newRefreshToken = data.refresh_token ?? opts.refreshToken;
  const encryptedAccess = encryptSecret(data.access_token);
  const encryptedRefresh = encryptSecret(newRefreshToken);

  await db
    .update(workspaceSettings)
    .set({
      docusignAccessTokenCiphertext: encryptedAccess.ciphertext,
      docusignAccessTokenIv: encryptedAccess.iv,
      docusignAccessTokenTag: encryptedAccess.tag,
      docusignRefreshTokenCiphertext: encryptedRefresh.ciphertext,
      docusignRefreshTokenIv: encryptedRefresh.iv,
      docusignRefreshTokenTag: encryptedRefresh.tag,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.organizationId, opts.workspaceId));

  return data.access_token;
}

/** True when DocuSign rejected the stored refresh token (revoked/expired). */
export function isInvalidDocuSignGrant(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("invalid_grant");
}

/**
 * Resolve a fresh access token + REST base config for a workspace, refreshing
 * the stored token if needed. Returns null when not connected. Throws on a
 * dead refresh token so callers can clear + prompt a reconnect. Used by the
 * Connect webhook (no session) and the offer-signing flow.
 */
export async function freshDocuSignContext(
  workspaceId: string,
): Promise<{
  accessToken: string;
  accountId: string;
  baseUrl: string;
} | null> {
  const config = await getWorkspaceDocuSignConfig(workspaceId);
  if (!config) return null;
  const credentials = await getWorkspaceDocuSignCredentials(workspaceId);
  if (!credentials) return null;
  const accessToken = await refreshDocuSignToken({
    workspaceId,
    authBaseUrl: credentials.authBaseUrl,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: config.refreshToken,
  });
  return {
    accessToken,
    accountId: config.accountId,
    baseUrl: config.baseUrl,
  };
}

export { DEFAULT_DOCUSIGN_BASE_URL };

// ---- Envelopes + embedded signing (REST, v2.1) -----------------------------

/** REST API version path segment. DocuSign eSignature REST is /v2.1. */
const REST_VERSION = "/v2.1";

export type DocuSignSignHereTab = {
  documentId: string;
  pageNumber: string;
  xPosition: string;
  yPosition: string;
};

export type DocuSignSigner = {
  email: string;
  name: string;
  recipientId: string;
  routingOrder?: string;
  /** Required for embedded signing — identifies the signer in our app. */
  clientUserId: string;
  tabs?: { signHereTabs: DocuSignSignHereTab[] };
};

/**
 * Envelope document. For PDFs pass `documentBase64` + `fileExtension:"pdf"`.
 * For the offer MVP we send an HTML document (no PDF render dependency):
 * `fileExtension:"html"` + `htmlDefinition:{ source:"embedded", documentBase64 }`
 * where documentBase64 is the base64 of the UTF-8 HTML string.
 */
export type DocuSignDocument = {
  documentId: string;
  name: string;
  fileExtension: string;
  documentBase64?: string;
  htmlDefinition?: {
    source: "embedded";
    documentBase64: string;
  };
};

/**
 * Inline Connect configuration (JSON SIM). The HMAC key is account-global
 * (Admin → Connect), NOT inline here — posts carry X-DocuSign-Signature-N
 * only when Connect HMAC is enabled at the account level.
 */
export type DocuSignEventNotification = {
  url: string;
  loggingEnabled: string;
  requireAcknowledgment: string;
  includeDocuments: string;
  includeCertificateOfCompletion: string;
  includeEnvelopeVoidReason: string;
  includeTimeZone: string;
  envelopeEvents: { envelopeEventStatusCode: string }[];
  recipientEvents: { recipientEventStatusCode: string }[];
  /** JSON SIM payload selector — include "custom_fields" to round-trip them. */
  eventData: {
    version: "restv2.1";
    format: "json";
    includeData: string[];
  };
};

export type DocuSignCustomField = {
  name: string;
  value: string;
  required?: string;
  show?: string;
};

export type CreateEnvelopeInput = {
  emailSubject: string;
  documents: DocuSignDocument[];
  signers: DocuSignSigner[];
  /** Status "sent" sends immediately; "created" leaves it a draft. */
  status: "sent" | "created";
  eventNotification?: DocuSignEventNotification;
  customFields?: { textCustomFields: DocuSignCustomField[] };
};

export type CreateEnvelopeResponse = {
  envelopeId: string;
  uri?: string;
  statusDateTime?: string;
};

/**
 * Create an envelope for embedded signing. When `eventNotification` is set,
 * DocuSign Connect posts status updates to that URL (verify the HMAC on
 * receipt). `customFields.textCustomFields` round-trip in the webhook payload
 * so the receiver can map envelopeId back to the offer.
 */
export async function createEnvelope(
  baseUrl: string,
  accessToken: string,
  accountId: string,
  input: CreateEnvelopeInput,
): Promise<CreateEnvelopeResponse> {
  const body = {
    emailSubject: input.emailSubject,
    documents: input.documents,
    recipients: { signers: input.signers },
    status: input.status,
    ...(input.eventNotification
      ? { eventNotification: input.eventNotification }
      : {}),
    ...(input.customFields ? { customFields: input.customFields } : {}),
  };

  return docusignFetch<CreateEnvelopeResponse>(
    baseUrl,
    accessToken,
    `${REST_VERSION}/accounts/${accountId}/envelopes`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export type RecipientViewInput = {
  returnUrl: string;
  authenticationMethod: string;
  email: string;
  userName: string;
  /** Must match the signer's clientUserId used at envelope creation. */
  clientUserId: string;
  pingFrequency?: string;
  pingUrl?: string;
};

export type RecipientViewResponse = { url: string };

/**
 * Generate the hosted signing URL for an embedded signer. Redirect (or iframe)
 * the candidate to `url`; on completion DocuSign redirects to `returnUrl`.
 * The `clientUserId` MUST match the one set on the signer at createEnvelope.
 */
export async function createRecipientView(
  baseUrl: string,
  accessToken: string,
  accountId: string,
  envelopeId: string,
  input: RecipientViewInput,
): Promise<RecipientViewResponse> {
  return docusignFetch<RecipientViewResponse>(
    baseUrl,
    accessToken,
    `${REST_VERSION}/accounts/${accountId}/envelopes/${encodeURIComponent(envelopeId)}/views/recipient`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export type EnvelopeStatus = {
  status?:
    | "sent"
    | "delivered"
    | "completed"
    | "declined"
    | "voided"
    | "created";
  completedDateTime?: string;
  declinedDateTime?: string;
  declinedReason?: string;
};

/** Fetch an envelope's status. */
export async function getEnvelope(
  baseUrl: string,
  accessToken: string,
  accountId: string,
  envelopeId: string,
): Promise<EnvelopeStatus> {
  return docusignFetch<EnvelopeStatus>(
    baseUrl,
    accessToken,
    `${REST_VERSION}/accounts/${accountId}/envelopes/${encodeURIComponent(envelopeId)}`,
  );
}

/**
 * Fetch a single document from an envelope as a binary PDF. Returns the raw
 * response so the caller can stream bytes to storage. Use after `completed`.
 */
export async function getEnvelopeDocument(
  baseUrl: string,
  accessToken: string,
  accountId: string,
  envelopeId: string,
  documentId: string,
): Promise<Response> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}${REST_VERSION}/accounts/${accountId}/envelopes/${encodeURIComponent(envelopeId)}/documents/${encodeURIComponent(documentId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DocuSign getEnvelopeDocument ${res.status}: ${body}`);
  }
  return res;
}

export type EnvelopeDocumentItem = {
  documentId: string;
  name: string;
  order: string;
};

/** List documents in an envelope (to resolve the signed PDF's documentId). */
export async function listEnvelopeDocuments(
  baseUrl: string,
  accessToken: string,
  accountId: string,
  envelopeId: string,
): Promise<EnvelopeDocumentItem[]> {
  const data = await docusignFetch<{ envelopeDocuments?: EnvelopeDocumentItem[] }>(
    baseUrl,
    accessToken,
    `${REST_VERSION}/accounts/${accountId}/envelopes/${encodeURIComponent(envelopeId)}/documents`,
  );
  return data.envelopeDocuments ?? [];
}
