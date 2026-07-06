# Harly — Gap Analysis para ATS open-source completo

_Última actualización: 2026-07-05_

Estado de Harly frente a un ATS open-source self-hostable de referencia (modelo Cal.com / Twenty: código abierto + cloud managed como monetización).

## ✅ Ya construido

- **Identidad / multi-tenant**: Better Auth (email+password, magic link, Google OAuth, passkeys, organization plugin). Workspace switcher + onboarding wizard.
- **Jobs**: CRUD, slug público, custom questions, branding por job, board público con SEO, estados draft/open/closed, hiring team, AI description generation, AI question suggestions, trash.
- **Apply flow**: formulario público, upload de CV (local/S3), preguntas configurables, detección de duplicados, autofill best-effort, persiste skills + experience years, consentimiento GDPR.
- **Pipeline**: kanban drag&drop, reorden, vista board+lista, bulk actions, búsqueda, filtros, emails por cambio de stage, UI estilo Ashby/Workable.
- **Candidates**: perfil completo (editar, notas, timeline, archivos, AI score, AI interview brief, AI notes summarizer, AI duplicate detection, tags, bulk email, import CSV, schedule interviews, trash).
- **Talent Pool**: pool de candidatos sourced, source filtering, job assignment.
- **Career Pages**: builder con 4 templates (Minimal, Playful, Ashby, Greenhouse), live preview, board público con SEO.
- **Reports**: funnel de conversión, time-to-hire, source effectiveness, gráficos.
- **Tasks**: board con cards/rows, crear/asignar/completar, linked a candidatos/jobs.
- **Interviews**: tabla real `interviews`, Cal.com integration (OAuth + webhook firmado), mark complete/cancel.
- **Offers**: drawer/panel, extend/withdraw, emails.
- **Templates**: email templates + interpolación de variables + TemplatesManager UI.
- **Calendars**: real month grid + filters + clickthrough.
- **Storage**: adapter abstracto local + S3/R2 con presigned URLs.
- **Emails**: 19 react-email templates + Resend (fallback consola) + AI email drafting + UI para conectar Resend/SMTP + inbound email (webhook receiver, reply tracking).
- **Search ⌘K**: spotlight palette con búsqueda real sobre jobs y candidates (ilike, workspace-scoped).
- **API v1**: REST `/api/v1/*`, API keys por workspace, OpenAPI spec, webhooks outbound con HMAC signing, cron dispatch, public endpoints.
- **Integrations**: Google Calendar (OAuth + sync), Cal.com, Slack OAuth.
- **Legal & Compliance**: EU compliance research, settings admin, public legal pages, consent checkbox, audit logs en acciones clave.
- **Security**: 2FA, passkeys, audit logs, force 2FA, SSO/OIDC+SAML (Better Auth SSO plugin — SsoCard + SsoConfigDrawer + SsoProviderDrawer + sso-actions).
- **Dark mode**: completo en dashboard + career pages.
- **Settings**: General, Members, Invitations, Roles (RBAC custom), AI, Email, Developers, Integrations, Legal, Portal, Security.
- **Candidate Portal**: OAuth (Google, GitHub, LinkedIn), login/dashboard/jobs/profile.
- **UI/UX**: shadcn/ui + lucide (37 componentes), sidebar colapsable, ⌘K quick-nav, theme toggle.

## ❌ Falta — por prioridad

### P0 — Bloqueante para lanzar OSS

1. **Self-hosting serio**
   - `create-harly` CLI — hoy solo README placeholder en `tooling/create-harly/src`.
   - Dockerfile de la app + docker-compose completo (app + Postgres).
   - Healthcheck endpoint, validación de env (zod) al boot, seed limpio.
   - One-click deploy buttons (Vercel + Railway) en README.
   - Docs de deploy (`apps/docs` — hoy stub vacío).

2. **README**: tech stack correcto, features list, `docker compose up` one-liner. Falta: GIF del pipeline, screenshots, deploy buttons.

3. **Packages vacíos**: `@harly/config`, `@harly/ui`, `@harly/validators` son stubs sin implementar.

4. **Bug de seguridad**: `proxy.ts` exime al owner de 2FA enforcement (linea 128-132) — **DEBE removerse antes de launch**.

### P1 — Core faltante

5. ~~**Two-way email / inbox**~~ ✅ Implementado — inbound webhook (Resend + Postmark), reply tracking, settings UI.

6. **Scorecards estructurados**: hiring team + scheduling ✅. Falta: kit de entrevista (criterios por stage), evaluaciones estructuradas con rúbrica.

7. **Import masivo desde otros ATS**: import CSV parcial ✅. Falta: import desde Greenhouse/Lever/otros, integraciones Gmail/LinkedIn.

### P2 — Calidad y madurez

8. **Tests e2e**: 0 Playwright tests. 15 unit tests solamente.

9. **Cal.com webhook real sin probar**: requiere `NEXT_PUBLIC_APP_URL` público (túnel/deploy) y API key con scope webhook. `cal-api-version` sin confirmar contra changelog.

10. **apps/docs y apps/marketing**: stubs vacíos — pendiente hasta lanzamiento.

11. **README actualizado**: ✅ Tech stack correcto, features list, estructura de packages real.

### P3 — Enterprise / futuro

11. **Custom fields**: campos extra definidos por el workspace en candidates/jobs (jsonb definitions + UI builder). No hay schema ni UI hoy.

12. **Approval workflows**: job requisition approval chain + offer approval antes de enviar. No hay nada hoy.

13. **i18n**: 0 hoy (solo ES/EN hardcoded).

## Modelo de monetización (referencia)

Open-source gratis forever (self-host). Cloud managed = MRR: Free (1 job activo) + Pro ($19/mes ilimitado + AI features). Enterprise = soporte self-host + integraciones premium.

## Próximo sprint sugerido

Próximo sprint: self-hosting (Dockerfile + docker-compose + healthcheck + env validation) + fix 2FA bug → primer lanzamiento GitHub/HN. Luego P1 (two-way email, scorecards).
