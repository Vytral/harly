# P01 — Baseline e inventario de Automations v2

Paquete: P01
Estado: verificado (inventario; no cambió producto)
Fecha: 2026-09-06
Worktree: `.worktrees/automations-revamp`
Rama: `feat/automations-revamp`
HEAD: `e4dcae6` (igual a `main` commit; 0 commits de ventaja)
Checkout servido en `http://localhost:3000`: PID 33014,
cwd `/Users/maximiliano/Downloads/curious-monkey/.worktrees/automations-revamp/apps/web`

Este documento es evidencia de P01. No habilita canvas, waits ni tools nuevas.
ADR propuesto: `docs/decisions/ADR-006-automations-v2-durable-graph.md`.
Plan: `docs/automations-product-plan.md`.

---

## 1. Diff preservado (no pisar)

`git status --short` al inventario: 45 archivos modificados, **+2076 / −807**,
más untracked `docs/automations-product-plan.md`.

Ese diff **no** es el motor v2. Es trabajo previo en este worktree:

- Kill switch `AUTOMATIONS_ENABLED = true` **solo aquí**. En el working tree
  de `main` sigue `false`. No copiar este flag a main.
- EventId en `skipDomainEvent` / persist, filtros anidados
  (`application.jobId`, `toStageId` / `toStageName`).
- Builder lineal When → If → Then (intro, Save deshabilitado sin trigger+acción,
  stage picker por job o nombres únicos).
- Interpolación de email/Slack, resume desde paused, etc.

Main (fuera de este worktree) tiene cambios uncommitted distintos (integridad
ATS, migraciones 0143/0144). No mezclar. No migrar la DB compartida para
probar esta propuesta.

---

## 2. Defectos de Codex, revalidados en el checkout actual

No se usó la revisión anterior como prueba. Cada ítem se leyó otra vez.

| ID | Hallazgo Codex | Estado actual | Evidencia |
| --- | --- | --- | --- |
| D1 | `updateFilterKey` se llama en serie y cada llamada clona `value.filter` anterior | **Vigente.** Elegir job borra stage en llamadas 2–3 que no ven el `jobId` de la 1. | `builder/TriggerPanel.tsx` ~59–70 y 141–144, 165–169 |
| D2 | `RunsTimeline` no está montado | **Vigente.** Único match del símbolo: su propio archivo. El builder muestra métricas agregadas. | `builder/RunsTimeline.tsx`; `WorkflowBuilder.tsx` ~392–423 |
| D3 | API pública `/api/v1/automations` siempre 410 | **Vigente, intencional mientras el kill switch de API sigue apagado.** Las rutas ignoran `AUTOMATIONS_ENABLED` del builder y siempre responden 410. Tests afirman 410. OpenAPI/docs siguen describiendo CRUD. | `app/api/v1/automations/**/route.ts` |
| D4 | Se publican acciones con `config` no validado | **Vigente.** `actionSchema.config` es `z.record`. `parseWorkflowInput` no llama al registry. El schema del handler corre en `engine.ts` al ejecutar. | `schema.ts` ~237–241; `data.ts` `parseWorkflowInput`; `engine.ts` `executeAction` |
| D5 | Guardar draft exige flujo completo | **Vigente y peor que “config incompleta”.** `actionsSchema.min(1)` y `name.min(1)`. UI deshabilita Save sin trigger+acción. P02 debe permitir draft incompleto estructuralmente seguro. | `schema.ts` ~248–251; `WorkflowBuilder.tsx` ~337 |
| D6 | Editar despublica la misma fila | **Vigente.** `updateWorkflow` pone `status: "draft"`, `enabled: false` y anula approved/published. No hay `workflow_drafts`. | `data.ts` ~273–291 |
| D7 | Delete optimista no restaura | **Vigente.** `confirmRemove` saca la card antes del server action; si falla, toast y la fila no vuelve. | `AutomationsManager.tsx` ~76–88 |
| D8 | `getBuilderData` carga hasta 100 candidatos | **Vigente.** | `builder-data.ts` ~79–84 |
| D9 | Condiciones: UI no construye grupos AND/OR/NOT | **Parcialmente vigente.** El AST lo soporta. `addRoot` solo inserta `leaf`. Switch AND/OR existe para nodos que ya son grupo; no hay control para crear el grupo. | `ConditionPanel.tsx` ~39–51, 200–233 |
| D10 | `pruneDomainEventOutbox` puede borrar no despachado | **Vigente.** Borra `created_at < 7d` si `automations_dispatched_at` es null **o** el evento no está en `WORKFLOW_EVENTS`. | `server/events/outbox.ts` ~16–32 |
| D11 | Historial de aprobación de publicación | Recorrido existe (request/approve/publish, publisher ≠ approver) pero no hay bandeja de revisión en el editor. Publicar desde UI sigue dependiendo de ese estado. | `data.ts` `publishWorkflow`; `actions.ts` |

