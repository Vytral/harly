# OpenHire — Gap analysis para un ATS open-source completo

_Última actualización: 2026-05-30_

Estado de OpenHire frente a un ATS open-source self-hostable de referencia (modelo Cal.com / Twenty: código abierto + cloud managed como monetización). Marca qué existe, qué falta, y prioridad.

## ✅ Ya construido

- **Identidad / multi-tenant**: Better Auth (email+password, magic link, Google OAuth, organization plugin). Fuente única de verdad tras el refactor de identidad (2026-05-30).
- **Jobs**: CRUD, slug público, custom questions, branding por job, board público con SEO, estados draft/open/closed.
- **Apply flow**: formulario público, upload de CV (local/S3), preguntas configurables, detección de duplicados, autofill best-effort.
- **Pipeline**: kanban drag&drop, reorden, bulk actions, emails por cambio de stage.
- **Candidates**: perfil, notas, timeline de actividad, archivos.
- **Storage**: adapter abstracto local + S3/R2 con presigned URLs.
- **Emails**: react-email templates + Resend (fallback consola).
- **Settings**: workspace profile, branding board, miembros, invitaciones, roles.
- **UI/UX (2026-05-30)**: design system shadcn/ui + lucide, shell con sidebar colapsable + ⌘K, dashboard/jobs/pipeline/candidates/settings rediseñados grado Ashby/Workable.

## ❌ Falta — por prioridad

### P0 — Bloqueante para lanzar OSS
1. **Self-hosting serio**
   - Wizard `create-harly` (hoy placeholder en `tooling/create-harly`).
   - Dockerfile de la app + `docker-compose` completo (app + Postgres + Redis).
   - Healthcheck endpoint, validación de env (zod) al boot, seed limpio.
   - Botones one-click deploy (Vercel + Neon/Railway) en README.
   - Docs de deploy (`apps/docs`).
2. **README épico**: GIF del pipeline, screenshots del nuevo UI, `docker compose up` one-liner. Es lo que da stars en HN/r/selfhosted.
3. **Corregir drift de docs**: README dice tRPC/Neon/Uploadthing; real es Server Actions/Docker Postgres/storage propio.

### P1 — Diferenciadores y core faltante
4. **API pública + webhooks** (hoy 0 — diferenciador clave vs OpenCATS):
   - REST `/api/v1/*`, API keys por workspace, OpenAPI spec.
   - Webhooks: on application, on stage change, on hire.
5. **Reporting / analytics**: time-to-hire, funnel de conversión por stage, fuentes, gráficos en overview (cuando haya datos).
6. **Búsqueda global ⌘K real**: hoy es quick-nav; falta indexar jobs/candidates/miembros.
7. **Email producción**: UI para conectar Resend/SMTP, remitente verificado, toggle por workspace, plantillas editables.

### P2 — Colaboración y reclutamiento avanzado
8. **Scorecards / evaluaciones**: hiring team por job ✅ + scorecards básicos ✅. Falta: kit de entrevista (criterios), @menciones en notas.
9. **Scheduling** ✅ (2026-06-05): interviews reales (tabla `interviews`) desde el perfil + Cal.com (Settings → Integrations) con webhook firmado que sincroniza bookings. Falta: registro de webhook contra cuenta Cal.com real (necesita URL pública).
10. **CV parsing / IA**: extracción multiformato ✅ (pdf/docx/rtf/txt) + parse con IA BYO-key ✅. Falta: candidate scoring (plan Pro).
11. **Sourcing / import**: ❌ import masivo CSV, import desde otros ATS, integraciones (Greenhouse, Gmail, LinkedIn) — placeholders "coming soon" ya visibles en Settings → Integrations.

### P3 — Cumplimiento y madurez
12. **Compliance**: export + borrado GDPR/CCPA, consentimiento, audit log, Cloudflare Turnstile opcional en apply.
13. **Calidad**: tests unitarios, e2e críticos (Playwright), hardening de permisos por rol, estados de error consistentes.
14. **UX extra**: dark mode, i18n (ES/EN), datos de muestra (cargar/eliminar), badge OSS/BETA + versión (ya en sidebar), directorio de empleados (visión SIRH futura).

## Modelo de monetización (referencia)
Open-source gratis forever (self-host). Cloud managed = MRR: Free (1 job activo) + Pro ($19/mes ilimitado + AI features). Enterprise = soporte self-host + integraciones premium.

## Próximo sprint sugerido
P0 completo (self-hosting + README + docs fix) → primer lanzamiento en GitHub/HN. Luego P1.4 (API+webhooks) como gancho para devs.
