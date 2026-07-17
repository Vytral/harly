# Standards for integrations and feature changes

Use this checklist for every integration or product-facing feature. It is the
definition of done for humans and coding agents; do not mark work complete
because a screen renders or a request returns `200`.

## 1. Decide the contract first

- State the user outcome, owner, supported providers, and non-goals.
- Read the provider's current official API and changelog before implementing.
- Define the API contract: inputs, response shape, validation, limits, error
  messages, idempotency key, and retry behavior.
- Keep workspace boundaries explicit in every query and payload. A record ID
  alone is never sufficient for authorization or notification routing.
- Server actions and routes must authorize the capability they perform. Never
  trust the UI to restrict a user, a provider callback, or an API caller.

## 2. Integration implementation

- Store credentials encrypted or through the existing secret/config mechanism;
  never log tokens, authorization headers, or raw webhook bodies containing PII.
- OAuth: validate state, PKCE where supported, redirect URI, token expiry, and
  refresh/revocation behavior. API-key integrations must have an explicit
  connection validation endpoint/action.
- Webhooks: verify the provider signature before processing, deduplicate using
  the provider event ID, make handlers idempotent, and record observable
  failures. Do not perform irreversible work before verification.
- Use bounded batches, timeouts, rate limits, and retry-safe queues for syncs,
  emails, and external writes. Expose a clear pending/failed state to users.
- Revalidate affected dashboard paths and write an audit event for connection,
  disconnection, and meaningful configuration changes.

## 3. Product and UI quality

- Start from the existing design system and shared components. Keep server data
  fetching in server components; isolate interactive controls in client leaves.
- Every async surface needs loading, empty, error, disabled, and success states.
  A disabled control must explain the prerequisite instead of silently failing.
- Bound expensive or potentially unbounded views. Show a ranked shortlist,
  pagination, or a deliberate “view all” flow; never render a large dataset by
  default just because it was returned by an API.
- Use the project's established icon set and import path. If a brand logo is
  needed, source the official SVG through the `thesvg` workflow rather than
  drawing or downloading an arbitrary logo. Do not add an icon merely for
  decoration.
- Preserve mobile layout, keyboard access, labels, focus states, and reduced
  motion. Avoid new dependencies unless they are necessary and verified in
  `package.json` first.

## 4. Verification required before handoff

- Add or update focused tests for validation, authorization/workspace isolation,
  provider failure, and the success path. Mock the provider at unit level.
- Run `pnpm --filter web typecheck`, the focused tests, and the relevant full
  suite. Run `git diff --check`.
- Exercise the real provider against a sandbox/test account when available:
  connect, validate credentials, execute one representative request, receive a
  signed webhook/callback, retry it, disconnect, and verify cleanup.
- If real-provider testing cannot be done, record the exact prerequisite and
  command/URL needed in `docs-internal/pending.md`; do not call it verified.
- Review audit logs, notifications, workspace isolation, and UI states with an
  empty workspace and a populated workspace.

## 5. Handoff note

Report: what changed, user-visible behavior, affected permissions, provider
coverage, tests run, and any unverified external step. Keep this note concrete
enough that the next human or agent can safely continue the work.
