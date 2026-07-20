# Integrations roadmap for Harly

Last updated 2026-07-19. This is the working backlog of integrations to add to
the Harly marketplace, in priority order. Each entry records what it does, the
API/auth model, where it plugs into Harly's existing patterns, and the build
shape (proxy vs. new OAuth vs. webhook-only).

The reference integration patterns are already in the repo:

- **OAuth provider** (install + callback + encrypted tokens in `workspace_settings`):
  Google Calendar, Zoom, Slack, Outlook. See `app/api/integrations/<provider>/{install,callback}`,
  `lib/<provider>/config.ts` (`getWorkspaceXStatus` / `getWorkspaceXConfig`),
  `lib/<provider>/client.ts`, `features/workspaces/<X>ConnectPanel.tsx`,
  `features/workspaces/<X>-settings-actions.ts`.
- **Proxy integration** (shares another integration's OAuth/DB row, no new flow):
  Google Meet → Google Calendar (`isConnected("google-meet") === statuses.gcal.enabled`,
  bidirectional). Added 2026-07-19.
- **BYO-key / webhook** (no OAuth): Cal.com, Discord, Telegram, webhooks.
- **Registry**: `features/workspaces/integrations-registry.ts` — one `IntegrationDefinition`
  drives both the marketplace index (`app/(dashboard)/settings/integrations/page.tsx`)
  and the detail route (`app/(dashboard)/settings/integrations/[slug]/page.tsx`).
  Logo maps are exhaustive `Record<IntegrationSlug, Logo>` in both page files.

## 1. Microsoft Teams — proxy of Outlook  ⭐ DO FIRST

**Status:** all infrastructure already exists. This is a proxy card, identical in
shape to the Google Meet → Google Calendar proxy.

### Why it's basically free

- The Outlook install route already requests the `OnlineMeetings.ReadWrite` scope
  (`app/api/integrations/outlook/install/route.ts:10-16`). The token refresh in
  `lib/outlook/client.ts:74` re-requests it.
- `lib/outlook/client.ts:273 createTeamsMeeting()` already calls
  `POST /me/onlineMeetings` and returns `{ joinUrl, joinWebUrl }`.
- The scheduling path already handles `meetingProvider === "teams"`
  (`features/interviews/actions.ts:542`) via `syncInterviewToTeams` from
  `lib/outlook/teams-sync`, and already falls back to Teams when `outlookConfig`
  is the only connected video provider (`actions.ts:575`).
- The `interviews.teamsMeetingId` column and cancel/reschedule cleanup already
  exist.
- The `meetingProviders` enum already includes `"teams"` (`actions.ts:161`).
- `MicrosoftTeamsLogo` is already exported from `components/ui/icons/brands.tsx:121`
  (thesvg slug `microsoft-teams/default.svg`, verified HTTP 200).

### What's left (4 files, mirror the Meet commit f07a792)

1. `integrations-registry.ts` — add `"microsoft-teams"` to `IntegrationSlug`,
   add an entry (`category: "calendar"`, emerald/blue tile to contrast the
   multicolor Teams mark), and `isConnected("microsoft-teams") ===
   statuses.outlook.enabled` (bidirectional, same as Meet↔GCal).
2. `app/(dashboard)/settings/integrations/page.tsx` — add
   `"microsoft-teams": svgBrand("microsoft-teams", "Microsoft Teams")` to
   `INTEGRATION_LOGOS`.
3. `features/workspaces/MicrosoftTeamsConnectPanel.tsx` — **new**, mirrors
   `GoogleMeetConnectPanel`. Reuses Outlook's status + actions
   (`disconnectOutlookAction`, `testOutlookAction`). Connect button hits
   `/api/integrations/outlook/install?ws=<id>` (same OAuth as Outlook — connecting
   either flips both cards). "Manage calendar" links to
   `/settings/integrations/outlook`.
4. `app/(dashboard)/settings/integrations/[slug]/page.tsx` — add the logo map
   entry + a `case "microsoft-teams":` that calls `getWorkspaceOutlookStatus`
   and renders `MicrosoftTeamsConnectPanel`.

**No new OAuth flow, DB columns, server actions, or client lib.** The panel is
read-mostly: it surfaces the shared connection and links to the Outlook card for
calendar/event config. Bidirectional by construction.

### Verification

- `/settings/integrations` shows a Microsoft Teams card under
  "Calendar & scheduling" whose status tracks Outlook's connection state.
- Connecting via the Teams card flips both Teams + Outlook cards to Connected.
- Disconnecting either clears both.
- Scheduling a `mode: video` interview with `provider: teams` (or auto-fallback
  to Teams) still creates a join link via `syncInterviewToTeams` — zero
  behavioral change to the scheduling path.

## 2. DocuSign — e-signature for offers  ⭐ DO SECOND

**Status:** new integration. OAuth2 + createEnvelope + embedded signing +
Connect webhook. Closes the "candidate signs the offer inside the portal" loop.

### API / auth model (confirmed via ctx7 — `/docusign/docusign-esign-node-client`)

- **Auth:** OAuth2. For a server-side integration the right grant is **JWT
  (Assertion) grant** — a service app with a private RSA key, no interactive
  user per send. (Authorization Code grant is also possible but requires a user
  in the loop per workspace; JWT is the standard ATS pattern.)
- **Send:** `EnvelopesApi.createEnvelope` with a base64 document + a `Signer`
  recipient. For embedded signing the signer carries a `clientUserId`.
- **Embedded signing URL:** `EnvelopesApi.createRecipientView` returns a signing
  URL the candidate is redirected to (or iframed) — the signing happens on
  DocuSign's hosted page, never on our domain.
- **Status sync:** envelope `EventNotification` (Connect) posts to our webhook
  on `sent` / `delivered` / `completed` / `declined`. `completed` → fetch the
  signed PDF via `EnvelopesApi.getEnvelopeDocuments` and attach it to the offer.

### Where it plugs into Harly

- **Offer flow:** `features/offers/actions.ts sendOffer()` currently enqueues an
  `offer.extended` outbox email. DocuSign adds an alternate delivery path: when
  DocuSign is the offer channel, `sendOffer` creates an envelope instead of (or
  alongside) the email, and the candidate signs in the portal.
- **Portal:** the candidate portal (`app/(portal)/portal/applications/[id]/page.tsx`)
  gains a "Review & sign your offer" surface that opens the embedded signing URL,
  then a signed-PDF download once `completed`.
- **Status mapping:** DocuSign `completed` → offer `accepted`; `declined` →
  offer `declined`. Both already exist as offer statuses and already trigger the
  `application.hired` webhook / stage move (`decideOffer` in `actions.ts:358`).
- **Signed doc storage:** reuse `candidateFiles` (already used for resumes) —
  store the signed PDF as a `candidate_files` row keyed to the offer.

### Build shape (new OAuth provider + webhook + dep)

- **Dep:** `docusign-esign` (Node client, High reputation, benchmark 83.7).
- **DB:** new `workspace_settings` columns — `docusignEnabled`, account id,
  encrypted private key (or encrypted refresh token if we use Authorization Code
  instead of JWT), base URL (demo vs. production). New migration `0078_*` (last
  is `0077_spicy_silhouette.sql`). Follow `packages/db/AGENTS.md`:
  edit `schema.ts` → `pnpm db:generate` → `pnpm db:migrate` → `db:generate`
  again confirms "No schema changes" → `drizzle-kit check`.
- **OAuth install/callback:** `app/api/integrations/docusign/{install,callback}`.
  Reuse `@/server/oauth-state` nonce pattern. For JWT grant there's no callback;
  the "install" is entering the integration key + user ID + private key, stored
  encrypted (same AES-256-GCM as every other secret). For Authorization Code
  grant, mirror Outlook's install/callback exactly.
- **Lib:** `lib/docusign/config.ts` (`getWorkspaceDocuSignStatus` /
  `getWorkspaceDocuSignConfig`), `lib/docusign/client.ts` (envelope create,
  recipient view, document fetch), `lib/docusign/connect.ts` (webhook signature
  verification + event handling).
- **Webhook route:** `app/api/integrations/docusign/callback` (POST) — verify
  Connect HMAC, map `completed`/`declined` → offer decision + signed PDF.
- **Panel + actions:** `features/workspaces/DocuSignConnectPanel.tsx`,
  `features/workspaces/docusign-settings-actions.ts`.
- **Offer integration:** a per-workspace toggle "Send offers via DocuSign for
  e-signature" that switches `sendOffer`'s delivery path. New
  `sendOfferForSignatureAction` (create envelope) + portal signing route.
- **Registry:** add `"docusign"` slug (new `category`? or reuse `communication` /
  add `signing`). Logo via thesvg (verify slug `docusign`).

### Open decisions for DocuSign

1. **Grant type:** JWT (server app, no per-send user) vs. Authorization Code
   (per-workspace user consent). JWT is the cleaner ATS pattern but needs a
   private key stored per workspace; Authorization Code mirrors the existing
   Outlook/Zoom flow and reuses the install/callback infrastructure. **Lean:
   Authorization Code** to stay consistent with every other OAuth integration in
   the repo.
2. **Offer delivery model:** DocuSign **replaces** the offer email, or runs
   **alongside** it (email notifies, DocuSign collects the signature). Lean:
   alongside — the email becomes "Your offer is ready to sign" with a portal
   link, and the signature is collected via embedded signing.
3. **Document source:** generate the offer PDF from Harly's offer terms (new PDF
   render) vs. upload an admin-authored PDF. Lean: generate from terms for
   parity with the existing offer email, allow upload override later.

