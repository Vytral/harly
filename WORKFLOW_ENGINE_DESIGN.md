# Harly Workflow Engine — Documento de diseño e implementación

> Mapa completo para construir un sistema de automatizaciones visuales ("workflow creator") sobre Harly. Este documento es la guía paso a paso: qué, por qué, cómo, y en qué orden. Diseñado para iterarse en fases.

## 0. TL;DR — ¿Es viable y es un diferenciador?

**Viabilidad: ALTA.** Harly ya tiene el 80% de la infraestructura que un workflow engine necesita:

- **Eventos de dominio** (`emitWebhookEvent` + `WebhookEvent` enum) → son los **triggers** naturales.
- **Catálogo de acciones tipadas** (`lib/ai/agent/write-actions.ts`) → son los **actions** listos para reusar.
- **Integraciones** (Slack, Discord, Telegram, Gmail, Outlook, Cal, GCal, Zoom, Teams, Jitsi, GitHub) → **actions externas**.
- **API v1 completa + idempotencia** → los workflows pueden llamarse a sí mismos vía API segura.
- **AI agent** que ya sabe razonar sobre acciones → puede **generar workflows desde lenguaje natural**.
- **Outbox durable + dispatch con backoff** → infraestructura de ejecución confiable.

**Diferenciador: SÍ, fuerte.** La mayoría de ATS tienen reglas rígidas (auto-reject por score, auto-advance por stage). Lo que proposed es un **workflow engine visual de propósito general** (estilo Zapier/n8n pero nativo del ATS) + **generación por IA** ("descríbeme la regla y la construyo"). Eso es lo que tienen **Greenhouse + Ashby** en forma muy limitada, y lo que **Linear/Attio** están popularizando. Para devs, poder llamar HTTP requests custom + webhooks salientes condicionales es un atractivo real.

---

## 1. Visión del producto

### 1.1 Qué es
Un **Workflow** es una regla automatizada con la estructura **WHEN (trigger) → IF (condición) → DO (acciones)**.

Ejemplos concretos (los que diste + más):
- **WHEN** candidate applies to job X **IF** `experienceYears < 2` **DO** reject + send email
- **WHEN** candidate applies **IF** `experienceYears > 3` AND `skills includes "React"` **DO** move to "Screening" stage + notify Slack
- **WHEN** application moved to "Technical" stage **IF** AI score >= 80 **DO** schedule interview with interviewer Y
- **WHEN** application rejected **IF** `source = "LinkedIn"` **DO** send Slack message + create candidate note "rejected from LinkedIn"
- **WHEN** offer accepted **DO** send Slack 🎉 + create task "onboarding checklist" + HTTP webhook to HRIS
- **WHEN** interview completed **IF** scorecard avg < 3 **DO** auto-reject + email

### 1.2 Audiencia
1. **Recruiters/HR** (no técnicos): UI visual, builder de bloques, plantillas.
2. **Power users / ops** (semi-técnicos): condiciones complejas, plantillas custom.
3. **Developers**: HTTP actions, webhooks salientes, API para crear workflows programáticamente.

### 1.3 Principios de diseño
- **Seguro antes que poderoso**: una automatización rota no puede dañar datos de candidatos. Dry-run + audit log + undo.
- **Determinístico por defecto**: las condiciones son evaluables en código (no LLM-arbitradas) salvo una action explícita "AI evaluate".
- **Reutiliza lo existente**: los actions del workflow = los `write-actions` del AI agent. Un solo catálogo.
- **Workspace-scoped**: todo aislado por workspace, con RBAC.
- **Observable**: cada ejecución queda en `workflow_runs` con input, condición evaluada, acciones ejecutadas, errores.

---

## 2. Arquitectura técnica

