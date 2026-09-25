# Harly AI × Automations Builder

## Auditoría del estado actual y especificación de integración completa

**Fecha:** 16 de septiembre de 2026  
**Worktree:** `.worktrees/automations-revamp`  
**Rama:** `feat/automations-revamp`  
**HEAD de referencia:** `e4dcae6`, más el working tree local sin commitear  
**Tipo de entrega:** revisión de los trabajos recientes, auditoría técnica de Harly AI y plan ejecutable. Este documento no afirma que la integración esté terminada.

### Documentos relacionados

- [Auditoría de frontend del 14 de septiembre](automations-frontend-audit-2026-09-14.md)
- [Auditoría de backend del 14 de septiembre](automations-backend-ai-audit-2026-09-14.md)
- [Propuesta inicial de AI Builder](automations-ai-builder-proposal.md)
- [Roadmap general de Harly AI](ai-copilot-roadmap.md)

Los tres documentos de Automations del 14 de septiembre son antecedentes. Sus fechas y contenido no fueron actualizados después de las implementaciones del 15 de septiembre. Varios hallazgos de backend ya fueron corregidos en código y la afirmación de que las tools de Automations para Harly AI no estaban implementadas dejó de ser cierta.

---

## 1. Dictamen ejecutivo

Harly ya tiene las piezas más difíciles para construir una integración profesional:

- un agente de chat real con 52 herramientas de lectura y 20 de escritura;
- proveedores configurables por workspace y claves cifradas;
- herramientas de escritura que requieren confirmación y producen recibos idempotentes;
- un motor de automatizaciones durable con versiones, leases, CAS, permisos del actor, límites operativos, circuit breaker, lineage y resultados inciertos;
- un catálogo versionado de 21 acciones con inputs ejecutables, outputs validados, targets efectivos y fixtures sintéticos tipados;
- propuestas de automatización persistidas, ligadas a workspace, actor, revisión y hash;
- simulación sin efectos y aplicación confirmada a un borrador, sin publicación automática.

La dirección arquitectónica es buena. No conviene reemplazarla por un segundo editor ni por un agente que escriba directamente en la base.

La integración, sin embargo, **todavía no está lista para el objetivo de crear, comprobar y mantener automatizaciones de cualquier complejidad**. Hoy la IA puede intentar producir un grafo completo, guardarlo como propuesta, simular una ruta limitada y aplicarlo. No dispone de todos los contratos ni de todos los recursos necesarios para hacerlo de forma confiable. Tampoco está conectada al Builder visible.

Existe además un defecto de autorización prioritario: el chat exige `collab:write`, pero las tools nuevas de Automations leen y aplican borradores sin exigir `automations:manage`. El rol integrado `hiring_manager` tiene `collab:write` y no tiene `automations:manage`. La seguridad no puede depender de que el modelo decida no llamar una tool que el servidor le entregó.

La meta correcta no es una IA “sin límites” en el sentido de saltarse permisos, validaciones o confirmaciones. La meta es que pueda **diseñar cualquier grafo soportado, resolver recursos, probar todas sus rutas, explicar sus supuestos, reparar errores y preparar la publicación**, mientras el backend conserva permisos, revisión humana, idempotencia y reconciliación de efectos inciertos.

---

## 2. Qué se revisó y qué se verificó

### Código revisado

Se siguieron los caminos de:

- configuración de modelos y proveedores;
- endpoint de chat, límites, persistencia y observabilidad;
- system prompt, conocimiento de producto, capacidades y resolución de entidades;
- todas las tools de lectura y escritura de Harly AI;
- confirmaciones, previews, recibos, replay y undo;
- catálogo de herramientas de Automations;
- preparación, simulación y aplicación de propuestas;
- permisos de roles;
- Builder, tester, editor fullscreen y contexto enviado por el panel de IA;
- tests unitarios, tests de integración condicionados y artefactos Playwright.

### Pruebas observadas en esta revisión

Comando focalizado:

```sh
HARLY_URL=http://127.0.0.1:3000 pnpm exec vitest run \
  src/features/automations/registry.test.ts \
  src/features/automations/runtime/worker.test.ts \
  src/features/automations/ai-proposals.test.ts \
  src/lib/ai/agent \
  src/app/api/ai/chat/route.test.ts \
  --reporter=dot
```

