# OpenHire / Harly — Polish Roadmap

_Last updated: 2026-06-12. Self-hosting / OSS P0 is intentionally excluded — we polish the product first._

This is the single source of truth for the remaining work to bring Harly to a polished, top-tier ATS (Workable / Ashby level). Each workstream has a spec, data-model sketch, and a build order so we can advance feature by feature.

## Status snapshot (done)

- Public API v1 + outbound webhooks + embeddable widget (`/embed/widget.js`) + Developers settings. See [project_api_v1].
- Reports & analytics page (funnel, time-to-hire, source effectiveness) — app-native design.
- Full transactional email set (apply, stage, reject, **offer extended/withdrawn**, **interview scheduled/canceled**) + platform auth emails.
- Repo lint + typecheck green (root-cause fixes, no eslint-disable).

## Visible holes (ComingSoon stubs in code)

`talent-pool`, `career-page`, `calendars`, `tasks` are 13-line `ComingSoon` placeholders. `inbox` is partial.

---

## Design language

Two distinct surfaces — do not mix them:

- **Internal app (dashboard):** paper + evergreen tokens (`--paper`, `--pine`, `--sage`), `Tile`/`TileHeader` primitives, soft diffusion shadows, `font-display`. Keep new dashboard UIs consistent with this.
- **Public / career pages (editorial):** richer, brand-forward, marketing aesthetic. Reference targets the user picked:
  - **Memory careers (editorial):** full-width hero banner with image + tinted diagonal-stripe overlay; overlapping rounded logo card; oversized "Join us" headline; muted intro paragraph (max-width ~65ch); outline **tag chips** with small icons; a bordered **"Overview" stat card** (creation date, collaborators, parity, avg age) with a dark CTA; horizontally-scrolling **photo gallery**; **"Our values"** as 4 colorful abstract art tiles + label/description; **"Open positions"** filterable table (Position · Manager avatar · Wage · Contract · Location) with row dividers; playful **CTA banner** ("Don't see a role that fits?").
  - **Welcome to the Jungle (playful):** yellow/high-color, sticker-like accents, overlapping cards with photos + job facts, stat "sticky notes", editorial type. Use as the "Playful" template's spirit.

**Tooling for public UI work:** use `frontend-design-principles` (marketing route), `/better-icons` for chip/section icons (search Iconify, prefer one consistent set), and `/web-animation-design` for motion — staggered section reveals on scroll, gentle card hover lift, `prefers-reduced-motion` respected. Keep motion subtle (entrance + hover only), GPU-friendly (`transform`/`opacity`).

---

## Workstream 1 — Career-page builder + templates  ⭐ next

Turn the public board into a **customizable, template-driven careers site**. Closes the loop with the API + widget already built.

### What exists to extend
- Public board: `apps/web/src/app/(public)/board/[slug]/page.tsx` + `apps/web/src/features/board/components` (`BoardShell`, `BoardHero`, `BoardMinimalHeader`, `JobTable`).
- Branding columns on `workspaceSettings`: `tagline`, `description`, `websiteUrl`, `primaryColor`, `heroImageUrl`, `boardStyle` (hero|minimal), `logoStyle`.

### Data model
Add a single `careerPageConfig` **jsonb** column on `workspaceSettings` (versioned, default `{}`) — avoids a column explosion and is fully customizable:

```ts
type CareerPageConfig = {
  template: "editorial" | "playful" | "minimal"; // preset look; everything below still overridable
  hero: { headline?: string; subhead?: string; imageUrl?: string; overlay?: "tint" | "none" };
  intro?: { body?: string; chips?: { label: string; icon?: string }[] };
  overview?: { enabled: boolean; stats: { label: string; value: string; icon?: string }[] };
  gallery?: { enabled: boolean; images: string[] };
  values?: { enabled: boolean; items: { title: string; body: string; art?: string }[] };
  positions?: { filters: ("department" | "location" | "type")[] };
  cta?: { enabled: boolean; title?: string; body?: string };
  sections?: Array<{ id: string; type: "richtext" | "image" | "embed"; data: unknown }>; // custom blocks
  theme?: { accent?: string; font?: "sans" | "serif-display"; rounded?: "soft" | "sharp" };
};
```

Templates are **presets** that seed this config; the builder then edits every field — "todo personalizable."

### Build order
1. **Schema:** add `careerPageConfig` jsonb + a normalizer (`features/career-page/config.ts`, mirror `features/jobs/config.ts` pattern) with safe defaults + the 3 template presets. Migration.
2. **Public render:** `features/career-page/templates/{Editorial,Playful,Minimal}.tsx` + a `<CareerPage config jobs workspace />` switch. Reuse `JobTable`/apply links + the public job data. Wire `board/[slug]/page.tsx` to render the configured template (fall back to current hero/minimal).
3. **Builder UI:** `dashboard/career-page` — left = section editors (hero, intro+chips, overview stats, gallery upload, values, positions filters, CTA, custom blocks, theme), right = **live preview** (iframe to `/board/[slug]?preview=1` or in-process). Template picker at top. Server actions guarded by `settings:edit`. Image uploads via existing storage presign.
4. **Templates polish:** Editorial (Memory-style) first, then Playful (WTTJ-style), then Minimal. Icons via `/better-icons`, motion via `/web-animation-design`.

