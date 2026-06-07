# OpenHire — Pendientes anotados

_Última actualización: 2026-06-05_

Trabajo diferido a propósito. Se construirá después.

## Stubs del sidebar (páginas de 13 líneas, placeholder)

Construir contenido real para cada una. Hoy están enlazadas en el sidebar pero
abren vacío — ocultar o construir antes de lanzamiento serio.

- [ ] `tasks` — tareas pendientes del recrutador.
- [ ] `inbox` — bandeja de entrada (mensajes/notificaciones).
- [ ] `talent-pool` — pool de talento / candidatos sourced.
- [ ] `templates` — plantillas (emails + **interview kits / scorecard templates** por job → liga con P2.8).
- [ ] `reports` — analytics: time-to-hire, funnel por stage, fuentes, gráficos.
- [ ] `calendars` — vista calendario de entrevistas (depende de scheduling real, P2.9).
- [ ] `career-page` — editor de la página pública de carreras.

## Sistema de permisos y roles

- [ ] Permisos específicos por rol (granular, por sección/acción).
- [ ] Creador de roles personalizado: el admin define roles con su set de permisos.
- [ ] Aplicar permisos en server actions + UI (ocultar/deshabilitar según rol).

## Hecho (P2)

- [x] **P2.9 Scheduling real + Cal.com** (2026-06-05).
  - ScheduleDrawer escribe en la tabla `interviews` real (antes era una nota fake).
    Form: rol/aplicación, type, mode, fecha/hora, duración, interviewer, link/dirección, notas.
  - Pestaña "Interviews" en el perfil del candidato + acciones Mark complete / Cancel.
  - Dashboard "Today's interviews" y métricas ahora leen interviews reales creados in-app.
  - Cal.com como primer card de la nueva página **Settings → Integrations**
    (Google Calendar / Gmail / Greenhouse / LinkedIn = placeholders "coming soon").
  - Webhook `POST /api/webhooks/cal?ws=<id>`: verifica firma HMAC-SHA256
    (`x-cal-signature-256`), sincroniza BOOKING_CREATED/RESCHEDULED/CANCELLED a
    `interviews` (idempotente por `cal_booking_uid`). Verificado E2E local.
  - ScheduleDrawer ofrece "Copy booking link" (Cal.com self-schedule prefilled)
    cuando Cal está conectado.
  - Migraciones: `0005` (interviews.source + cal_booking_uid), `0006` (cal_booking_url).

  Pendiente menor de Cal.com (necesita cuenta Cal.com real + URL pública):
  - [ ] Probar registro de webhook real (`registerCalWebhookAction`) — requiere
        `NEXT_PUBLIC_APP_URL` público (túnel/deploy) y API key con scope webhook.
  - [ ] Confirmar el `cal-api-version` exacto por endpoint contra el changelog de Cal.com.