Resultado observado: **17 archivos y 75 pruebas pasaron**.

El conjunto ampliado, excluyendo integración, obtuvo **51 archivos y 361 pruebas pasadas, 9 archivos y 10 pruebas omitidas**, pero terminó con código 1 porque el `beforeAll` de `ai-proposals.test.ts` agotó su timeout de 10 segundos bajo carga paralela. La misma prueba pasó en el comando focalizado. Esto evidencia fragilidad/latencia del harness, no un fallo funcional reproducido en el diff de propuestas.

Una primera ejecución sin `HARLY_URL` hizo fallar la carga de dos suites antes de ejecutar sus tests. Repetidas con `HARLY_URL=http://127.0.0.1:3000`, pasaron.

El typecheck se inició y permaneció más de dos minutos sin emitir error ni completar; fue interrumpido. **No se considera aprobado ni fallido**.

Los artefactos Playwright disponibles no acreditan el trabajo reciente: `apps/web/test-results/e2e/.last-run.json` figura como `interrupted` y tiene fecha 12 de septiembre. El spec del Builder contiene cobertura útil, pero no existe un E2E de Harly AI creando y aplicando una automatización.

### Revisión visual

El servidor local respondió en `127.0.0.1:3000`. Chrome llegó a `/login`; no había una sesión autenticada disponible. No se introdujeron credenciales ni se alteraron datos. Por ello no se acredita en esta revisión una validación visual del workspace, del nuevo Builder ni de una conversación real con el modelo.

### Límites

No se ejecutaron los smoke tests que llaman modelos o proveedores reales. Están protegidos por variables `LIVE_*` y varios usan datos específicos del workspace. Tampoco se ejecutaron las pruebas con Postgres aislado (`AUTOMATIONS_TEST_DATABASE_URL`) ni se publicó o ejecutó una automatización real.

---

## 3. Revisión del trabajo de los dos agentes

No existe una frontera de commits que permita atribuir cada archivo con certeza a Gemini o Terra. La revisión se basa en el resultado consolidado del working tree.

### Frontend

El Builder actual sí contiene una remodelación sustancial:

- editor React Flow;
- biblioteca de bloques, búsqueda y arrastre;
- outline del flujo;
- inspector por nodo;
- validación navegable;
- historial de comandos persistente entre vistas del mismo editor;
- guardado automático, estados de guardado y resolución de conflicto CAS;
- tabs Build, Test y Runs;
- tester con fixtures, escenarios y reloj virtual;
- responsive con sheets para paneles;
- iconografía Lucide y nueva jerarquía visual.

Esto implementa gran parte de la dirección de la auditoría original. El documento frontend, sin embargo, todavía dice “no se implementó el rediseño” y conserva los hallazgos previos como si describieran el estado actual. Debe conservarse como snapshot histórico o recibir un addendum, no usarse como checklist vigente sin reproducir cada hallazgo.

No se encontró Harly AI dentro del editor fullscreen. `WorkflowBuilderRoute` renderiza únicamente `WorkflowBuilder`; el topbar de focus mode no expone el trigger global. El nuevo Builder no envía `automationContext` ni el snapshot local al panel de IA.

### Backend de Automations

El backend corrigió la mayor parte de los defectos reproducidos el 14 de septiembre:

| Hallazgo anterior | Estado actual observado |
|---|---|
| Protección externa/circuito ausente en v2 | Implementada mediante `operational-policy.ts`, reserva atómica y resultado por acción |
| Settings operativos aceptados pero no persistidos | Persistidos; relajar una política devuelve el flujo a draft/review |
| Targets de preflight y handler inconsistentes | Resolver único de target efectivo, validación de pertenencia y overrides declarados |
| Inputs dinámicos inválidos aceptados por simulator | Hook de validación del input resuelto antes del fixture |
| Fixtures genéricos rompen encadenamientos | Outputs sintéticos tipados por acción y versión |
| Reloj distinto entre simulator y worker | `local-time.ts` compartido |
| Webhook exige candidato de muestra | Corregido; webhook puede probarse en workspace vacío |
| Estado simulado no cambia después de add/remove tag | Estado virtual y acción simulada soportados |
| Variables de plantilla usan target antiguo | `effectiveTarget` centralizado |
| Diagnósticos descartados | `ActionResult` y adaptador conservan detalles seguros |
| toolVersion no se resuelve | Registry por tipo y versión; versión desconocida se rechaza |
| Lineage débil | rootRunId, profundidad y presupuesto de efectos externos añadidos |
| HTTP lee respuesta completa antes de truncar | Lectura limitada y cancelación al exceder tamaño |

