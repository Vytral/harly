# DocuSign eSignature REST API v2.1 — reference for Harly

Consolidated from 3 research reports (ChatGPT authoritative — cites 13 official
URLs S1-S13; Grok + Gemini cross-checked). Fetch-direct, NO SDK. Used by
`lib/docusign/*` and `app/api/integrations/docusign/*`.

## OAuth (Authorization Code grant, confidential app)

- Authorize (GET): demo `https://account-d.docusign.com/oauth/auth`, prod
  `https://account.docusign.com/oauth/auth`. Params: `response_type=code`,
  `scope=signature extended`, `client_id`, `redirect_uri`, `state`.
- Token (POST) `{auth}/oauth/token`: **Basic header** `base64(client_id:secret)`,
  form body `grant_type=authorization_code&code={CODE}` (`redirect_uri` not
  required in body for confidential apps; including it identical is harmless).
- Response: `access_token`, `token_type:"Bearer"`, `refresh_token`,
  `expires_in:28800` (8h), `scope`.
- Scopes: `signature` (eSignature) + `extended` (REQUIRED for long-lived
  refresh token renewal). Do NOT request `impersonation` (JWT only).
- Refresh (POST `{auth}/oauth/token`): Basic header, body
  `grant_type=refresh_token&refresh_token={CURRENT}`. Rotates the refresh token
  — persist the new one atomically. Avoid concurrent refreshes (lock).

## getUserInfo (GET `{auth}/oauth/userinfo`, Bearer)

Wire format is **snake_case** (no SDK): `accounts[]` with `account_id`,
`is_default`, `account_name`, `base_uri`. Pick `is_default:true` (or first).
`base_uri` does NOT include `/restapi` — REST root is `base_uri + "/restapi/v2.1"`.
Distinguish demo vs prod by host (`demo.docusign.net` = demo; prod = regional
`na2`/`eu`/`ca`/`www` — never hardcode, trust `base_uri`).

## createEnvelope (POST `{rest}/accounts/{accountId}/envelopes`)

Body (camelCase REST):
```json
{
  "emailSubject": "...",
  "status": "sent",
  "documents": [{ "documentId":"1", "name":"Offer", "fileExtension":"html",
    "htmlDefinition": { "source":"embedded", "documentBase64":"..." } }],
  "recipients": { "signers": [{
    "email":"...", "name":"...", "recipientId":"1", "routingOrder":"1",
    "clientUserId":"harly-<candidateId>",
    "tabs": { "signHereTabs": [{ "documentId":"1","pageNumber":"1",
      "xPosition":"420","yPosition":"650" }] }
  }]},
  "customFields": { "textCustomFields": [
    {"name":"offerId","value":"<id>","required":"false","show":"false"},
    {"name":"workspaceId","value":"<id>","required":"false","show":"false"},
    {"name":"candidateId","value":"<id>","required":"false","show":"false"}
  ]},
  "eventNotification": { ... see below ... }
}
```
- `clientUserId` enables embedded signing (no DocuSign email to signer). Make
  it unpredictable + stable per signer.
- `documentId`/`recipientId`/`pageNumber`/`xPosition`/`yPosition` are STRINGS.
- For HTML docs (chosen for Harly MVP, no PDF render dep): `fileExtension:"html"`
  + `htmlDefinition:{source:"embedded", documentBase64:<base64 html>}`.
- Response (201): `envelopeId`, `uri`, `statusDateTime`, `status`. **Persist
  `envelopeId` → offerId in DB immediately** (primary correlation key).

## eventNotification (Connect inline, JSON SIM)

```json
"eventNotification": {
  "url": "https://app.../api/integrations/docusign/webhook",
  "loggingEnabled": "true",
  "requireAcknowledgment": "true",
  "includeDocuments": "false",
  "includeCertificateOfCompletion": "false",
  "includeEnvelopeVoidReason": "true",
  "includeTimeZone": "true",
  "envelopeEvents": [
    {"envelopeEventStatusCode":"sent"},{"envelopeEventStatusCode":"delivered"},
    {"envelopeEventStatusCode":"completed"},{"envelopeEventStatusCode":"declined"},
    {"envelopeEventStatusCode":"voided"}
  ],
  "recipientEvents": [
    {"recipientEventStatusCode":"Sent"},{"recipientEventStatusCode":"Delivered"},
    {"recipientEventStatusCode":"Completed"},{"recipientEventStatusCode":"Declined"},
    {"recipientEventStatusCode":"AuthenticationFailed"},{"recipientEventStatusCode":"AutoResponded"}
  ],
  "eventData": { "version":"restv2.1", "format":"json",
    "includeData": ["custom_fields","recipients"] }
}
```
- `includeData` lives INSIDE `eventData` (JSON SIM). NOT top-level.
- NO `includeHMAC`/`deliveryMode` fields — folklore, not official. HMAC is
  account-global, not inline.
