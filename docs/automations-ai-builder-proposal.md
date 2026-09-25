# Harly AI Builder — Propuesta de arquitectura y estado de implementación

> **Estado actualizado el 16 de septiembre de 2026:** esta propuesta es el documento histórico de diseño. La implementación actualmente disponible vive en `ai-proposals.ts`, las tools del agente y el Automations Builder. Para el estado verificado, las brechas restantes y el plan vigente, consulta [Harly AI × Automations Builder](harly-ai-automations-integration-audit-2026-09-16.md).

Estado: **documento de arquitectura histórica; parcialmente implementado y sujeto a la auditoría vigente**. Todo lo citado abajo (`definition/schema-v2.ts`,
`definition/validate.ts`, `builder/state/commands.ts`, `lib/ai/agent/write-tools.ts`, etc.) es
código real del worktree. Las diferencias entre este diseño y el comportamiento actual deben
resolverse consultando la auditoría vigente y los contratos ejecutables, no interpretando este
documento como una lista de trabajo pendiente.

## 1. Principio rector

El copiloto **no genera JSON libre que luego se intenta encajar en el grafo**. Genera llamadas a
un conjunto fijo de *tools* que son wrappers 1:1 sobre las funciones puras que ya usa el editor
manual (`state/commands.ts`: `addNode`, `connectNodes`, `deleteNodes`, `insertOnEdge`,
`explainConnect`, `duplicateNodes`). Esto da dos garantías gratis:

- **Imposible generar un grafo inválido por construcción.** `connectNodes`/`explainConnect` ya
  rechazan ciclos y conexiones a puertos incompatibles (`reaches`, `dominatorsOf` en
  `validate.ts`). Si el copiloto llama a esas mismas funciones, hereda esas garantías sin
  reimplementarlas.
- **El canvas y la IA nunca pueden divergir en semántica.** No hay una "versión IA" del modelo de
  datos y una "versión manual" — son la misma función ejecutándose desde dos superficies de
  entrada (clic en el canvas vs. tool call del modelo).

## 2. Las tres capas

```
┌─────────────────────────────────────────────────────────────┐
│ 3. UI — AI Builder Panel (side panel, no popup)              │
│    Chat + "proposed changes" diff card + Confirm/Edit/Discard │
├─────────────────────────────────────────────────────────────┤
│ 2. Tool layer — apps/web/src/lib/ai/agent/automations-tools  │
│    read-tools.ts (sin mutación) + write-tools.ts (sin execute)│
├─────────────────────────────────────────────────────────────┤
│ 1. Motor existente — SIN CAMBIOS                              │
│    catalog.ts · schema-v2.ts · validate.ts · commands.ts      │
│    publish-validation.ts · registry.ts                        │
└─────────────────────────────────────────────────────────────┘
```

La capa 1 no se toca. La capa 2 es nueva pero es delgada (wrappers + Zod schemas para tool
calling). La capa 3 es UI nueva que vive al lado del canvas, no lo reemplaza.

## 3. Capa 2 en detalle — Tools del copiloto

Sigue el patrón exacto ya establecido en `lib/ai/agent/tools.ts` / `write-tools.ts`: tools de
**lectura** con `execute` (el modelo las llama libremente para reunir contexto) y tools de
**escritura** SIN `execute` (el modelo propone, la UI renderiza una card de confirmación, y solo
al confirmar el usuario se ejecuta la mutación real). Este mecanismo ya existe y ya está probado
en producción para `moveCandidateStage`, `createTask`, etc. — el AI Builder lo reutiliza, no lo
reinventa.

### 3.1 Read tools (`automations-read-tools.ts`)

| Tool | Envuelve | Propósito |
|---|---|---|
| `getWorkflowGraph` | estado actual del `EditorState` en la sesión | La IA necesita ver el grafo actual antes de proponer cambios — nunca "adivina" el estado. |
| `listBlockCatalog` | `catalog.ts` (`TRIGGER_CATALOG`, `ACTION_CATALOG`, `CONDITION_FIELD_CATALOG`) | Catálogo completo de bloques disponibles, con `available: false` ya filtrado (nunca propone una acción sin handler server-side). |
| `explainCompatibility` | `validateTriggerActionCompatibility` (`catalog.ts`) + `TRIGGER_CONTEXT`/`ACTION_CONTEXT` | Antes de proponer una acción, la IA consulta qué acciones son válidas para el trigger actual — no infiere esto del prompt, lo lee de la fuente de verdad. |
| `listWorkspaceEntities` | stages del pipeline, jobs activos, plantillas de email, miembros del equipo (las mismas fuentes que ya alimentan `ScopedSearchSelect`/`BuilderSelect` en los paneles) | Para que la IA pueda decir "muévelo a *Screening*" en vez de pedirle al usuario un `stageId` crudo. |
| `getPublishReadiness` | `graphIsPublishable` + `validateGraph` (`validate.ts`) + `publish-validation.ts` | La IA puede autoevaluar su propia propuesta antes de mostrarla — "esto todavía no puede publicarse porque falta un End step" — usando el mismo validador que corre el botón Publish. |
| `getWorkflowLimits` | `MAX_ACTIONS_PER_WORKFLOW`, límites de `definition/limits.ts` | Para que la IA no proponga un grafo de 150 nodos cuando el límite real es 100. |