La cuota de runs por minuto todavía merece una prueba de carga independiente; el código visible continúa usando un conteo y aplazamiento en dispatch. No afecta el dictamen de Harly AI, pero no debe venderse como cuota estricta sin evidencia concurrente.

### Capa nueva de Harly AI para Automations

Se implementaron:

- `listAutomationTools`;
- `searchAutomations`;
- `getAutomationContext`;
- `prepareAutomationPatch`;
- `simulateAutomationProposal`;
- `applyAutomationProposal` como write tool confirmada;
- tabla `automation_ai_proposals` con expiración, diff y CAS;
- tests del diff y tests de integración condicionados a una base aislada.

La capa es una base correcta, pero aún es un prototipo de integración server-side. Las siguientes secciones explican qué falta.

---

## 4. Cómo funciona Harly AI hoy

### Proveedores y configuración

Cada workspace configura su propia clave. Harly cifra la clave y nunca la devuelve al browser. Los providers implementados son OpenAI, Anthropic, Google Gemini, xAI y OpenRouter; se admite un base URL custom validado. El modelo se elige por workspace.

La documentación pública dice de forma más estrecha “OpenAI-compatible APIs”; debe actualizarse para coincidir con el catálogo real.

### Petición de chat

`POST /api/ai/chat`:

1. resuelve sesión y workspace;
2. exige `collab:write` y rechaza roles con scope limitado;
3. valida tamaño e historial;
4. carga configuración de IA y conocimiento del workspace;
5. construye todas las tools;
6. valida los mensajes del AI SDK;
7. aplica rate limit por workspace y usuario;
8. llama `streamText` con un máximo de 8 steps, 3.072 tokens de salida y 42 segundos;
9. registra uso, tool names, resultado y duración;
10. persiste la conversación si existe conversationId.

### Tools disponibles

Actualmente se entregan **72 tools** al modelo:

- **52 de lectura**, que ejecutan en servidor;
- **20 de escritura**, que no tienen execute en el loop del modelo y aparecen como una tarjeta de confirmación en el cliente.

Las lecturas cubren capacidades, documentación, integraciones, candidatos, postulaciones, jobs, pipeline, entrevistas, tareas, inbox, offers, templates, reportes, drafting, scoring y las cinco operaciones de propuesta de Automations.

Las escrituras cubren pipeline, rechazo, tareas, jobs, notas, tags, offers, entrevistas, pools, scorecards, email, scoring masivo, undo y aplicación de propuesta de automatización.

### Confirmación y recibos

El modelo propone una write tool. El panel llama `prepareAgentWriteAction`, muestra un preview y solo después de un click humano llama `confirmAgentWriteAction`. El servidor vuelve a validar el input, reserva un action receipt, ejecuta y registra el resultado. El mismo tool-call id reproduce el resultado y no vuelve a ejecutar la mutación. Algunas acciones soportan undo con condiciones de concurrencia.

### Propuestas de automatización

La IA envía el grafo completo a `prepareAutomationPatch`. El servidor:

- parsea el grafo y layout;
- valida estructura, compatibilidad y acciones;
- fija workspace y actor desde el contexto de la tool;
- para workflows existentes exige revision y contentHash;
- calcula un diff contra el draft verificado;
- persiste la propuesta durante 30 minutos.

La simulación usa fixtures sintéticos y no ejecuta handlers ni proveedores. La aplicación confirmada reclama la propuesta, guarda o crea un draft y nunca publica ni ejecuta acciones.

---

## 5. Hallazgos de la integración Harly AI × Automations

### AI01 · P0/P1 · Las tools de Automations no exigen `automations:manage`

