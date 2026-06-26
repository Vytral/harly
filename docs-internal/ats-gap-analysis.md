# Harly — Gap Analysis para ATS open-source completo

_Última actualización: 2026-06-23_

Estado de Harly frente a un ATS open-source self-hostable de referencia (modelo Cal.com / Twenty: código abierto + cloud managed como monetización).

## ✅ Ya construido

- **Identidad / multi-tenant**: Better Auth (email+password, magic link, Google OAuth, passkeys, organization plugin). Workspace switcher + onboarding wizard.
- **Jobs**: CRUD, slug público, custom questions, branding por job, board público con SEO, estados draft/open/closed, hiring team, AI description generation, AI question suggestions, trash.
- **Apply flow**: formulario público, upload de CV (local/S3), preguntas configurables, detección de duplicados, autofill best-effort, persiste skills + experience years, consentimiento GDPR.
- **Pipeline**: kanban drag&drop, reorden, vista board+lista, bulk actions, búsqueda, filtros, emails por cambio de stage, UI estilo Ashby/Workable.
- **Candidates**: perfil completo (editar, notas, timeline, archivos, AI score, tags, bulk email, import CSV, schedule interviews, trash).
- **Talent Pool**: pool de candidatos sourced, source filtering, job assignment.
- **Career Pages**: builder con 4 templates (Minimal, Playful, Ashby, Greenhouse), live preview, board público con SEO.
- **Reports**: funnel de conversión, time-to-hire, source effectiveness, gráficos.
- **Tasks**: board con cards/rows, crear/asignar/completar, linked a candidatos/jobs.
- **Interviews**: tabla real `interviews`, Cal.com integration (OAuth + webhook firmado), mark complete/cancel.
- **Offers**: drawer/panel, extend/withdraw, emails.
- **Storage**: adapter abstracto local + S3/R2 con presigned URLs.
- **Emails**: 19 react-email templates + Resend (fallback consola) + AI email drafting.
- **API v1**: REST `/api/v1/*`, API keys por workspace, OpenAPI spec, webhooks outbound con HMAC signing, cron dispatch, public endpoints.
- **Integrations**: Google Calendar (OAuth + sync), Cal.com, Slack OAuth.
- **Legal & Compliance**: EU compliance research, settings admin, public legal pages, consent checkbox, audit logs en acciones clave.
- **Security**: 2FA, passkeys, audit logs, force 2FA, SSO placeholder.
- **Settings**: General, Members, Invitations, Roles (RBAC custom), AI, Email, Developers, Integrations, Legal, Portal, Security.
- **Candidate Portal**: OAuth (Google, GitHub), login/dashboard/jobs/profile.
- **UI/UX**: shadcn/ui + lucide (37 componentes), sidebar colapsable, ⌘K quick-nav, theme toggle.

## ❌ Falta — por prioridad

### P0 — Bloqueante para lanzar OSS

1. **Self-hosting serio**
   - `create-harly` CLI (hoy placeholder en `tooling/create-harly`).
   - Dockerfile de la app + docker-compose completo (app + Postgres).
   - Healthcheck endpoint, validación de env (zod) al boot, seed limpio.
   - One-click deploy buttons (Vercel + Railway) en README.
   - Docs de deploy (`apps/docs` — hoy stub vacío).

2. **README actualizado**: hoy dice tRPC/Neon/Uploadthing, nada de eso es real. Needs: tech stack correcto, GIF del pipeline, screenshots, `docker compose up` one-liner.

3. **Packages vacíos**: `@harly/config`, `@harly/ui`, `@harly/validators` son stubs.

### P1 — Core faltante

4. **Búsqueda global ⌘K real**: hoy es quick-nav; falta indexar jobs/candidates/miembros con ranking.

5. **Email producción**: UI para conectar Resend/SMTP, remitente verificado, toggle por workspace, plantillas editables (parcialmente hecho, falta pulir).

6. **Two-way email / inbox**: hoy solo outbound; falta inbound webhook → thread → timeline.

7. **Sourcing / import**: import masivo CSV (parcial), import desde otros ATS, integraciones (Greenhouse, Gmail, LinkedIn) — placeholders "coming soon".

8. **Scorecards / entrevistas**: hiring team ✅ + scheduling ✅. Falta: kit de entrevista (criterios por stage), evaluaciones strutured.

### P2 — Calidad y madurez

9. **Tests e2e**: 0 Playwright tests hoy. 15 unit tests (0 .test.tsx).

10. **Calendars page**: ComingSoon stub — datos existen (interviews + Cal.com), falta UI de calendario.

11. **Templates page**: ComingSoon stub.

12. **apps/docs y apps/marketing**: stubs vacíos.

13. **Dark mode**: parcial (career pages), falta en dashboard.

14. **i18n**: 0 hoy (solo ES/EN hardcoded).

### P3 — Enterprise

15. **SSO/SAML + SCIM** (Better Auth SSO plugin).
16. **Custom fields** en candidatos/jobs (jsonb definitions).
17. **Approval workflows** — job requisition + offer approval chains.

## Modelo de monetización (referencia)

Open-source gratis forever (self-host). Cloud managed = MRR: Free (1 job activo) + Pro ($19/mes ilimitado + AI features). Enterprise = soporte self-host + integraciones premium.

## Próximo sprint sugerido

P0 completo (self-hosting + README fix + apps/docs) → primer lanzamiento GitHub/HN. Luego P1.4 (⌘K search) como quick win, luego P1.6 (two-way email) o P1.8 (scorecards) según prioridad.