### 3.2 Write tools (`automations-write-tools.ts`) — SIN `execute`, requieren confirmación

| Tool | Envuelve | Nota |
|---|---|---|
| `proposeAddNode` | `addNode` | 1 nodo por llamada; el modelo encadena llamadas para grafos multi-paso. |
| `proposeConnectNodes` | `connectNodes` / `explainConnect` | Si `explainConnect` devuelve un motivo de rechazo, el tool lo retorna como error de tool call — el modelo lo ve y puede corregir su propio plan antes de mostrárselo al usuario. |
| `proposeInsertOnEdge` | `insertOnEdge` | Para "agrega un paso de aprobación antes del envío de oferta" sobre una conexión existente. |
| `proposeDeleteNodes` | `deleteNodes` | Requiere confirmación explícita — nunca se auto-ejecuta aunque sea un "cambio simple". |
| `proposeUpdateNodeConfig` | `updateNode` | Edita el config de un nodo existente (ej. cambiar el template de email de una acción `send_email`). |
| `proposeGraphPatch` | *combinación* de las anteriores, para cambios que la IA planea como una unidad atómica ("agrega verificación de antecedentes con aprobación del manager") | Ver §4 — es la única tool "de alto nivel"; todo lo demás son primitivas 1:1 con `commands.ts`. |

Cada write tool devuelve, además de la operación propuesta, el **grafo resultante completo**
(recalculado en memoria contra el mismo `state/editor-reducer.ts`, sin persistir nada) para que la
UI pueda renderizar el diff antes de que el usuario confirme.

**Regla dura, sin excepción:** ningún write tool tiene `execute`. `publishDraft`,
`requestDraftApproval` y `approveDraft` (`definition/service.ts`) **nunca son alcanzables desde el
copiloto, ni siquiera detrás de confirmación** — publicar sigue siendo una acción 100% humana,
iniciada desde el botón existente del builder, no desde el chat. Esto es más estricto que el
patrón general de write-tools (que sí permite confirmar-y-ejecutar) porque publicar un automation
tiene efectos en producción sobre candidatos reales.

## 4. El "plan" — cómo la IA construye grafos multi-paso sin generar JSON libre

Para pedidos como *"cuando un candidato aplica, muévelo a screening y notifica al hiring manager"*,
el modelo no emite un blob de grafo — emite una **secuencia de tool calls** sobre las primitivas de
§3.2, en el orden en que las ejecutaría un humano en el canvas:

```
1. getWorkflowGraph()                              → lee estado actual (ya tiene un nodo trigger)
2. listBlockCatalog()                               → confirma que "move_stage" y "send_email" existen
3. explainCompatibility(trigger: application.created) → confirma que move_stage es compatible
4. proposeAddNode(type: action, actionType: move_stage, ...)
5. proposeConnectNodes(source: trigger, target: <nodo del paso 4>)
6. proposeAddNode(type: action, actionType: send_email, ...)
7. proposeConnectNodes(source: <paso 4>, target: <paso 6>)
8. proposeAddNode(type: end)
9. proposeConnectNodes(source: <paso 6>, target: <paso 8>)
10. getPublishReadiness()                           → autoevalúa antes de mostrar el resultado
```

La UI no muestra cada paso individual como una card separada (sería ruidoso) — agrupa toda la
secuencia entre el mensaje del usuario y la siguiente pausa del modelo en **una sola propuesta
compuesta** con un diff visual del grafo antes/después. Al usuario le llega una sola decisión:
Confirmar todo / Editar antes de aplicar / Descartar.