El endpoint de chat exige únicamente `collab:write`. `hiring_manager` posee ese permiso pero no `automations:manage`. `getAutomationAiContext`, `prepareAutomationProposal` y `applyAutomationProposal` usan funciones internas con workspaceId, sin el boundary de autorización que sí usan las server actions del dashboard.

**Impacto:** un hiring manager o custom role no acotado puede leer grafos y aplicar borradores a través de Harly AI aunque no pueda abrir o administrar Automations mediante la UI normal.

**Corrección:** cada AI tool debe declarar permisos y el servidor debe verificarlos al ejecutarla. Lectura/modificación de Automations exige `automations:manage` hasta que exista un permiso read separado. Repetir la verificación en prepare, simulate, preview y apply; no confiar en el filtro inicial del chat. Añadir tests con hiring_manager y custom role.

### AI02 · P1 · El Builder no está conectado al panel de Harly AI

El backend acepta `automationContext`, pero `HarlyAIPanel` no lo envía. El editor fullscreen no monta el provider/trigger del asistente. `selectedNodeId` solo existe en tipos y responses.

**Impacto:** la IA no sabe qué draft está viendo el usuario ni qué nodo seleccionó. La integración dentro del editor todavía no es utilizable.

**Corrección:** montar un `AutomationAIPanel` en focus mode o adaptar el panel global con contexto del editor. Enviar workflowId, server revision/hash, selectedNodeId y un hash del snapshot local. Para cambios sin guardar, preparar la propuesta contra el snapshot local, no contra una copia vieja del servidor.

### AI03 · P1 · El catálogo no entrega los contratos de input necesarios

`listAutomationToolManifests` expone type, version, label, permiso, categoría, effect, simulation, targetFields, outputFields e integraciones. No expone el input schema, required/optional fields, enums, límites, bindings admitidos, ejemplos ni shape de output. La descripción dice que entrega “safe inputs/outputs”, pero solo entrega nombres.

**Impacto:** el modelo debe adivinar configuraciones de 21 acciones. Esto impide prometer grafos arbitrarios y aumenta ciclos de error.

**Corrección:** generar un manifest JSON seguro desde un contrato declarativo común. Incluir field descriptors, tipos, required, enum, format, límites, binding support, target semantics, output paths y ejemplos sintéticos. El Zod ejecutable permanece server-only.

### AI04 · P1 · La IA debe generar un blob completo de grafo

`prepareAutomationPatch` recibe `graph: unknown`. No existe un planner intermedio ni operaciones como addNode/connect/configure/replaceSubgraph. Para un grafo grande, el modelo debe reproducir IDs, edges, ports, bindings y layout completos en una sola llamada.

**Impacto:** errores crecen con el tamaño; una modificación pequeña puede omitir nodos; el diff llega después de haber generado todo. Los límites del chat —256 KB de request, 100 KB de historial, 3.072 output tokens— hacen imposible “cualquier complejidad” en un solo turno.

**Corrección:** introducir `AutomationPlanV1` y `AutomationPatchV1`. El plan expresa intención y rutas; el servidor compila IDs/ports/layout. Los patches son operaciones deterministas contra baseRevision/hash. Permitir subgrafos y paginación para flujos grandes.

### AI05 · P1 · La simulación global no prueba condiciones ni todas las ramas

`simulateAutomationProposal` evalúa toda condición como false. Tampoco acepta un contexto de dominio virtual rico desde la tool pública. Una simulación puede recorrer solo la rama false y dejar sin revisar la rama principal.

**Corrección:** separar:

- validación estática de todas las rutas;
- simulación por escenarios;
- branch coverage;
- dry-run con muestra real controlada desde el Builder.

La IA debe poder pedir escenarios: true/false, action failure, uncertain result, timeout, approval accepted/rejected/expired y wait matched/expired. El resultado debe indicar nodos cubiertos y no cubiertos.

### AI06 · P1 · Aplicar no exige una simulación exitosa y el preview no la conserva

La simulación se guarda en DB, pero `proposalView` no la devuelve. Apply solo exige `proposal.issues.length === 0`; no verifica que exista simulación, que corresponda al hash actual ni que haya terminado satisfactoriamente.