### 2.1 Visión general de componentes

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard UI: /dashboard/automations                       │
│  - lista de workflows (enable/disable)                      │
│  - builder visual (trigger → condición → acciones)          │
│  - historial de ejecuciones (workflow_runs)                 │
│  - plantillas                                                │
└─────────────────────────────────────────────────────────────┘
                         │ server actions
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  features/automations/                                      │
│  - data.ts        (queries, scoped)                         │
│  - actions.ts     (createWorkflow, updateWorkflow, run...)  │
│  - service.ts     (REST API v1 layer)                       │
│  - engine.ts      (evalúa condición, ejecuta acciones)      │
│  - conditions.ts  (operadores, fields, evaluador)           │
│  - registry.ts    (catálogo de triggers/actions/conditions) │
│  - schema.ts      (Zod: workflow, step, condition)          │
└─────────────────────────────────────────────────────────────┘
                         │
            ┌────────────┴───────────────┐
            ▼                            ▼
┌──────────────────────┐    ┌──────────────────────────┐
│  Trigger dispatch    │    │  Action executor         │
│  (subscribe a        │    │  reusa write-actions +   │
│   emitWebhookEvent)  │    │  integraciones + HTTP    │
└──────────────────────┘    └──────────────────────────┘
```

### 2.2 Modelo de datos (tablas nuevas)

```sql
-- Definición de un workflow (la regla)
workflow_definitions
  id              uuid pk
  workspaceId     text fk → organization
  name            text           -- "Auto-reject < 2 years"
  description     text
  enabled         bool default true
  trigger         jsonb          -- { event, filter }
  conditions      jsonb          -- [[expr, op, expr], AND/OR group] (árbol)
  actions         jsonb          -- [{ type, config }, ...] secuencia
  createdById     text fk → user
  created_at / updated_at
  index (workspaceId, enabled)

-- Cada ejecución (auditoría + debug + replay)
workflow_runs
  id              uuid pk
  workspaceId     text fk
  workflowId      uuid fk → workflow_definitions (cascade)
  triggerEvent    text          -- "application.created"
  triggerPayload  jsonb         -- el data del emit
  conditionResult jsonb         -- { matched: bool, evaluated: {...} }
  status          enum          -- running | succeeded | failed | skipped
  startedAt       timestamptz
  finishedAt      timestamptz
  error           text
  index (workspaceId, workflowId, startedAt)

-- Cada acción ejecutada dentro de un run (granular)
workflow_run_steps
  id              uuid pk
  workspaceId     text fk
  runId           uuid fk → workflow_runs (cascade)
  actionType      text
  actionInput     jsonb
  result          jsonb         -- { success, error?, data? }
  startedAt / finishedAt
  index (runId)
```

**Por qué JSONB para `trigger`/`conditions`/`actions`:** la forma de un workflow es arbitrariamente anidada (condiciones con AND/OR, secuencias de acciones). Modelar todo como columnas relacionales es over-engineering para v1 y fricción al evolucionar. JSONB + validación Zod estricta + index en `workspaceId` es el balance correcto. Si una query se vuelve hotspot, se extrae columna.

### 2.3 Trigger — cómo se conecta a `emitWebhookEvent`

**Hoy:** `emitWebhookEvent(workspaceId, event, data)` itera endpoints de webhook y encola deliveries.

**Cambio:** antes de (o además de) lo anterior, **consulta workflows habilitados cuyo `trigger.event === event`** y encola un `workflow_run` por cada uno. Patrón durable:

```
emitWebhookEvent(ws, event, data)
  ├─ por cada workflow habilitado con trigger.event === event:
  │     insert workflow_runs (status=running, triggerEvent, triggerPayload=data)
  │     void runWorkflow(runId).catch(log)
  └─ (lo existente: webhook endpoints + chat/telegram/etc.)
