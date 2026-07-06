# Harly — Pendientes

_Última actualización: 2026-07-05_

Trabajo diferido a propósito. Se construirá después.

## Stubs del sidebar (ComingSoon pages)

- [x] `calendars` — vista calendario de entrevistas. Implementado: real month grid + filters + clickthrough.
- [ ] `templates` — plantillas de emails + interview kits / scorecard templates por job.

## Pendientes menores

- [ ] Probar registro de webhook Cal.com real (`registerCalWebhookAction`) — requiere `NEXT_PUBLIC_APP_URL` público (túnel/deploy) y API key con scope webhook.
- [ ] Confirmar el `cal-api-version` exacto por endpoint contra el changelog de Cal.com.

## ✅ Hecho (antes pendiente)

- [x] Tasks — board con cards/rows, crear/asignar/completar, linked a candidatos/jobs.
- [x] Inbox — notifications con lista + actions + filters.
- [x] Talent Pool — pool de candidatos sourced, source filtering, job assignment.
- [x] Career Page — builder con 4 templates, live preview, board público con SEO.
- [x] Reports — funnel, time-to-hire, source effectiveness.
- [x] Scheduling real + Cal.com integration (OAuth + webhook firmado).
- [x] Permisos por rol — RBAC custom con roles y permission sets.
- [x] Creador de roles personalizado — admin define roles con set de permisos.
- [x] Permisos en server actions + UI (ocultar/deshabilitar según rol).