**Corrección:** persistir simulationHash, scenarios, coverage, status y timestamp. Definir policy: un draft puede aplicarse sin simulation si el usuario lo decide, pero la tarjeta debe decir “Not tested”; publicación asistida debe exigir el nivel de verificación configurado.

### AI07 · P1 · La tarjeta de confirmación oculta el preview canónico de Automations

`resolveAgentWritePreview` construye nombre, target, revisión y diff para `applyAutomationProposal`, pero devuelve `canonical: false`. El componente usa serverPreview solo cuando `canonical && ok`; apply tampoco está en la lista que fuerza preview canónico ni tiene un case local. El usuario puede ver una tarjeta genérica “Confirm action” en vez del diff preparado.

**Corrección:** el preview de propuesta debe ser canónico y requerido. Render dedicado con nodos añadidos/cambiados/eliminados, validación, cobertura, integraciones, permisos y estado de prueba. Prohibir confirmación mientras el preview server-side no esté disponible.

### AI08 · P2 · Issues estructurales se agregan dos veces

`prepareAutomationProposal` concatena `validateGraph(graph)` y `validateGraphForPublish(...)`; esta última ya llama `validateGraph`. Un grafo inválido puede mostrar duplicados y contadores inflados.

**Corrección:** usar una única función de validación agregada con deduplicación estable por nodeId, fieldPath, code y message.

### AI09 · P1 · No hay resolutores para todos los recursos de las 21 acciones

Las tools generales resuelven candidatos, postulaciones, jobs, stages y email templates. Faltan resolutores completos para miembros/destinatarios, document templates y documentos, webhook endpoints y schemas, workspace secret names, integraciones específicas, entrevistas/ofertas reutilizables y opciones dependientes de acción.

**Impacto:** la IA inventará IDs, eliminará opciones o producirá proposals con requisitos pendientes.

**Corrección:** `resolveAutomationResources` con tipos allowlisted, búsqueda paginada y resultados mínimos. Nunca exponer valores de secretos: solo nombres autorizados y presencia/configuración.

### AI10 · P1 · 72 tools y 8 pasos no escalan a flujos complejos

Un flujo normal puede requerir catalog → search → context → resolver varios recursos → prepare → simulate varios escenarios → proposal de apply. Ocho steps no alcanzan. Enviar 72 tools a todos los modelos incrementa tokens, confusión de selección y diferencias entre providers.

**Corrección:** tool routing por intención/capacidad y una tool gateway de Automations con suboperaciones tipadas. Presupuesto adaptativo por fase y job durable para compilación/prueba larga. No sostener una request HTTP 42 segundos para todo el proceso.

### AI11 · P1 · Apply tiene una ventana de crash y proposals `applying` sin recuperación

El servicio marca la proposal como applying, guarda el workflow y después marca applied. Si el proceso cae entre ambos pasos, el draft puede cambiar y la proposal queda bloqueada. No se encontró reconciliador de proposals applying. Los receipts generales también pueden quedar processing hasta expirar.

**Corrección:** transacción única cuando proposal y draft comparten DB, o estado con journal/recovery determinista. Guardar resultado de apply por actionId antes de responder. Añadir timeout/reconciliation para applying y processing.

### AI12 · P2 · El agente no dispone de diagnóstico y reparación de runs

Puede crear propuestas, pero no tiene tools de Automations para leer un run/step, explicar un error, reconciliar uncertain, preparar retry o construir un patch desde el fallo. Es una parte central de “verificar, probar y hacer todo”.

**Corrección:** añadir reads seguras de run/version/timeline y `prepareAutomationRepair`. Retry, reconcile y replay siguen siendo write tools confirmadas con preview específico.

### AI13 · P2 · No hay tests de orquestación de Automations con un modelo

Hay tests de servicios y tools, pero no golden conversations de Automations, ni E2E del panel, ni live smoke que cree una proposal compleja. Los tests de integración de proposals se omiten sin DB aislada.

**Corrección:** matriz determinista y live opt-in descrita en la sección 10.

### AI14 · P2 · Documentación de producto desactualizada y contradictoria