### Verification
Pick each template in the builder → preview updates → public `/board/[slug]` renders it; SEO tags present (ties into Workstream 5); apply still works.

---

## Workstream 2 — Calendars

Calendar view of interviews. Data already exists (`interviews` table + Cal.com sync).

- **Data:** `features/calendars/data.ts` — `listInterviewsForRange({ workspaceId, from, to })` joining candidate + job + interviewer.
- **UI:** `dashboard/calendars` — month/week grid (build dependency-free, app `Tile` styling), interview chips colored by `type`, click → candidate drawer / detail. Filters: interviewer, job, type. Empty + loading states.
- Reuse `setInterviewStatus` (now emails the candidate on cancel) for actions.
- **Verify:** scheduled interviews appear on the right day; week/month toggle; click opens detail.

## Workstream 3 — Tasks

Recruiter to-dos surfaced on the overview (wishlist item).

- **Schema (new table `tasks`):** `id, workspaceId, title, notes?, dueAt?, status('open'|'done'), assigneeId?, candidateId?, jobId?, createdById, timestamps` + indexes `(workspaceId, status, dueAt)`.
- **Data/actions:** CRUD + toggle done (`features/tasks/`), guarded by membership; optional link to a candidate/job.
- **UI:** `dashboard/tasks` full list (filters: mine / all / overdue) + a compact "Your tasks" widget on the overview (`components/dashboard/widgets`). Quick-add from candidate profile.
- **Verify:** create/assign/complete a task; overdue styling; overview widget reflects it.

## Workstream 4 — Real ⌘K search

Today the command menu (`components/dashboard/CommandMenu.tsx`) is quick-nav only. Index real entities.

- **Data:** `features/search/data.ts` — `searchWorkspace(q)` querying jobs (title/slug), candidates (name/email/headline), members (name/email) with `ilike` + ranking + per-type limit; workspace-scoped. Add trigram indexes (`pg_trgm`) if needed.
- **UI:** extend CommandMenu with grouped results (Jobs / Candidates / People), icons, keyboard nav, recents. Debounced server action.
- **Verify:** typing a candidate name/email jumps to their profile; jobs/members resolve.

## Workstream 5 — SEO / Google for Jobs

Make the board discoverable → free inbound. Pairs with the widget + API.

- **Structured data:** emit `schema.org/JobPosting` JSON-LD per job on `board/[slug]/jobs/[jobSlug]` (title, description, datePosted, employmentType, hiringOrganization, jobLocation / `applicantLocationRequirements` for remote, `baseSalary` when present).
- **Sitemaps + metadata:** `board/[slug]/sitemap.ts`, canonical URLs, OpenGraph/Twitter cards per job (dynamic OG image optional), `robots`.
- **Verify:** Rich Results Test passes on a job URL; sitemap lists open jobs; OG preview renders.

## Workstream 6 — Compliance

- **GDPR/CCPA:** per-candidate **export** (JSON/zip of profile + applications + files + messages) and **delete/anonymize** (hard-delete vs scrub PII, keep aggregate). Server actions + audit entry. Settings → Privacy.
- **Audit log:** new `auditEvents` table (`workspaceId, actorId, action, entityType, entityId, ip, metadata, createdAt`); write on sensitive actions (member/role changes, API key create/revoke, data export/delete, settings). Viewer in settings.
- **Turnstile (optional):** Cloudflare Turnstile on the public apply form + intake API, env-gated; verify token server-side. Anti-bot for the "AI job spam" concern in the wishlist.
- **Verify:** export produces a complete bundle; delete scrubs PII; audit rows written; Turnstile blocks missing/invalid token when enabled.

## Workstream 7 — Two-way email / inbox

Candidate replies threaded into the timeline (today only outbound via `candidateMessages`).

- **Inbound:** provider inbound webhook (Resend inbound / IMAP later) → match by candidate email + thread → store as `candidateMessages` (direction `inbound`) → surface in candidate timeline + the `inbox` page.
- **Inbox page:** finish `dashboard/inbox` — conversation list + thread view + reply (reuses `sendWorkspaceEmail`).
- **Verify:** a reply to an outbound email appears in the candidate timeline + inbox.

## Workstream 8 — Enterprise (later)

- **SSO/SAML + SCIM** (Better Auth SSO plugin / WorkOS-style) — workspace-level.
- **Custom fields** on candidates/jobs (jsonb definitions + render in forms/profile).
- **Approval workflows** — job requisition + offer approval chains (`approvals` table, states, notify approvers).

---

## Recommended sequencing

1. **Career-page builder + templates** (most excited; closes API/widget loop; public-facing wow).
2. **Calendars** + **Tasks** (finish the visible stubs; data mostly exists).
3. **⌘K search** (fast, high daily value).
4. **SEO / Google for Jobs** (inbound; small, pairs with career page).
5. **Compliance** (export/delete + audit + Turnstile).
6. **Two-way email / inbox**.
7. **Talent pool** (sourcing/CRM — was queued; build after the above or swap up if sourcing is the priority).
8. **Enterprise** (SSO, custom fields, approvals).

Each lands as its own branch + verification pass. No commits until you say so.
