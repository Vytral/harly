# Harly — Polish Roadmap

_Última actualización: 2026-07-05_

Trabajo para llevar Harly a nivel Workable/Ashby. Self-hosting / OSS P0 excluido intencionalmente — primero se pulen features.

## Status snapshot (hecho)

- **Career pages**: builder con 4 templates (Minimal, Playful, Ashby, Greenhouse), live preview, board público con SEO. Workstream 1 COMPLETO.
- **Tasks**: board cards/rows, crear/asignar/completar, linked a candidatos/jobs. Workstream 3 COMPLETO.
- **Reports**: funnel, time-to-hire, source effectiveness, gráficos. Workstream 5 parcialmente completo.
- **Public API v1** + outbound webhooks + embeddable widget (`/embed/widget.js`) + Developers settings.
- **Full email set**: apply, stage, reject, offer extended/withdrawn, interview scheduled/canceled + platform auth emails.
- **Compliance base**: consent checkbox, audit logs, legal settings, public legal pages.
- **Repo lint + typecheck green** (root-cause fixes, no eslint-disable).
- **Calendars**: real month grid + filters + clickthrough. COMPLETO.
- **⌘K search**: spotlight palette con búsqueda real sobre jobs y candidates. COMPLETO.
- **Inbound email**: webhook receiver, reply tracking, settings UI. COMPLETO.

## Visible holes

- `templates` — ComingSoon stub.
- `apps/docs` — stub vacío.
- `apps/marketing` — stub vacío.
- `@harly/config`, `@harly/ui`, `@harly/validators` — packages vacíos.

---

## Workstream 1 — Career-page builder + templates ✅ COMPLETO

4 templates implementados: Minimal, Playful, Ashby, Greenhouse. Builder con live preview. Board público con SEO por slug.

## Workstream 2 — Calendars ✅ COMPLETO

Calendar view de entrevistas. Implementado: real month grid + filters + clickthrough.

## Workstream 3 — Tasks ✅ COMPLETO

Board con cards/rows, crear/asignar/completar, filtros (mine/all/overdue), linked a candidatos/jobs.

## Workstream 4 — Real ⌘K search ✅ COMPLETO

Spotlight palette con búsqueda real sobre jobs y candidates (ilike, workspace-scoped).

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

## Workstream 7 — Two-way email / inbox ✅ COMPLETO

Inbound email integration: webhook receiver (Resend + Postmark), reply tracking, settings UI.

## Workstream 8 — Enterprise (después)

- **SSO/SAML + SCIM** (Better Auth SSO plugin / WorkOS-style) — workspace-level.
- **Custom fields** en candidates/jobs (jsonb definitions + render en forms/profile).
- **Approval workflows** — job requisition + offer approval chains (`approvals` table, states, notify approvers).

---

## Sequencing recomendado

1. ~~Career-page builder + templates~~ ✅
2. ~~Calendars~~ ✅
3. ~~⌘K search~~ ✅
4. **Compliance export/delete** (GDPR) ← SIGUIENTE
5. ~~Two-way email / inbox~~ ✅
6. **SEO / Google for Jobs** (inbound, pequeño, combina con career page)
7. **Enterprise** (SSO, custom fields, approvals)

Cada uno como branch propio + verification pass.