- Los informes del 14 no reflejan las correcciones del 15.
- `apps/docs/product/ai-features.mdx` dice que chat ve solo el candidato/job actual; en realidad hay tools workspace-wide.
- La misma página dice OpenAI-compatible, aunque existen cinco providers.
- El conocimiento canónico dice que Harly expone una API REST para automations, mientras `/api/v1/automations` responde 410 intencionalmente.
- **Resuelto en este worktree:** el documento histórico de propuesta ya no se presenta como
  “sin implementar”; su estado y la auditoría vigente enlazada distinguen diseño histórico de
  capacidades actualmente ejecutables.

**Corrección:** una matriz de capacidades generada o verificada contra código. La IA no debe recuperar documentación que contradice las capabilities reales.

### AI15 · P2 · Persistencia de chat y privacidad requieren una política más precisa

Se persisten parts completos, incluidos tool outputs. Una conversación global puede mencionar varios candidatos, pero solo `candidateId` principal vincula la conversación a la eliminación de un candidato. @mentions y datos retornados por tools pueden quedar sin esa relación.

**Corrección:** inventario de datos por tool, redacción antes de persistir, tabla de enlaces conversation↔entities, retención configurable y borrado por cualquier entidad referenciada. Las propuestas guardan grafos/configuración: definir retención y excluir secretos/material sensible.

### AI16 · P2 · “Stateful simulation” no significa paridad total

El Builder ya simula cambios virtuales soportados, pero el manifest marca stateful solo algunas acciones. Acciones de dominio, providers, callbacks y side effects derivados siguen usando fixtures.

**Corrección:** mostrar coverage por nodo: `validated`, `virtually executed`, `fixture assumed`, `integration unchecked`, `live verified`. La IA debe repetir esas categorías en su resumen.

---

## 6. Arquitectura objetivo

```text
User intent / selected node / run failure
                 │
                 ▼
       Automation AI Orchestrator
       ├─ permission + scope gate
       ├─ context/resource resolver
       ├─ plan compiler
       └─ proposal journal
                 │
        AutomationPlanV1 / PatchV1
                 │
                 ▼
        Canonical graph compiler
        ├─ registry contracts
        ├─ structural validation
        ├─ target/resource validation
        ├─ integration readiness
        └─ policy checks
                 │
                 ▼
         Scenario test service
        ├─ static all-path analysis
        ├─ virtual state simulation
        ├─ typed provider fixtures
        └─ optional controlled dry-run
                 │
                 ▼
         Reviewable proposal
         diff + issues + coverage
                 │ human confirmation
                 ▼
        CAS/idempotent draft apply
                 │
                 ▼
    Human review / approval / publish
                 │
                 ▼
        Durable runtime + runs
                 │
                 └─ diagnose / repair loop
```

### Principios

1. Una sola semántica: editor, API interna, simulator e IA consumen el mismo registry.
2. El modelo expresa intención; el servidor genera detalles deterministas cuando puede.
3. Toda lectura y write verifica permiso propio en backend.
4. Una proposal nunca publica ni ejecuta efectos.
5. Simulación, encolado, ejecución y entrega son estados distintos.
6. Un error o uncertain run vuelve al agente como evidencia, no como permiso para reintentar.
7. Los cambios locales del editor son primera clase y no se sobrescriben.

---

## 7. Contratos propuestos

### Manifest de tool

```ts
type AutomationToolManifestV2 = {
  type: string;
  version: number;
  title: string;
  description: string;
  category: string;
  effect: "internal_write" | "external_write";
  requiredPermissions: string[];
  integrationRequirements: string[];
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    enum?: string[];
    format?: string;
    maxLength?: number;
    supportsBinding: boolean;
    resourceType?: string;
  }>;
  outputs: Array<{ path: string; type: string; nullable: boolean }>;
  targetPolicy: unknown;
  simulation: {
    mode: "stateful" | "fixture" | "unsupported";
    scenarios: string[];
  };
  examples: unknown[];
};
```

### Plan y patch

`AutomationPlanV1` describe trigger, objetivos, pasos, ramas, waits y supuestos con IDs lógicos. El compiler crea el grafo. `AutomationPatchV1` opera sobre un grafo existente:

- addNode;
- configureNode;
- removeNode;
- connect/disconnect;
- replaceSubgraph;
- rename;
- setOperationalPolicy;
- autoLayoutSubset.