```

**Alternativa más desacoplada:** un **subscriber** separado que escucha los mismos eventos. Pero como `emitWebhookEvent` ya es el único chokepoint y está en server-only, inyectar ahí es más simple y garantiza orden. Se puede extraer a un `dispatchEvent` más adelante.

**Filtros de trigger:** el `trigger` puede tener un `filter` para no disparar workflows innecesariamente. Ej: `trigger = { event: "application.created", filter: { jobId: "job-1" } }`. El filter se evalúa contra `data` antes de crear el run (cheap).

### 2.4 Condiciones — el evaluador

Las condiciones son un **árbol** serializado en JSONB:

```ts
type Condition =
  | { type: "leaf"; field: FieldRef; op: Operator; value: JSONValue }
  | { type: "and"; children: Condition[] }
  | { type: "or"; children: Condition[] }
  | { type: "not"; child: Condition };

type FieldRef =
  | { kind: "candidate"; path: "experienceYears" | "skills" | "location" | ... }
  | { kind: "application"; path: "status" | "currentStageId" | "source" | ... }
  | { kind: "job"; path: "department" | "employmentType" | ... }
  | { kind: "ai"; path: "score" | "recommendation" }   // si hay evaluación
  | { kind: "trigger"; path: string }                   // campo del payload
  | { kind: "literal"; value: JSONValue };

type Operator =
  | "eq" | "ne" | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in"
  | "includes"         // array contains value
  | "starts_with" | "ends_with" | "contains"  // strings
  | "is_set" | "is_empty"
  | "match_any"        // array intersects array
  | "regex";
```

**Evaluador** (`conditions.ts`):
- `evaluateCondition(cond, context) → { matched: bool, evaluated: [...] }`
- El `context` se carga al inicio del run: candidate + application + job + AI score (si aplica) en **una** query join.
- El evaluador es **puro y determinístico** — sin I/O, sin LLM. Eso lo hace testeable y predecible.
- Se registra el `evaluated` (qué field, qué valor, qué resultado) en `conditionResult` para debug.

**Por qué no un DSL custom ni SQL:** JSONB + evaluator TS = tipado de extremo a extremo con Zod, reutilizable en el builder UI (que arma el árbol) y en el engine. Un DSL textural requeriría parser + sería fricción para la UI.

### 2.5 Acciones — catálogo unificado

**Clave del diseño:** los actions del workflow son **los mismos** que los del AI agent (`write-actions.ts`). Hoy ese catálogo es un record `Record<ActionName, { schema, run }>`. Se extrae a un **registry compartido** `features/automations/registry.ts` (o `lib/actions/registry.ts`) que consumen tanto el AI agent como el workflow engine.

Action types v1:
1. **Pipeline**: `move_stage`, `set_status` (active/rejected/hired/withdrawn)
2. **Candidate**: `add_note`, `add_tag`, `remove_tag`, `update_fields`
3. **Communication**: `send_email` (template), `send_slack`, `send_telegram`, `send_discord`
4. **Interview**: `schedule_interview`
5. **Offer**: `create_offer`, `send_offer`
6. **Task**: `create_task` (asignar a usuario)
7. **External**: `http_request` (con SSRF guard + secret refs), `emit_webhook`
8. **AI**: `ai_score` (evalúa candidato vs job), `ai_summarize`, `ai_decide` (LLM arbitra con prompt + guardrails)
9. **Control**: `delay` (espera N minutos/horas), `branch` (if/else), `loop` (post-MVP)

Cada action en el registry:
```ts
{
  type: "move_stage",
  category: "pipeline",
  label: "Move to stage",
  schema: moveStageSchema,            // Zod, reusado del AI agent
  run: async (input, ctx) => ActionResult,
  requiresPermission: "candidates:edit",
  // para el builder UI:
  fields: [{ name: "stageId", type: "select", source: "jobStages" }],
  // para la UI de "qué hizo":
  summarize: (input) => `Moved to ${input.stageName}`,
}
```

**Ejecución de acciones:**
- Secuencial dentro de un run, con `workflow_run_steps` por cada una.
- Si una action falla: el run entero se marca `failed` (salvo que la action tenga `continueOnError: true`).
- Las actions que ya son idempotentes (offers, interviews) se reusan directo.
- Las actions de communication pasan por el **outbox durable** (igual que hoy) — sin fire-and-forget silencioso.
- `http_request` usa `safeFetchWebhook` (SSRF guard existente) + soporta secret refs (`{{secrets.HRIS_TOKEN}}`).

### 2.6 Permisos y seguridad

- **Crear/editar workflows:** nuevo permiso `automations:manage` (admin/owner por defecto).
- **Ejecución:** los workflows corren con un **actor de servicio** (`workflow-actor`) que tiene los permisos que el workspace le otorgue. Para v1, el workflow hereda los permisos del `createdById` (más simple) o un rol `automation` dedicado. Documentar la decisión.
- **`http_request`:** restringir a URLs validadas por `validateWebhookUrl` (SSRF), Allow-list de métodos, timeout, secret refs del workspace (no inline).
- **Rate limiting:** un workflow no puede disparar más de N runs/min por workspace (anti-loop). Detección de loops: si un action dispara un evento que dispara el mismo workflow, cortar.
- **Secrets:** los `http_request` actions referencian secrets del workspace (encriptados, como los webhook endpoints), nunca se persisten en claro en el JSONB.

### 2.7 AI: generación de workflows desde lenguaje natural

Este es el **diferenciador "wow"**:

```
User: "Descarta automáticamente los candidatos con menos de 2 años de experiencia
       para el puesto de Senior Engineer, y avísame por Slack."
                │
                ▼