Typecheck/tests de Codex (135) **no se re-ejecutaron en P01**. Tratarlos como
stale hasta P02.

---

## 3. Capacidades reales del motor v1

### Triggers (`WORKFLOW_EVENTS`)

`application.created|stage_changed|hired|rejected`,
`candidate.created|updated`, `interview.scheduled|completed`, `job.published`.

El domain registry tiene además `candidate.referred`, `interview.rescheduled|canceled`,
`job.updated|closed`, `task.*`, `mail.received`. **No hay** eventos
`document.*` ni `signature.*`.

### Acciones ola 1 del plan → servicio identificado

| Tool plan v2 | Equivalente v1 | Servicio / adapter | Permiso handler | ¿Seleccionado hoy? | Gap |
| --- | --- | --- | --- | --- | --- |
| `application.move_stage` | `move_stage` | `moveApplicationStageForApi` | `candidates:move` | sí | Filtro job/stage D1; stage por nombre case-insensitive |
| `application.set_status` | `set_status` | `hireApplicationForApi` / `rejectApplicationForApi` o update directo | (handler sin `requiresPermission` explícito en el bloque hire/reject) | sí | ADR-005 solo bloquea reject **si** hay condición de evaluación + `requiresHumanReview`/`rules`. Hire automático sigue permitido. Plan: “Reclutar” no debe mapearse callado a `application.hired` |
| `candidate.add_tag` / `remove_tag` | `add_tag` / `remove_tag` | insert/delete `candidate_tags` en registry | (ver registry) | sí | No hay servicio de tags aparte del handler |
| `candidate.add_note` | `add_note` | insert `candidate_notes` con `workflowEffectId` | `collab:write` | sí | No pasa por un service de notas si existe uno de UI |
| `task.create` | `create_task` | `assertTaskReferences` + `insert(tasks)` | **`collab:write`**, no `tasks:write` | sí | No usa `createTaskForApi`; P06 debe alinear permiso y servicio |
| `email.send` | `send_email` | `enqueueEmailOutbox` + plantillas `email_templates` | (email) | sí | Riesgo de doble envío con `job_stages.emailConfig` / pipeline mail. HITL posterior |
| `chat.send` | `send_slack` | `notifyChatEvent` | (notify) | sí | Slack/Discord unificados; catálogo dice “chat message” |
| `notification.create` | — | `createNotification` en `server/notify/inbox.ts` | — | no | Sin handler. Algunas features insertan `notifications` directo |
| `condition` | árbol IF v1 | `conditions.ts` | — | sí (panel IF) | No es un nodo de grafo |
| `end` | implícito al terminar la lista | — | — | no | v2 lo necesita explícito |

### Catalog vs registry

Handlers registrados: `move_stage`, `set_status`, `add_note`, `add_tag`,
`remove_tag`, `create_task`, `send_slack`, `send_email`, `http_request`.

`http_request` **tiene handler** y `available: false` en el catálogo (plan: ola 3).
No presentarlo como utilizable en UI.

Tipos en schema sin handler: `send_telegram`, `send_discord`,
`schedule_interview`, `create_offer`, `send_offer`, `ai_*`. Correcto: hidden.

### Runtime v1

- Tablas: `workflow_definitions`, `workflow_definition_versions`,
  `workflow_runs` (unique workspace/workflow/`source_event_id`),
  `workflow_run_steps`, `workflow_action_effects`, `workspace_secrets`.
- No hay waits, receipts, node executions, drafts, in-run approvals.
- Engine recorre `actions[]` con `startStepIndex`. Dry-run no escribe dominio.
- Lease/heartbeat/retry existen; no hay `waiting` como estado de producto.
- Causalidad v1: `parentRunId` + heurísticas; el diff actual ya pasa `eventId`.

### Scheduler

`tooling/runtime/src/entrypoint.ts`:

| Job | Path | Intervalo |
| --- | --- | --- |
| domain-events | `/api/cron/domain-events` | **15 s** (dispatch outbox + `dispatchWorkflowEventsFromOutbox`) |
| automations | `/api/cron/automations` | **10 s** target, **60 s** fallback (`dispatchDueWorkflowRuns` + legacy reclaim) |
| webhooks-dispatch | `/api/cron/webhooks/dispatch` | **60 s** (webhook/chat delivery only) |

El plan pide cron dedicado `automations` a 10 s (fallback 60 s) y retirar v2
de webhooks-dispatch. Hoy v1 está en **los dos** crons. No hay
`/api/cron/automations`.

---

## 4. Supuestos documentales, firma, equipos, calendario, AI

Cada fila es evidencia o tarea explícita. Nada se da por implementado en el motor.

