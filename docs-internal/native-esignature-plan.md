# Native e-signature — plan

**Status:** plan only, not implemented. Written 2026-07-23 for a fresh Claude session to execute.
**Origin:** user feedback (with screenshots) on the Documents drawer + the DocuSeal-based signing flow — the drawer is "poco intuitivo" (cramped, generic-looking) and DocuSeal is friction ("un cacho") for something an ATS should do natively: draw/save a signature once, drop it anywhere on the document, done.

## Decision: native-first, DocuSeal stays optional

Don't rip out DocuSeal — it's fully built, tested, and the only path with a real third-party audit trail (email delivery proof, IP/device log, hosted signing page). Add a **native, zero-install signing engine** as the *default* path for the common case (self-sign, or send one internal/candidate signer a link), and demote DocuSeal to an "Advanced" option in Settings → Integrations for teams that want that stronger evidence chain or third-party hosting. This is additive, not a migration — no data model rename needed.

Why additive beats replace: the `signature_envelopes` / `signature_recipients` / `signature_artifacts` tables were already built provider-agnostic (see `packages/db/src/schema.ts` comments — "another provider can be added without adding more provider-specific columns"). Native signing is exactly that second provider: `provider: "native"` instead of `"docuseal"`. Almost everything downstream (`signature-state.ts` vocabulary, `signed-artifact.ts` persistence shape, `DocumentsHub.tsx` status pills, the manual-attestation immutability guard) keeps working unchanged.

## Two flows to build

**A. Self-sign (in-app, synchronous).** A manager opens a document, draws/picks a saved signature, drags it onto the page, confirms. Signed PDF is baked and saved immediately — no round trip, no external service, no wait.

**B. Remote-sign (link, no login).** A manager sends a document to someone without a Harly account (candidate, contractor, third party). They get a link (`/sign/{token}`), see the PDF in the browser, draw/type/upload a signature, place it, submit. No auth — the token is the credential, same trust model as the existing candidate-portal magic link.

V1 scope: **single signer per document**, no routing/multi-party sequencing (DocuSeal already covers that if a team truly needs it). This matches what the user described ("guardamos firma... la ponemos en cualquier parte... y listo").

## UX flow detail

### Signature capture (shared component, used by both flows)
`SignaturePad` — draw with mouse/touch on an HTML5 `<canvas>` (no new dependency — pointer events + `canvas.toDataURL()`), OR type your name and render it in a script/cursive web font as a fallback for accessibility and speed, OR upload a PNG/JPG of a physical signature. Whichever method, the result is a transparent-background PNG. Offer to **save it** ("Use this signature every time") — persisted per user (dashboard) or per portal-candidate identity so it doesn't need to be redrawn on every document.

New table `saved_signatures`:
```
id, workspace_id, owner_type ('user' | 'portal_candidate'), owner_id, storage_key, created_at
```
(`owner_type`/`owner_id` because the two audiences — dashboard users and portal candidates — live in different tables with no shared FK target.)

### Placement (shared component, overlaid on the existing `PdfViewer`)
`PdfViewer` (`apps/web/src/features/candidates/PdfViewer.tsx`) already renders every page to its own `<canvas>`, fit-to-width, client-side via pdfjs — this is the right foundation, don't rebuild PDF rendering. Add an optional overlay mode: `PdfSignaturePlacer` wraps the same page canvases in a positioned `<div>` per page and renders a draggable/resizable box holding the signature PNG (`<img>`, `pointer` drag + corner-resize handle — no new dependency, this is ~150 lines of pointer-event math, same complexity class as the existing zoom/fit logic in `PdfViewer`).

On confirm, emit **fractional page coordinates** — `{ page, x, y, w, h }`, each 0..1 relative to that page's un-zoomed size. This is deliberately the *exact same shape* DocuSeal fields already use in `lib/esign/document-signing.ts` (`areas: [{ x: 0.08, y: 0.88, w: 0.35, h: 0.06, page: 1 }]`) — one coordinate convention across both providers, one mental model.

### Drawer/UX overhaul (independent of native signing, do this regardless)
The screenshots show the real problem: `DocumentsHub.tsx`'s detail drawer is one long undifferentiated vertical stack (metadata → actions → category → assignments → access → signature → activity → governance) in a narrow side panel, using raw unstyled `<select>` elements that visually clash with the rest of the dark theme (compare the plain white-ish dropdowns in the screenshot to the app chrome around them), and "Send for signature" is a full-width button buried after 5 other sections.