Cada operación lleva precondiciones. El servidor devuelve grafo, diff, issues y comandos equivalentes del editor. El modelo no decide posiciones pixel-perfect.

### Proposal

Añadir:

- baseGraphHash y localSnapshotHash;
- validationStatus y issue codes;
- readiness por integración/permisos/recurso;
- testScenarios y coverage;
- simulationHash/status;
- risk summary;
- apply journal y recovery state;
- expiresAt y redaction metadata.

---

## 8. Experiencia dentro del Builder

Harly AI debe abrirse desde el topbar del focus mode y como acción contextual del inspector.

### Entradas

- “Build with Harly AI” en estado vacío;
- “Explain this step”;
- “Add a fallback path”;
- “Test this branch”;
- “Fix 3 validation issues”;
- “Why did this run fail?” desde Runs.

### Contexto enviado

- workflowId;
- revisión/hash del servidor;
- snapshot/hash local;
- selectedNodeId;
- validation issues visibles;
- tab activo;
- sample/scenario seleccionado en Test.

No enviar todo el workspace ni secretos. El servidor vuelve a resolver recursos.

### Propuesta visible

La tarjeta muestra:

- objetivo en lenguaje de negocio;
- diff por nodos;
- recursos reales resueltos;
- permisos/integraciones necesarios;
- rutas probadas y no probadas;
- suposiciones;
- conflictos con cambios locales;
- botones Apply to draft, Revise y Dismiss.

Apply debe convertirse en un solo comando reversible del editor. El autosave posterior usa CAS. Si cambió el grafo local, ofrecer rebase del patch o preparar otra propuesta; nunca reemplazar silenciosamente.

---

## 9. Experiencia fuera del Builder

Desde el chat global, Harly puede:

- buscar o crear una automatización;
- resolver recursos e integraciones;
- preparar el plan;
- simular escenarios;
- aplicar un draft confirmado;
- devolver un enlace al editor;
- explicar por qué no está listo para publicar.

Desde candidato/job, el contexto ayuda a resolver entidades, pero Harly debe explicar el alcance real: una automatización afecta todos los eventos que cumplan su trigger, no solo el registro abierto.

Desde una alerta/run, Harly lee la versión histórica ejecutada y compara con el draft actual. La reparación modifica el draft; no reescribe historia.

### Publicación y ejecución

Harly puede llevar al usuario hasta una automatización lista para aprobación/publicación. En una primera versión profesional, publicar sigue siendo una confirmación separada y explícita con summary de efectos. Un “live test” que contacte proveedores es otra acción separada, limitada a un nodo/destinatario de prueba y claramente marcada. Nunca reutilizar la simulación como prueba de entrega.

---

## 10. Estrategia de pruebas

### Unitarias

- registry manifest ↔ schema ↔ output ↔ fixtures;
- compiler plan/patch → grafo;
- permisos por tool;
- diff y deduplicación de issues;
- coverage de escenarios;
- redacción de resultados;
- preview canónico obligatorio;
- recuperación de proposal applying.

### Integración con Postgres aislado

- prepare/simulate/apply/replay;
- CAS frente a edición concurrente;
- hiring_manager/custom role rechazado;
- propuesta expirada;
- crash antes/después de draft save;
- dos confirmaciones concurrentes;
- lineage/cuotas/circuito.

### Golden conversations por proveedor

Casos mínimos:

1. trigger → email → end;
2. condición con ambas ramas;
3. create_offer → send_offer;
4. request_documents → wait → signature;
5. entrevista → delay local → follow-up;
6. webhook con schema → HTTP con secret reference;
7. approval/rejected/expired;
8. modificación focal de un workflow grande;
9. ambigüedad de job/candidato/template;
10. prompt injection dentro de payload o descripción.

Validar selección de tools, no solo texto final. Ejecutar contra al menos un modelo recomendado de cada provider soportado; algunos modelos pueden manejar peor 72 tools o schemas grandes.

### Browser E2E

- abrir AI dentro del Builder;
- selected node/context correcto;
- diff canónico visible;
- cancelar no muta;
- aplicar crea una sola revisión;
- edición concurrente preservada;
- navegar al nodo con issue;
- chat global crea draft y abre editor;
- accessibility, teclado y responsive.