| Supuesto del plan | ¿Existe en Harly? | Evidencia | Tarea de dominio |
| --- | --- | --- | --- |
| Solicitar documentos al candidato | Sí, session-coupled | `documents/requests-actions.ts` `requestDocuments` (`documents:manage`); tabla `document_requests` (pending→submitted→accepted\|declined\|waived) | P10: extraer servicio con actor explícito. No hay eventos de dominio al crear/resolver |
| Portal: ver pendientes de entrega | Sí | `portal/applications/[applicationId]/page.tsx` + `listDocumentRequestsForPortal` | Extender a firma de paquete, no solo upload |
| Paquete documental versionado (`document_packages`) | **No** | `packages/db/src/schema.ts`: `documents`, `document_versions`, `document_requests`. Cero `document_package*` | Crear entidad en P10 si el inventario se mantiene; no inventarla en P03 |
| Generación de PDF desde plantilla + variables | **No reutilizable como motor** | Hub de documentos + pdfjs para colocar campos. No hay merge de plantilla → paquete | P10: schema de variables y generación versionada, o recortar la plantilla del caso principal a documentos ya existentes |
| Enviar a firma (proveedor) | Sí | `lib/esign/document-signing.ts` `sendDocumentForEnvelope` (DocuSeal). Idempotencia parcial por `signatureStatus` pending/signed | Handler `signature.request` reusa esto; no reimplementar OTP |
| Firma nativa Harly | Sí | `lib/esign/native/{remote,finalize}.ts`, `documents/native-sign-actions.ts` | Reusar; evento **después** de persistir evidencia |
| Portal: firmar oferta | Sí | `PortalOfferSignCard` / `signOfferNatively` | Distinto de “paquete de onboarding”. El caso principal no es una oferta |
| Completar paquete cuando todos firmaron | **No** | No hay packageId ni wait. Cron `esign-reconciliation` existe para proveedores | P07/P10: `wait.document_package` + eventos nuevos |
| Equipo “Operaciones” con membresía | **No** | `member.team` es `text`. `job_hiring_team` es asignación a un job, no un directorio | P08: selector de personas. Tarea de dominio de equipos **antes** de habilitar “equipo” |
| Entrevistas | Sí | `interviews/service.ts` create/update/status; cron `interview-sync` 60 s | Ola 3 (`interview.*`). No seleccionar ahora |
| Calendario / booking link | Integraciones existentes, no tool de automations | handlers `schedule_interview` unavailable | P11 |
| Plantillas de email | Sí | `email_templates`, una activa por tipo | Ola 1 `email.send` |
| Callers AI de workflows | **No hay tool de CRUD** | `lib/ai` no importa `features/automations`. Knowledge menciona API/webhooks. OpenAPI describe automations mientras las rutas dan 410 | Antes de exponer v2 al agente: misma validación/publicación. No bypass |
| Evaluación → auto-rechazo | Guardia parcial ADR-005 | `engine.ts` ~473–492 | Mantener y ampliar: score nunca rechaza, aunque no haya condición de evaluación |

---

## 5. Mapa de permisos

Fuente: `features/workspaces/permissions.ts`.

Hoy hay **una** clave: `automations:manage` (crear / editar / toggle / borrar).
Owner y admin la tienen (set completo). Recruiter también. Hiring manager no.

El plan exige split `read` / `edit` / `publish` / `operate` con migración
explícita de roles. Hasta P08/P12:

| Capacidad plan | Hoy | Notas |
| --- | --- | --- |
| Listar / ver builder | `automations:manage` | No hay read-only |
| Guardar draft | idem | |
| Publicar | idem + approval de **otro** miembro (`publishWorkflow`) | No relajar |
| Pausar / reanudar | idem | Resume ya re-publica enabled |
| Operar run (retry/cancel) | no expuesto en UI (timeline desmontada) | |
| Aprobar paso de un run | no existe | P08: elegibilidad + acceso al recurso, **no** exige editar workflows |
| Ejecutar `move_stage` | `candidates:move` del **createdBy** | Engine afirma permiso del actor, no del editor actual |
| Ejecutar `create_task` | `collab:write` del actor | Desalineado con `tasks:write` |
| Documentos | `documents:manage` / `share` / `read` | Independiente. Un workflow owner no gana todos los jobs (ADR-003) |

Scope: `RoleScope.jobAccess` `all` \| `assigned` + departments/regions.
`automations:manage` **no** debe ampliarse a todos los jobs. P05/P21: selectores
paginados con el mismo guard que el resto del ATS.

Audit events actuales: `automation.approved|published|paused|resumed` (y
request). Faltan draft saved, run cancelled/retried/replayed, ownership
changed — P12.

---

## 6. Checklist de aceptación P01