## 3. Calendly — scheduling, alternative to Cal.com

**API / auth:** API v2, OAuth 2.1 + personal access tokens. Endpoints for
scheduling links, events/invitees, availability; webhooks for
scheduled/canceled/rescheduled (webhooks require a paid Calendly plan).

**Build shape:** OAuth provider (mirror Cal.com's BYO-key slot, or full OAuth
like Outlook). Same product slot as Cal.com — candidate self-scheduling. Lower
priority than Teams/DocuSign because Cal.com already covers the slot; Calendly
is the market-share alternative for users who already live in it.

## 4. Checkr — background checks

**API / auth:** REST, **API key** (HTTP Basic, not OAuth). Webhooks
`report.completed`/`suspended`/`invitation.expired`, HMAC signature
`X-Checkr-Signature`. Idempotency keys. 1200 req/min.

**Build shape:** BYO-key (like Cal.com), not OAuth. Flow: candidate → invitation
(candidate completes hosted flow) → webhook → report attached to the candidate
in Harly. Friction: Checkr must credential the account before production;
legal/geo-dependent. Logo via thesvg (verify slug `checkr`).

## 5. WhatsApp Cloud API (Meta) — candidate reminders

**API / auth:** Bearer token (Meta system user), scoped
`whatsapp_business_messaging`. Template messages (pre-approved) for reminders
outside the 24h customer-service window. Webhooks for delivered/read.

**Build shape:** webhook/BYO-token. Complement to email, not a replacement —
useful for LATAM candidate comms. Compliance caveat: explicit opt-in required.
Logo via thesvg (verify slug `whatsapp`).

## 6. BambooHR — HRIS handoff (post-hire)

**API / auth:** REST, API key (single-customer) or OAuth2 (marketplace).
`POST /employees` creates an employee record.

**Build shape:** BYO-key. Triggered on `application.hired` — push the new hire's
data into BambooHR as an employee. This is the "exit" of the funnel, not core
ATS; lower priority. Logo via thesvg (verify slug `bamboohr`).

## Explicitly rejected

- **Reclaim.ai** — no public REST API / OAuth / API key for third parties. Only
  webhooks + MCP (Claude/ChatGPT) for consumer-side scheduling. Not buildable as
  a marketplace card.

## Implementation order

1. **Teams** (proxy, ~4 files, no DB/OAuth) — do first, trivial.
2. **DocuSign** (new OAuth provider + webhook + dep + DB migration) — do second,
   highest product value (signed offers inside the portal).
3. Calendly, Checkr, WhatsApp, BambooHR — after Teams + DocuSign land.