Harly AI (con tools de workflow):
  - tool: create_workflow({ name, trigger, conditions, actions })
  - el LLM arma el JSONB usando el catálogo (registry) como schema
  - valida con Zod antes de persistir
  - muestra el workflow resultante en el builder para que el user lo revise
  - "Te lo armé. ¿Lo activo?"  ← human-in-the-loop
```

**Implementación:**
- Se agrega una tool `create_workflow` al AI agent (como las de `write-actions`).
- El system prompt del agent conoce el catálogo (registry) y el schema de condiciones.
- El LLM produce el workflow como JSON estructurado, validado por Zod.
- **Human-in-the-loop obligatorio** para v1: el agent propone, el user revisa y activa. Nunca auto-activa.
- Post-MVP: "optimize this workflow" / "explain why this run skipped".

---

## 3. Fases de implementación (el mapa paso a paso)

### FASE 0 — Fundaciones (1-2 días) ✋ no saltear
**Goal:** poner la base sin tocar nada existente.

- [ ] **0.1** Crear `packages/db` migration: tablas `workflow_definitions`, `workflow_runs`, `workflow_run_steps` + tipos Drizzle.
- [ ] **0.2** Crear `features/automations/` vacío con `schema.ts` (Zod: `WorkflowDefinition`, `Condition`, `Action`, `Trigger`).
- [ ] **0.3** Definir tipos `WorkflowEvent` como subset de `WebhookEvent` (los que pueden ser trigger).
- [ ] **0.4** Tests del schema Zod: casos válidos/inválidos de workflows.

**Entregable:** schema + tablas + tipos. Nada ejecuta todavía.

### FASE 1 — Registry + Conditions (2-3 días)
**Goal:** el motor puramente funcional, sin UI ni triggers reales.

- [ ] **1.1** Extraer `write-actions.ts` a un **registry compartido** `lib/actions/registry.ts` (sin romper el AI agent — re-exportar).
- [ ] **1.2** `features/automations/conditions.ts`: el evaluador puro (`evaluateCondition`) + 100% de tests (todos los operadores, AND/OR/NOT, fields de candidate/application/job/ai).
- [ ] **1.3** `features/automations/engine.ts`: `runWorkflow(runId)` que carga contexto, evalúa condición, ejecuta acciones secuencialmente, escribe `workflow_runs` + `workflow_run_steps`.
- [ ] **1.4** Actions v1: `move_stage`, `set_status`, `add_note`, `add_tag`, `send_slack`, `send_email`, `http_request`. Cada una con test.
- [ ] **1.5** Test de integración end-to-end: un workflow defixture se ejecuta contra un payload defixture y produce el run esperado.

**Entregable:** engine funciona invocándolo directo. Sin UI.

### FASE 2 — Triggers reales (1-2 días)
**Goal:** workflows se disparen solos con eventos reales.

- [ ] **2.1** Modificar `emitWebhookEvent` para, además de webhooks, encolar `workflow_runs` para workflows con `trigger.event === event` que pasen el `trigger.filter`.
- [ ] **2.2** `runWorkflow` se invoca best-effort (como el chat notify) con el outbox/dispatch como safety net si se cae.
- [ ] **2.3** Tests: emitir un evento dispara el workflow correcto y no dispara los que no matchean.
- [ ] **2.4** Protección anti-loop: detección de re-entrada (un action que dispara el mismo evento+workflow se corta).

**Entregable:** crear un workflow en DB → aplicar un candidato → ver el run ejecutarse.

### FASE 3 — Data layer + server actions + REST API (2 días)
**Goal:** CRUD completo programáticamente y desde el dashboard.

- [ ] **3.1** `features/automations/data.ts`: `listWorkflows`, `getWorkflow`, `createWorkflow`, `updateWorkflow`, `deleteWorkflow`, `listRuns`, `getRun` — todo workspace-scoped.
- [ ] **3.2** `features/automations/actions.ts`: server actions (`createWorkflowAction`, etc.) con `requirePermission("automations:manage")`.
- [ ] **3.3** `features/automations/service.ts`: REST API v1 (`GET/POST/PATCH/DELETE /api/v1/automations`, `GET /api/v1/automations/:id/runs`).
- [ ] **3.4** Validación Zod al persistir (nunca confiar en JSONB crudo del cliente).
- [ ] **3.5** Tests de cada server action + ruta API.

**Entregable:** se puede crear un workflow por API/UI y verlo persistido.

### FASE 4 — Builder UI (4-6 días) ← la parte visible más grande
**Goal:** UI visual para armar workflows sin code.

- [ ] **4.1** Ruta `/dashboard/automations` (lista + enable/disable + runs).
- [ ] **4.2** Builder: 3 paneles — Trigger / Condition / Actions. Drag-and-drop opcional para v1 (selects + inputs alcanzan).
- [ ] **4.3** Selectores de field (`candidate.experienceYears`), operador, valor — con autocomplete de stages/tags/jobs del workspace.
- [ ] **4.4** Preview del workflow en lenguaje natural ("When a candidate applies to X and has < 2 years, reject and email").
- [ ] **4.5** **Dry-run**: cargar un candidate/application real y ver qué pasaría (evalúa condición sin ejecutar actions).
- [ ] **4.6** Vista de `workflow_runs` con timeline de steps, error, replay.
- [ ] **4.7** Plantillas: 6-8 templates predefinidos (auto-reject por experiencia, auto-advance por score, etc.).

**Entregable:** recruiter no técnico arma y activa un workflow.

### FASE 5 — AI generation (2-3 días) ← el diferenciador
**Goal:** "descríbeme la regla y la construyo".

- [ ] **5.1** Tool `create_workflow` en el AI agent (registry-aware).
- [ ] **5.2** System prompt: conoce el catálogo de triggers/conditions/actions + ejemplos few-shot.
- [ ] **5.3** El agent produce el workflow, lo valida con Zod, lo **propone** en el builder para revisión humana (no auto-activa).
- [ ] **5.4** Test: prompts variados → workflows válidos.
- [ ] **5.5** UI: chat "Create an automation that…" → preview del workflow → "Activate".

**Entregable:** user escribe la regla, Harly arma el workflow, user activa.

### FASE 6 — Pulido + observabilidad (2 días)
- [ ] **6.1** Dashboard de "automations that ran today" (widget en dashboard principal).
- [ ] **6.2** Notificaciones cuando un workflow falla N veces seguidas.
- [ ] **6.3** Límites: max workflows por workspace (plan-based), max actions por workflow, max runs/min.
- [ ] **6.4** Audit log: cada `workflow_run` linkea al `activityEvents` del actor-servicio.
- [ ] **6.5** Docs pública (developers.harly.dev): cómo crear workflows por API + catálogo de actions/conditions.

---

## 4. Decisiones de diseño — DECIDIDAS ✅

Confirmadas con Max (2026-07-19). Estas son las decisiones finales, no recomendaciones.

| # | Pregunta | Decisión | Justificación |
|---|----------|----------|---------------|
| **D1** | ¿Actor de los workflows? | **Hereda permisos de `createdById` en v1** | Es lo más simple y correcto para v1: el workflow actúa en nombre del recruiter que lo creó. **Deuda técnica anotada:** si más adelante hacemos workflows exportables/compartibles (marketplace de automatizaciones), migramos a un rol `automation` dedicado con permisos propios. La migración es sencilla porque ya tenemos el campo `createdById` como pivote. |
| **D2** | ¿JSONB o tablas relacionales para conditions/actions? | **JSONB + validación Zod estricta** | La forma de un workflow es arbitrariamente anidada (AND/OR/NOT, secuencias de acciones). Tablas relacionales serían over-engineering para v1 y fricción al evolucionar el schema. JSONB + Zod da tipado de extremo a extremo + el builder UI arma el mismo árbol + el engine lo evalúa. Si una query se vuelve hotspot, se extrae columna indexada (ej: `trigger_event` sí va como columna para el index). |
| **D3** | ¿Síncrono o asíncrono (cola) para runs? | **Asíncrono best-effort en v1** (patrón del chat notify) | Reusar el patrón `void runWorkflow(runId).catch(log)` que ya usa `notifyChatEvent`. Sin nueva infraestructura. El outbox durable (para emails/slack) + el `workflow_runs` persistido al inicio son el safety net: si el proceso se cae, el cron de webhooks ya existente puede reclamar runs `running` stalled (igual que hace con deliveries). **v2:** cola durable propia (`workflow_queue`) con claim+lock como el outbox. |
| **D4** | ¿Dry-run obligatorio antes de activar? | **Recomendado pero opcional** | El dry-run (FASE 4.5) es una herramienta de confianza, no una barrera. Obligarlo frustra al power user que sabe lo que quiere; pero la UI debe **sugerirlo fuerte** la primera vez que se activa un workflow con acciones destructivas (reject/hired). |
| **D5** | ¿Workflows por workspace o por job? | **Por workspace, con `trigger.filter.jobId` opcional** | Un workflow puede aplicar a todos los jobs del workspace (caso común: "auto-reject < 2 años en cualquier puesto senior") o a uno específico via filter. Escapa al scope de v1 tener workflows por-job como entidad separada. |
| **D6** | ¿Permitir `http_request` en v1? | **Sí, reusando `safeFetchWebhook`** (SSRF guard existente) | Es el hook que hace la feature atractiva para devs. El SSRF guard ya está resuelto (`validateWebhookUrl` + redirect validation + private-IP block). Con secret refs del workspace (no inline) + allowlist de métodos + timeout. |
| **D7** | ¿AI auto-activa o solo propone? | **Solo propone, nunca auto-activa. Human-in-the-loop siempre** | Una automatización puede rechazar candidatos en masa. Auto-activar sin revisión es irresponsable. El agent arma el workflow, lo valida con Zod, lo **muestra en el builder** para que el user lo revise y active manualmente. Mismo wow-factor, cero riesgo. |
| **D8** | ¿Límite de actions por workflow? | **10 actions en v1, configurable por plan** | Evita runs infinitos / workflows spaghetti. 10 cubre todos los casos razonables (trigger → condición → 2-3 actions + notificaciones). El límite se sube en planes superiores. |

### Nota de trade-offs y dudas que surgieron al diseñar

**T1 — Heredar permisos de `createdById` tiene un edge case real:** si el recruiter que creó el workflow pierde acceso al workspace (sale, se remueve, se le baja el rol), el workflow sigue ejecutándose con sus permisos stale. Para v1 lo mitigamos con: (a) si `createdById` ya no es miembro, el run falla con error claro en `workflow_runs.error` ("creator no longer has access"); (b) al remover un miembro, se disablean sus workflows (lo agregamos al hook de removal). **Lo dejo anotado para FASE 2.** La migración a rol `automation` dedicado (D1 deuda) resuelve esto de raíz.

**T2 — JSONB para conditions hace difícil un futuro "find all workflows that check experienceYears":** una query `WHERE conditions::text LIKE '%experienceYears%'` es frágil. Para v1 no la necesitamos, pero si surge (ej: "qué workflows se rompen si renombramos un field"), se resuelve con una columna `condition_fields` generada (array de field paths) o un index GIN. **No lo construyo ahora** — YAGNI hasta que aparezca el caso.

**T3 — Async best-effort (D3) puede perder un run si el proceso muere entre el `INSERT workflow_runs` y el `void runWorkflow()`:** el run queda `running` para siempre. Lo resolvemos en FASE 2 reusando el mismo patrón del outbox: el cron de webhooks (o uno nuevo) reclama runs `running` con `locked_at < now() - 5min` igual que `dispatchDueWebhooks` hace con deliveries. **Es parte del plan de FASE 2, no deuda.**

**T4 — `http_request` con secret refs requiere definir el modelo de secrets del workspace:** hoy solo los webhook endpoints tienen secret encriptado. Para `http_request` actions necesito un `workspace_secrets` table (clave→valor encriptado) referenciable como `{{secrets.NAME}}` en el config del action. **Lo sumo a FASE 1** (actions v1) porque `http_request` no funciona sin esto. Es una tabla más en la migration de FASE 0.

**T5 — Dry-run opcional (D4) necesita un modo "evalúa pero no ejecutes":** el engine ya separa `evaluateCondition` (pura) de `executeActions` (con side effects). El dry-run solo llama la primera + simula las actions (devuelve qué haría sin llamarlas). **Es natural con el diseño del engine** — no es work extra, solo un flag `dryRun: true` en `runWorkflow`.

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Loop infinito (action dispara evento que dispara workflow) | Detección de re-entrada por `triggerEvent` + hash del run padre; cortar tras 1 re-entrada |
| Workflow daña datos (auto-reject masivo por bug) | Dry-run obligatorio sugerido + audit log + `workflow_runs` permite "revertir" estados conocidos (v2) + rate limit |
| Condición mal evaluada por tipado débil | Zod estricto + tests del evaluator con tabla de casos + `conditionResult.evaluated` para debug |
| `http_request` a URLs maliciosas | `validateWebhookUrl` (SSRF, ya existe) + secret refs + allowlist de métodos + timeout |
| Performance: N workflows por evento | `trigger.filter` cheap evalúa antes de crear run; index `(workspaceId, enabled, trigger_event)` |
| AI alucina workflows inválidos | Zod validation hard-fail + human-in-the-loop + el agent solo propone |
| Secretos en JSONB | Secrets referenciados por id, encriptados aparte (como webhook endpoints) |
| Concurrencia: dos runs del mismo workflow | Cada run es independiente (idempotency en actions reusada) |

---

## 6. Catálogo v1 detallado

### 6.1 Triggers
| Event | Descripción | Payload clave |
|-------|-------------|---------------|
| `application.created` | Candidato aplica | applicationId, candidateId, jobId |
| `application.stage_changed` | Cambió de etapa | applicationId, fromStageId, toStageId |
| `application.hired` | Contratado | applicationId |
| `application.rejected` | Rechazado | applicationId |
| `candidate.created` | Candidato creado | candidateId |
| `candidate.updated` | Candidato editado | candidateId, fields |
| `interview.scheduled` | Entrevista agendada | interviewId, candidateId |
| `interview.completed` | Entrevista completada | interviewId |
| `job.published` | Job publicado | jobId |

### 6.2 Condition fields
- **Candidate**: experienceYears, skills (array), location, headline, tags, linkedinUrl, githubUrl, summary (contains)
- **Application**: status, currentStageId, source, appliedAt (date), aiScore, aiRecommendation
- **Job**: department, employmentType, workplaceType, experienceLevel, location
- **Trigger**: cualquier campo del payload

### 6.3 Actions v1
| Action | Reusa | Notas |
|--------|-------|-------|
| `move_stage` | `moveApplicationInPipeline` | |
| `set_status` | `updateApplicationStatus` | |
| `add_note` | `createCandidateNote` | |
| `add_tag` | `addCandidateTag` | |
| `send_email` | outbox + templates | template id o body inline |
| `send_slack` | `notifyChatEvent` | |
| `send_telegram` | `notifyTelegramEvent` | |
| `schedule_interview` | `scheduleInterview` | |
| `create_task` | nuevo (tasks ya existen) | |
| `http_request` | `safeFetchWebhook` | con secret refs |
| `ai_score` | `bulkGenerateAiEvaluationsForJob` | reevalúa |
| `delay` | nuevo (cron o sleep) | v1.1 |

---

## 7. Estructura de archivos propuesta

```
apps/web/src/
├── features/automations/
│   ├── actions.ts          # server actions (createWorkflow, etc.)
│   ├── conditions.ts       # evaluador puro
│   ├── data.ts             # queries scoped
│   ├── engine.ts           # runWorkflow
│   ├── registry.ts         # catálogo de actions (compartido con AI agent)
│   ├── schema.ts           # Zod
│   ├── service.ts          # REST API v1
│   ├── templates.ts        # plantillas predefinidas
│   └── *.test.ts
├── app/(dashboard)/dashboard/automations/
│   ├── page.tsx            # lista
│   ├── new/page.tsx        # builder
│   ├── [id]/page.tsx       # edit + runs
│   └── _components/        # builder blocks
packages/db/src/schema.ts   # +3 tablas
```

---

## 8. Métricas de éxito (post-launch)

- % de workspaces con ≥1 workflow activo
- # de runs/día por workspace
- # de runs fallidos / total (error rate)
- Time-to-first-workflow (desde signup hasta primer run)
- Uso de AI generation vs builder manual
- NPS de la feature

---

## 9. Cómo empezar (primer commit)

1. **Leer este doc de arriba a abajo** y decidir las preguntas abiertas (sección 4).
2. **FASE 0.1**: crear la migration de las 3 tablas en `packages/db`.
3. **FASE 0.2**: crear `features/automations/schema.ts` con los tipos Zod.
4. Avanzar fase por fase, con tests en cada una, **sin saltar fases**.

**Duración estimada total:** 12-18 días de trabajo concentrado (con testing + docs). Se puede parar en cualquier límite de fase y tener algo funcional: FASE 3 = API funcional, FASE 4 = UI usable, FASE 5 = AI wow.

---

## 10. Notas de implementación específicas de Harly

- **Reusar `emitWebhookEvent`** como chokepoint de triggers (sección 2.3). No crear un segundo bus de eventos.
- **Reusar `write-actions.ts`** como catálogo de actions (sección 2.5). Extraer a `registry.ts` compartido.
- **Reusar `safeFetchWebhook`** para `http_request` (SSRF ya resuelto).
- **Reusar el outbox** para emails/slack durable (no fire-and-forget).
- **Reusar `requirePermission`** + agregar `automations:manage`.
- **Reusar `ApiError` + `withApi` + `reserveIdempotencyKey`** para la REST API v1.
- **Reusar `activityEvents`** para auditar runs.
- **Reusar el `WorkspaceContext`** para scoping.

> **Regla de oro:** si estás escribiendo lógica que ya existe en `write-actions`, `notify`, `outbox`, o `pipeline/actions`, **estás duplicando**. Pará y reusá.