Fix, in order of impact:
1. **Widen and restructure.** Move from a narrow slide-over to a larger split view (or a dedicated route/full-screen modal): PDF preview as the dominant left/main pane (not hidden behind a separate "Preview" button — show it inline by default), metadata + actions in a right rail with clear section headers.
2. **Replace raw `<select>` with the app's own `Select` component** (`@/components/ui/select`, already used elsewhere — e.g. `ImportCandidatesDrawer.tsx`) for category and signature-status pickers, so they render themed instead of browser-default.
3. **Promote signature to a first-class section**, not a dropdown-plus-button buried at the bottom. When unsigned: one obvious primary action — "Sign now" (opens the native self-sign flow) — with "Send for signature" and "Mark as signed manually" as secondary options in a small menu, and "Advanced: send via DocuSeal" behind a collapsed disclosure (respects the native-first decision above).
4. **Collapse low-frequency sections** (Access & ownership, Assignments, Governance/legal hold) behind disclosure triggers so the default view is short.

## Server-side: baking the signed PDF

New dependency: **`pdf-lib`** (MIT, no native bindings, pure JS — safe for the Next.js server runtime). `pdfjs-dist` (already installed) only *renders* PDFs; it can't write to them. `pdf-lib` embeds the signature PNG directly into the PDF's content stream — this is genuinely baked into the file (equivalent to "flattening": there's no interactive form field to re-edit afterward), not a fragile overlay.

Core function, `apps/web/src/lib/esign/native/bake.ts`:
```ts
async function bakeSignatureIntoPdf(input: {
  pdfBytes: Buffer;
  signaturePngBytes: Buffer;
  placement: { page: number; x: number; y: number; w: number; h: number }; // fractions, 0..1
}): Promise<Buffer>
```
Coordinate transform is the one real gotcha: the placement UI's `y` is measured top-down (web/canvas convention, matching pdfjs and the DocuSeal `areas` convention already in the codebase); `pdf-lib`'s `page.drawImage` origin is bottom-left. Convert with `pdfY = pageHeight - (y * pageHeight) - (h * pageHeight)` before drawing. Reuse `documents/verify.ts`-style size guards (cap input PDF at the existing `ENVELOPE_MAX_BYTES` = 20 MB precedent from `document-signing.ts`).

Optionally also generate a lightweight **completion certificate** page (signer name, email if remote, timestamp, IP address for remote signs, SHA-256 of the original unsigned PDF) appended to the same PDF or as a second `pdf-lib`-generated artifact — mirrors DocuSeal's `completion_certificate` kind in `signature_artifacts` and is what makes the native path defensible later if challenged, given it has no third-party attestation to fall back on. Recommended for v1, not launch-blocking if cut for time.

## Server-side: two entry points

### 1. Self-sign action (`features/documents/native-sign-actions.ts`)
`signDocumentNatively({ documentId, page, x, y, w, h, signaturePngBase64 | savedSignatureId })`:
- `requirePermission("documents:manage")`, same guards `sendDocumentForEnvelope` already has (document must be `active`, not already `signed`/`pending`, must be a PDF).
- Read original PDF bytes via `storage.read(document.storageKey)`, bake, write result as a **new document version** (reuse `createDocumentVersion`'s pattern) so the audit trail shows "v1 unsigned → v2 signed", exactly like a manual replace already does.
- Insert a `signature_envelopes` row (`provider: "native"`, `kind: "document"`, `status: "completed"`, `completedAt: now`), a `signature_recipients` row (the signer = the acting user, `status: "signed"`, `signedAt: now`), and a `signature_artifacts` row pointing at the new document version's storage key (`kind: "signed_document"`).
- Set `documents.signatureStatus = "signed"`, `signatureProvider = "native"`. Log `document.signature_changed` activity, matching the existing metadata shape.
- No webhook, no polling, no reconciliation cron involvement — this is synchronous, which is the whole point.

### 2. Remote-sign flow (`lib/esign/native/`, `app/sign/[token]/page.tsx`, `app/api/native-sign/[token]/*`)
- `createNativeSigningLink({ documentId, recipientEmail, recipientName, actorId })` — mirrors `sendDocumentForEnvelope`'s guards, but instead of calling DocuSeal: generates a token (`randomBytes(24).base64url`, same entropy convention as `docusealWebhookSecret`), inserts `signature_envelopes` (`provider: "native"`, `status: "sent"`) + `signature_recipients` (`signingUrl: "/sign/{token}"`, `status: "sent"`). **New column needed:** `signatureRecipients.linkExpiresAt` (nullable timestamp) — DocuSeal's hosted link handles its own expiry, but a native token needs one explicitly (recommend 14 days default, configurable).
- Public route `GET /api/native-sign/[token]` — resolves the recipient by token (constant-time lookup, same pattern as `resolvePortalSession`), checks not expired/not already signed/envelope not voided, returns the document's `fileUrl`-equivalent (streamed through a scoped, short-lived route — never expose `storageKey` directly) + recipient/document metadata for the page to render.
- `POST /api/native-sign/[token]/submit` — same auth-by-token, validates the placement payload, bakes the PDF (reuses `bake.ts`), persists exactly like the self-sign path but attributes the recipient (name/email/IP/user-agent captured server-side, not client-supplied, for the completion certificate), sets envelope `completed`, recipient `signed`, notifies the requester (reuse `notifications` insert pattern from `features/portal/document-actions.ts`).
- `app/sign/[token]/page.tsx` — public, unauthenticated page: fetch-and-render the PDF via `PdfViewer` + `PdfSignaturePlacer`, "I agree this is my signature" consent checkbox (basic ESIGN-Act-style consent capture — store the checkbox timestamp too), submit button.
- **Rate limit** the public routes (reuse whatever the codebase already uses for `api/public/v1/*` — check `lib/rate-limit` or similar) since this is an unauthenticated surface that reads/writes based only on token possession.

Both entry points funnel through the same `bakeSignatureIntoPdf` + persistence helper (`features/documents/native-sign-actions.ts` exports a shared internal `finalizeNativeSignature(...)` used by both the self-sign action and the remote-submit route) — don't duplicate the transaction logic.

## Migration

New table `saved_signatures` (above). New column `signature_recipients.link_expires_at timestamp with time zone`. That's it — no changes to `signature_envelopes`/`signature_artifacts`, they're already generic enough. Follow the standard flow: edit `schema.ts` → `pnpm --filter @harly/db db:generate` → check the journal `when` isn't lagging (see `db_journal_when_lag` memory) → `db:migrate` → confirm `db:generate` says "No schema changes" → `drizzle-kit check`.

## Settings/UI touch points

- `features/workspaces/integrations-registry.ts` — no change needed for native (it's not a connectable integration, it's core product); DocuSeal's existing entry gets relabeled "Advanced e-signature (optional)" in copy only.
- `DocumentsHub.tsx` — new "Sign now" primary action opening a `NativeSignDialog` (renders `PdfViewer` + `PdfSignaturePlacer` inline, not another nested dialog-in-dialog); "Send for signature" gains a mode picker (native link vs DocuSeal) — native is the default selection.
- Candidate portal (`features/portal/`) — if a document request or an offer should support native remote-sign instead of DocuSeal, the same `PdfSignaturePlacer` + saved-signature component gets reused there too (out of scope for v1, note as a natural follow-up once the core engine exists — the offer-signing path is higher-stakes and can stay on DocuSeal until native has mileage).

## Security notes

- Public `/sign/{token}` and its API routes must never leak `documents.storageKey` or any other document in the workspace — resolve strictly by recipient token → envelope → single document.
- Token comparison constant-time (mirror `cron-auth.ts`'s `safeEqual` pattern or the portal session hash-compare).
- Cap uploaded/drawn signature PNGs (e.g. 500 KB, reasonable canvas export size) and the source PDF (reuse the 20 MB precedent).
- IP/user-agent capture for the completion certificate is enough to fulfill "showed intent," not proof of identity — document this limitation plainly in the UI copy near the consent checkbox so it isn't oversold as more legally binding than DocuSeal's model with real user-account/OAuth-verified email + hosted audit log.

## Suggested build order (for the implementing session)

1. Migration (`saved_signatures`, `signature_recipients.link_expires_at`).
2. `bake.ts` (pdf-lib coordinate math) + a focused unit test (known page size, known fractional box, assert the drawn image lands where expected — pdf-lib lets you re-parse and inspect the output).
3. `SignaturePad` component (draw/type/upload → PNG) + save/reuse wiring.
4. `PdfSignaturePlacer` overlay on `PdfViewer`.
5. Self-sign action + `NativeSignDialog` in `DocumentsHub.tsx` — ships value immediately, no public-route risk surface yet.
6. Remote-sign: token generation, public route, `/sign/[token]` page, rate limiting.
7. Drawer UX overhaul (independent, can land in parallel with any of the above).
8. Tests: `bake.test.ts`, `native-sign-actions.test.ts` (mock storage), token-expiry/replay tests for the public route.

## Open questions for the user (flag, don't assume)

- Keep DocuSeal fully installed-and-optional, or actually remove it now that native exists? (Plan assumes *keep*.)
- Is a completion-certificate page required for v1, or acceptable to cut and add later?
- Should native remote-sign extend to the offer-acceptance flow eventually, or stay DocuSeal-only there given it's the highest-stakes document (hire decision)?