### Live opt-in

Solo workspace/DB de prueba. Proveedores externos usan cuentas sandbox o destinatarios de prueba explícitos. Toda limpieza debe ser determinista. No usar datos personales hard-coded como fixture normal del repositorio.

---

## 11. Plan de implementación

### Fase 0 — Bloqueo de autorización

1. Permission guard por AI tool.
2. `automations:manage` para search/context/prepare/simulate/apply.
3. Tests de roles built-in y custom.
4. Ocultar tools no autorizadas del set enviado al modelo.

**Salida:** no existe bypass respecto de la UI normal.

### Fase 1 — Contrato completo y documentación

1. Manifest V2 con inputs/outputs.
2. Resolutores de recursos.
3. Capabilities y docs sincronizadas.
4. Deduplicación de issues.

**Salida:** el agente puede diseñar cualquier combinación soportada sin adivinar IDs o schemas.

### Fase 2 — Plan compiler y patches

1. `AutomationPlanV1`.
2. `AutomationPatchV1`.
3. compiler/layout determinista.
4. subgrafos/paginación para grafos grandes.

**Salida:** complejidad no depende de que el modelo replique todo el JSON.

### Fase 3 — Verificación y coverage

1. escenarios y branch coverage;
2. readiness de recursos/integraciones;
3. simulation receipt ligada al hash;
4. policy de test requerida por publicación.

**Salida:** Harly explica exactamente qué verificó y qué asumió.

### Fase 4 — Integración del Builder

1. panel de IA en focus mode;
2. contexto local/selección;
3. tarjeta diff dedicada;
4. apply como comando reversible y rebase seguro.

**Salida:** creación, modificación y reparación dentro del editor.

### Fase 5 — Runs y recovery

1. tools de timeline/diagnóstico;
2. repair proposals;
3. retry/reconcile/replay confirmados;
4. recovery de proposals/receipts interrumpidos.

**Salida:** ciclo create → test → operate → diagnose → repair.

### Fase 6 — Evaluación y rollout

1. golden suite multi-provider;
2. E2E autenticado;
3. live sandbox;
4. métricas de éxito, correcciones, latencia y costo;
5. feature flag y rollout por workspace.

---

## 12. Criterios de aceptación finales

La integración puede declararse completa cuando:

1. ningún usuario accede a una operación de Automations por IA que no podría hacer por UI/API interna;
2. Harly puede describir todos los inputs y outputs sin inventarlos;
3. puede construir y modificar grafos grandes mediante planes/patches acotados;
4. resuelve todos los recursos requeridos o muestra una decisión pendiente;
5. valida todas las rutas y reporta coverage;
6. prueba fallos, incertidumbre, waits y aprobaciones;
7. el Builder entrega contexto local y conserva ediciones concurrentes;
8. la tarjeta muestra el diff canónico y el estado real de la prueba;
9. aplicar es idempotente y recuperable ante crash;
10. publicar y ejecutar efectos externos siguen límites humanos explícitos;
11. runs fallidos pueden explicarse y repararse sin alterar historia;
12. docs, capability registry y comportamiento coinciden;
13. unit, integración, E2E y golden suites pasan con evidencia actual;
14. la UI distingue suggested, validated, simulated, queued, executed, delivered y uncertain.

---

## 13. Prompt de traspaso para el siguiente agente

> Trabaja exclusivamente en `.worktrees/automations-revamp` y conserva todos los cambios existentes. Lee este documento, los AGENTS.md aplicables y el diff actual. Empieza por Fase 0; no conectes el panel ni amplíes efectos antes de cerrar el bypass de `automations:manage`. Reutiliza el registry, validator, simulator, CAS y receipts existentes. No añadas otra representación libre de workflows: crea `AutomationPlanV1`/`AutomationPatchV1` y un compiler determinista. Mantén la publicación y los efectos reales detrás de confirmaciones separadas. Añade tests de regresión por cada hallazgo y reporta únicamente comandos realmente observados. Usa una base local aislada para integración; no migres ni limpies la base ordinaria. No resetees, limpies ni sobrescribas cambios ajenos del worktree.