- [x] Worktree/diff registrado; cambios previos preservados.
- [x] Defectos vigentes revalidados (D1–D11).
- [x] Cada acción ola 1 tiene servicio o gap explícito.
- [x] Cada supuesto documental/firma/equipo/calendario/AI tiene evidencia o tarea.
- [x] Schema/retención/outbox descritos; prune inseguro anotado.
- [x] Permisos mapeados; split futuro no implementado.
- [x] Scheduler real (15 s / 60 s) documentado vs 10 s del plan.
- [x] Localhost corresponde a este checkout.
- [x] ADR-006 propuesto (Postgres + grafo). Sin SQL generado.
- [x] Producto no modificado en este paquete (solo docs).

---

## 7. Registro del paquete

```text
Paquete: P01
Estado: verificado
Commit/PR: (docs locales, sin commit)
Requisitos y casos Txx cubiertos: inventario; Txx son de P02+
Archivos existentes reutilizados: schema/engine/registry/permissions/cron/documents/esign/portal/events
Archivos nuevos:
  docs/decisions/ADR-006-automations-v2-durable-graph.md
  docs/automations-p01-baseline.md
Migración/compatibilidad: ninguna. v1 intacto. Kill switch true solo en worktree.
Comandos ejecutados y resultado: git status/diff/log; lectura de fuentes; lsof cwd del next-server. Typecheck/vitest no re-corridos (stale).
Evidencia del recorrido: n/a (P01 no cambia UI). Localhost = este worktree.
Desviaciones justificadas respecto del plan: ninguna de alcance. http_request tiene handler pero sigue no seleccionable. create_task no usa createTaskForApi.
Pendientes que bloquean el siguiente paquete: ninguno. P02 puede reparar D1, D2, D4, D5, D7 y explicar D3 sin schema v2.
```

```text
Paquete: P02
Estado: verificado
Commit/PR: (worktree sucio, sin commit)
Requisitos y casos Txx cubiertos: T01 (patchTriggerFilter atómico), T02 (draft vacío persistible; publish issues por nodo)
Archivos existentes reutilizados: TriggerPanel, schema, data, actions, WorkflowBuilder, AutomationsManager, API 410, docs
Archivos nuevos:
  features/automations/publish-validation.ts
  features/automations/publish-validation.test.ts
  features/automations/list-restore.ts
  features/automations/list-restore.test.ts
Migración/compatibilidad: ninguna. Draft/published sigue en la misma fila (P03). API pública sigue 410 a propósito.
Comandos: pnpm --filter web exec vitest run src/features/automations src/app/api/v1/automations ; typecheck
Evidencia del recorrido: builder Save sin acción; Runs tab; docs 410
Desviaciones: validación de config de acción al publicar y al pedir approval, no en approve. Nombre vacío se guarda como "Untitled recipe".
Pendientes que bloquean el siguiente paquete: ninguno para P03.
```

```text
Paquete: P03
Estado: verificado
Commit/PR: (worktree sucio, sin commit)
Requisitos y casos Txx cubiertos:
  T02 (draft incompleto sigue guardable; publish valida grafo)
  T05 (ids/puertos/ciclos/unreachable/bindings)
  T08 (hash de draft independiente del snapshot publicado; save no toca trigger/actions live)
  T09 (hash distinto invalida reviewHash)
  T22 (adapter v1↔v2 roundtrip)
  T04: CAS WHERE revision=expected; no se corrió locking con dos conexiones Postgres
Archivos nuevos: features/automations/definition/*, packages/db/migrations/0143_hot_union_jack.sql
Migración: 0143_hot_union_jack aplicada en harly local. generate sin drift. drizzle-kit check ok.
  AVISO: main tiene 0143/0144 uncommitted distintos; al merge hay que renumerar.
Comandos: vitest automations 154 passed; web typecheck; eslint; db:migrate; db:generate; drizzle-kit check
Evidencia: dispatcher sigue leyendo workflow_definitions.enabled+trigger; engine usa definitionSnapshot del run
Desviaciones: tablas de runtime (waits, node executions) aplazadas a P06/P07. Sin FK circular published_version_id.
Pendientes que bloquean el siguiente paquete: ninguno para P04 (canvas).
```

```text
Paquete: P04
Estado: verificado
Dependencias: @xyflow/react@12.11.6 (MIT, peer react>=17), elkjs@0.12.0 (EPL-2.0 OR GPL-3.0-or-later), carga diferida
Requisitos: T05 existente; T06 move/insert/delete; T07 comandos teclado/clic; T25 100 nodos en validador
Archivos nuevos: builder/canvas/*, builder/state/*
Migración: ninguna
Comandos: vitest automations 160 passed; eslint canvas/state limpio
Evidencia: no se recorrió el builder en browser (login). Recargar /dashboard/automations/new
Desviaciones: inspector/biblioteca mínimos (P05 los profundiza). Playwright T07 no corrido.
Pendientes: P05 formularios tipados, autosave, BindingPicker
```
