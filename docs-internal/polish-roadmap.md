# Harly — Polish Roadmap

_Última actualización: 2026-06-23_

Trabajo para llevar Harly a nivel Workable/Ashby. Self-hosting / OSS P0 excluido intencionalmente — primero se pulen features.

## Status snapshot (hecho)

- **Career pages**: builder con 4 templates (Minimal, Playful, Ashby, Greenhouse), live preview, board público con SEO. Workstream 1 COMPLETO.
- **Tasks**: board cards/rows, crear/asignar/completar, linked a candidatos/jobs. Workstream 3 COMPLETO.
- **Reports**: funnel, time-to-hire, source effectiveness, gráficos. Workstream 5 parcialmente completo.
- **Public API v1** + outbound webhooks + embeddable widget (`/embed/widget.js`) + Developers settings.
- **Full email set**: apply, stage, reject, offer extended/withdrawn, interview scheduled/canceled + platform auth emails.
- **Compliance base**: consent checkbox, audit logs, legal settings, public legal pages.
- **Repo lint + typecheck green** (root-cause fixes, no eslint-disable).

## Visible holes

- `calendars` — ComingSoon stub. Datos existen (`interviews` + Cal.com sync), falta UI de calendario.
- `templates` — ComingSoon stub.
- `apps/docs` — stub vacío.
- `apps/marketing` — stub vacío.
- `@harly/config`, `@harly/ui`, `@harly/validators` — packages vacíos.
- Búsqueda ⌘K — solo quick-nav, no indexa entidades reales.

---

## Workstream 1 — Career-page builder + templates ✅ COMPLETO

4 templates implementados: Minimal, Playful, Ashby, Greenhouse. Builder con live preview. Board público con SEO por slug.

## Workstream 2 — Calendars ← SIGUIENTE

Calendar view de entrevistas. Data ya existe (`interviews` table + Cal.com sync).

- **Data**: `features/calendars/data.ts` — `listInterviewsForRange({ workspaceId, from, to })`.
- **UI**: `dashboard/calendars` — month/week grid (build dependency-free, app `Tile` styling), interview chips colored by `type`, click → candidate drawer / detail. Filters: interviewer, job, type.
- Reuse `setInterviewStatus` (ya envía emails al cancelar).
- **Verify**: scheduled interviews aparecen en el día correcto; week/month toggle; click abre detail.

## Workstream 3 — Tasks ✅ COMPLETO

Board con cards/rows, crear/asignar/completar, filtros (mine/all/overdue), linked a candidatos/jobs.

## Workstream 4 — Real ⌘K search

Hoy es quick-nav. Falta indexar entidades reales.

- **Data**: `features/search/data.ts` — `searchWorkspace(q)` con jobs (title/slug), candidates (name/email/headline), members (name/email) con `ilike` + ranking. Workspace-scoped. Add trigram indexes (`pg_trgm`) si se necesita.
- **UI**: extender CommandMenu con resultados agrupados (Jobs / Candidates / People), icons, keyboard nav, recents. Debounced server action.
- **Verify**: typing candidate name/email salta a su profile; jobs/members resuelven.

## Workstream 5 — SEO / Google for Jobs ← parcialmente hecho

Career pages ya tienen SEO básico. Falta:

- **Structured data**: emitir `schema.org/JobPosting` JSON-LD por job en `board/[slug]/jobs/[jobSlug]`.
- **Sitemaps + metadata**: `board/[slug]/sitemap.ts`, canonical URLs, OpenGraph/Twitter cards por job, `robots`.
- **Verify**: Rich Results Test pasa en una job URL; sitemap lista jobs abiertos; OG preview renderiza.

## Workstream 6 — Compliance (parcialmente hecho)

- [x] Consent checkbox en apply form.
- [x] Audit logs wiring en acciones clave.
- [x] Legal settings admin + public legal pages.
- [ ] **GDPR/CCPA export**: per-candidate export (JSON/zip de profile + applications + files + messages).
- [ ] **GDPR/CCPA delete/anonymize**: hard-delete vs scrub PII, keep aggregate. Server actions + audit entry.
- [ ] **Turnstile (optional)**: Cloudflare Turnstile en apply form + intake API, env-gated.
- **Verify**: export produce bundle completo; delete scrub PII; audit rows escritos; Turnstile bloquea tokens inválidos cuando está habilitado.

## Workstream 7 — Two-way email / inbox

Candidate replies en thread del timeline (hoy solo outbound via `candidateMessages`).

- **Inbound**: provider inbound webhook (Resend inbound / IMAP) → match por candidate email + thread → store como `candidateMessages` (direction `inbound`) → surface en timeline + inbox page.
- **Inbox page**: terminar `dashboard/inbox` — conversation list + thread view + reply (reutiliza `sendWorkspaceEmail`).
- **Verify**: reply a outbound email aparece en candidate timeline + inbox.

## Workstream 8 — Enterprise (después)

- **SSO/SAML + SCIM** (Better Auth SSO plugin / WorkOS-style) — workspace-level.
- **Custom fields** en candidates/jobs (jsonb definitions + render en forms/profile).
- **Approval workflows** — job requisition + offer approval chains (`approvals` table, states, notify approvers).

---

## Sequencing recomendado

1. ~~Career-page builder + templates~~ ✅
2. **Calendars** ← SIGUIENTE (terminar stub, data ya existe)
3. **⌘K search** (quick win, alto valor diario)
4. **Compliance export/delete** (GDPR)
5. **Two-way email / inbox**
6. **SEO / Google for Jobs** (inbound, pequeño, combina con career page)
7. **Enterprise** (SSO, custom fields, approvals)

Cada uno como branch propio + verification pass.