Esto es deliberadamente más verboso que "que la IA escriba el WorkflowGraphV2 completo en una sola
llamada" — y es la decisión correcta: cada paso pasa por las mismas validaciones de invariantes
(`explainConnect` rechazando ciclos, `addNode` respetando límites) que pasaría un click humano, así
que un fallo intermedio es recuperable y explicable ("no pude conectar el paso 6 con el 8 porque
crearía un ciclo") en vez de un error opaco de parseo de JSON al final.

## 5. UI — cómo conviven canvas y copiloto

- **Panel lateral, no modal ni overlay del canvas.** Mismo patrón que `HarlyAIProvider` /
  `AiButton` / `chat-container` que ya existen en `components/ui`. Se abre a la derecha (o
  reemplaza temporalmente el Inspector si no hay selección — ver Fase A §3), el canvas sigue
  visible y interactuable en todo momento.
- **Propuestas se renderizan como diff, no como narración.** Cuando el modelo termina una
  secuencia de tool calls, el panel muestra: qué nodos se agregan (resaltados en el canvas con el
  mismo `bg-sage-wash` que ya usamos para drop-target feedback — reutilizar el lenguaje visual, no
  inventar uno nuevo), qué conexiones se crean, y el estado de `getPublishReadiness` resultante.
- **Confirmar aplica los cambios al `EditorState` real vía `dispatch`** — exactamente el mismo
  reducer (`editor-reducer.ts`) que ya procesa los clics del canvas. Desde el punto de vista del
  historial de undo/redo (`state/history.ts`), un cambio propuesto por la IA y confirmado es
  indistinguible de un cambio manual — se puede deshacer con Cmd+Z igual que cualquier otro.
- **Editar antes de aplicar** = el usuario puede tocar el diff propuesto (mover un nodo, cambiar un
  valor de config) antes de confirmar, sin tener que rechazar todo y volver a pedirle a la IA.
- **El copiloto nunca es el único camino.** Todo lo que la IA puede proponer, el usuario puede
  hacer manualmente con drag & drop / Block Library — son dos entradas al mismo motor, ninguna es
  obligatoria (esto es lo que la Fase A protege explícitamente, ver más abajo).

## 6. Contexto y reglas que la IA recibe (tu requisito de "catálogo completo, contexto, reglas")

System prompt + tool descriptions construidos para que el modelo:

1. Conozca el catálogo completo vía `listBlockCatalog` — no una lista hardcodeada en el prompt que
   se desincroniza cuando se agrega un nuevo `ActionType`.
2. Conozca las reglas de compatibilidad trigger↔acción vía `explainCompatibility` — no las infiere,
   las consulta.
3. Conozca los límites duros (`MAX_ACTIONS_PER_WORKFLOW`, profundidad máxima de condiciones) vía
   `getWorkflowLimits` — para no proponer algo que `validateGraph` rechazará.
4. Conozca las entidades reales del workspace (stages, jobs, templates, miembros) vía
   `listWorkspaceEntities` — para resolver nombres a IDs igual que ya hace `job-resolution.ts` /
   `candidate-resolution.ts` para el agente general (mismo patrón de resolución, reutilizado).
5. Tenga en el prompt una regla explícita, no ambigua: *"Nunca puedes ejecutar publishDraft,
   requestDraftApproval o approveDraft. Publicar es una acción exclusivamente humana desde el botón
   del builder."* — reforzada estructuralmente porque esas funciones ni siquiera están expuestas
   como tools (defensa en profundidad: prompt + ausencia de la capacidad).

## 7. Por qué esto no le cierra puertas a la Fase A

La Fase A (afordancias del canvas, labels en edges, inspector con estado útil) construye
exactamente las piezas visuales que el AI Builder necesita para mostrar sus propuestas: si el
canvas ya sabe resaltar "el próximo paso sugerido" para un humano, el mismo mecanismo resalta "el
nodo que la IA quiere agregar". Si el Inspector ya tiene un estado default útil sin selección, ese
mismo panel es donde puede vivir el punto de entrada al copiloto ("¿Quieres que Harly AI te ayude a
construir esto?") sin competir por espacio con un panel nuevo. No hay retrabajo: la Fase A es
prerequisito visual de la Fase B, no un camino paralelo que haya que reconciliar después.

## 8. Fuera de alcance de esta propuesta (decisiones para cuando se implemente, no ahora)

- Si el copiloto puede **modificar** un grafo ya publicado (creando un nuevo draft) o solo trabajar
  sobre drafts nunca publicados — probablemente lo primero, pero es una decisión de producto, no
  técnica.
- Rate limiting / costo de las llamadas a `listWorkspaceEntities` para workspaces grandes.
- Si el modelo puede iniciar una automation completamente desde cero (sin trigger todavía) o
  siempre parte de un grafo con al menos el nodo trigger ya presente (`emptyCanvasGraph` en
  `schema-v2.ts` ya resuelve esto — probablemente el flujo siempre arranca desde ese estado mínimo).
- Telemetría/observability específica del AI Builder (reutilizar `agent/observability.ts` o un
  namespace propio).

Ninguna de estas decisiones afecta la arquitectura de capas de arriba — son parámetros a ajustar
dentro de ella cuando se implemente.