- `includeDocuments:"false"` (download PDF via API after completed, not embedded).

## Connect HMAC (security-critical)

- Headers: `X-DocuSign-Signature-1`, `-2`, ... `-N` (one per active key, for
  zero-downtime rotation). ITERATE all present, accept if ANY signature matches
  ANY active secret. Do not hardcode "2".
- Algorithm: HMAC-SHA256, output **base64**, over the **raw request body bytes**
  (Buffer, exact — no stringify/re-encode). Verify BEFORE `JSON.parse`.
- Key: account-global Connect HMAC secret (Admin → Connect → HMAC Keys), distinct
  from OAuth client secret. Stored per-workspace in `docusignConnectSecret`.
- Verify: `createHmac("sha256", secret).update(rawBody).digest("base64")`,
  `timingSafeEqual` vs each received signature.
- Rotation: keep old+new active, drop old only after new signatures confirmed.

```ts
function verifyDocuSignHmac(rawBody: Buffer, headers, secrets: string[]): boolean {
  const sigs = Object.entries(headers)
    .filter(([k]) => /^x-docusign-signature-\d+$/i.test(k))
    .flatMap(([,v]) => Array.isArray(v) ? v : v ? [v] : []);
  if (!sigs.length || !secrets.length) return false;
  return secrets.some(secret => {
    const expected = createHmac("sha256", Buffer.from(secret,"utf8"))
      .update(rawBody).digest("base64");
    return sigs.some(recv => safeBase64Equal(expected, recv));
  });
}
```
Next.js route: `Buffer.from(await request.arrayBuffer())` — never `request.json()` first.

## createRecipientView (POST `{rest}/accounts/{accountId}/envelopes/{envelopeId}/views/recipient`)

Body: `returnUrl`, `authenticationMethod:"none"`, `email`, `userName`,
`clientUserId` (REQUIRED, must EXACTLY match signer's), `pingFrequency:"300"`,
`pingUrl`. Response: `{url}`. URL is **single-use, ~5 min** — generate at redirect
time, never persist. `returnUrl` is UX only, NOT proof of completion.

## getEnvelope (GET `{rest}/accounts/{accountId}/envelopes/{envelopeId}`)

Response: `status` (`created`/`sent`/`delivered`/`signed`/`completed`/`declined`/
`voided`), `completedDateTime`, `declinedDateTime`, `voidedReason`.
`declinedReason` is per-recipient (query recipients for the reason).

## Documents (GET, Bearer)

- List: `{rest}/accounts/{accountId}/envelopes/{envelopeId}/documents` → JSON
  metadata (`documentId`, `name`, `order`).
- One: `.../documents/{documentId}` → binary stream.
- Combined: `.../documents/combined` → combined PDF binary.
- Certificate: `documentId=certificate`.
- Download signed PDF + certificate **only after `completed`**.

## Webhook payload (JSON SIM)

```json
{
  "event":"envelope-completed","apiVersion":"v2.1",
  "uri":"/restapi/v2.1/accounts/ACCT/envelopes/ENV",
  "retryCount":0,"configurationId":123,"generatedDateTime":"...",
  "data": {
    "accountId":"ACCT","userId":"...","envelopeId":"ENV",
    "envelopeSummary": {
      "envelopeId":"ENV","status":"completed","completedDateTime":"...",
      "customFields": { "textCustomFields": [
        {"name":"offerId","value":"off_123","show":"false","required":"false"} ] },
      "recipients": { "signers": [...] }
    }
  }
}
```
- `envelopeId` ALWAYS present (`data.envelopeId` + `envelopeSummary.envelopeId`
  + embedded in `uri`). Primary correlation key.
- `customFields` present ONLY if `"custom_fields"` in `eventData.includeData`.
- Event names: `envelope-sent`, `envelope-delivered`, `envelope-completed`,
  `envelope-declined`, `envelope-voided` + `recipient-*`.
- **Flip offer to accepted on `envelope-completed` ONLY** (not recipient-completed).
- Dedup by `configurationId+event+envelopeId+generatedDateTime`. Respond 2xx
  fast after persisting; process PDF out-of-band. Monotonic states (never
  revert completed→delivered on a late event).
- Verify `accountId` matches the connection that owns the envelope.

## Correlation envelopeId → offerId

PRIMARY: persist `offers.docusignEnvelopeId = envelopeId` at createEnvelope
time. SECONDARY (redundant): `customFields.textCustomFields` with `offerId`
(`show:"false"`) round-trips in webhook `envelopeSummary.customFields`. Use
opaque IDs only (no PII) in custom fields.
