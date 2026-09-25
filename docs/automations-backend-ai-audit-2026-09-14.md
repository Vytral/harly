# Harly Automations: auditoría funcional del backend y plan de integración con Harly AI

> **Nota del 16 de septiembre de 2026:** este informe conserva el estado observado el 14 de septiembre. El backend y la capa de propuestas de Harly AI cambiaron después de esta auditoría; varios hallazgos ya están corregidos. La revisión consolidada vigente está en [Harly AI × Automations Builder](harly-ai-automations-integration-audit-2026-09-16.md).

**Fecha:** 14 de septiembre de 2026. **Estado:** auditoría y especificación; cambios de producto pendientes.

**Checkout:** `.worktrees/automations-revamp`, rama `feat/automations-revamp`, HEAD `e4dcae6`, incluyendo los cambios locales presentes durante la revisión. El HEAD no identifica por sí solo todo el código auditado: el worktree tiene numerosos cambios previos. No se modificó la aplicación, no se publicaron automatizaciones ni se enviaron mensajes a proveedores.

**Documento relacionado:** [auditoría de frontend](automations-frontend-audit-2026-09-14.md). Este informe agrega contratos de funcionamiento, diagnóstico y capacidades de IA que deben sostener ese rediseño.

## 1. Dictamen

Harly tiene una base funcional considerable: 21 acciones registradas, un grafo v2 con controles de flujo, borradores con revisión, versiones publicadas, ejecución durable, permisos del actor, recuperación, aprobaciones y manejo explícito de efectos externos inciertos. La recomendación es consolidar esta arquitectura, no sustituirla por otro motor.

El problema principal es la **distancia entre lo que se configura, lo que el preflight acepta, lo que el tester simula y lo que el worker ejecuta**. Se encontraron configuraciones operativas que el guardado ignora, protecciones presentes en el motor antiguo pero ausentes en v2, contratos de contexto inconsistentes, diagnósticos descartados y resultados sintéticos insuficientes para encadenar herramientas.

Añadir un chat al editor antes de corregir esos contratos amplificaría el problema: la IA podría construir un flujo que parece válido y probado, pero falla al ejecutarse. El orden recomendado es: contrato de herramientas → validación y simulación coherentes → garantías operativas → integración de IA con propuestas verificables.

**Alcance de la conclusión:** revisión estática dirigida del catálogo y sus adaptadores, seguimiento de servicios relevantes y pruebas locales. No es una certificación de producción ni una prueba exhaustiva de todos los proveedores y combinaciones. Se distinguen defectos reproducidos, diferencias confirmadas en código y riesgos que requieren una reproducción de integración.

## 2. Evidencia y verificación

### Pruebas ejecutadas

Desde `apps/web`:

```sh
pnpm exec vitest run src/features/automations --exclude '**/leases.integration.test.ts' --reporter=dot
```

Resultado observado: **30 archivos pasaron, 1 omitido; 272 pruebas pasaron, 1 omitida**. La omitida corresponde a `definition/cas-conflict.test.ts`, condicionada a una base aislada. El conjunto de leases de Postgres fue excluido expresamente; ambos requieren `AUTOMATIONS_TEST_DATABASE_URL` con host local y nombre `harly_automations_verify_*`. No se utilizó la base ordinaria del usuario para pruebas mutantes.

Una segunda ejecución combinó el agente existente con cuatro probes nuevos:

```sh
pnpm exec vitest run src/features/automations/runtime/audit-probes.test.ts src/lib/ai/agent --reporter=dot
```

Resultado: **14 archivos y 50 pruebas pasaron**: 46 existentes de Harly AI y 4 probes que documentan limitaciones actuales. Que estos probes pasen significa que reprodujeron el comportamiento problemático, no que lo corrigieron.

Los probes estuvieron temporalmente en la carpeta del runtime para resolver sus imports y se retiraron al terminar. Se conservan en [evidencia reproducible](audit-evidence/automations-backend-2026-09-14/audit-probes.test.ts), junto al [log de la segunda ejecución](audit-evidence/automations-backend-2026-09-14/test-output.log). Para repetirlos, copiar el archivo al path del comando y retirarlo después; no ejecutar esa copia junto con un archivo homónimo ya existente.

No se ejecutaron build, lint, typecheck, E2E, llamadas reales a proveedores, una carrera de workers con Postgres ni una sesión real de IA contra un modelo. Los tests unitarios no sustituyen estas verificaciones.

### Mapa de fuentes

Las líneas son orientativas del estado auditado y pueden cambiar al implementar.

| Fuente | Responsabilidad |
|---|---|
| [schema.ts](../apps/web/src/features/automations/schema.ts), línea 25 | Eventos y tipos de acción |
| [registry.ts](../apps/web/src/features/automations/registry.ts), líneas 100–1816 | Contexto, esquemas y ejecución de las 21 acciones |
| [schema-v2.ts](../apps/web/src/features/automations/definition/schema-v2.ts), línea 60 | Bindings y nodos |
| [validate.ts](../apps/web/src/features/automations/definition/validate.ts), [compile.ts](../apps/web/src/features/automations/definition/compile.ts), [limits.ts](../apps/web/src/features/automations/definition/limits.ts) | Validez estructural y compilación |
| [service.ts](../apps/web/src/features/automations/definition/service.ts), líneas 279 y 624 | Borradores, revisión y publicación |
| [publish-validation.ts](../apps/web/src/features/automations/publish-validation.ts), líneas 29–195 | Compatibilidad y preflight de acciones |
| [dispatch.ts](../apps/web/src/features/automations/dispatch.ts), líneas 224, 358 y 390 | Disparo, límites y relaciones padre/hijo |
| [worker.ts](../apps/web/src/features/automations/runtime/worker.ts), líneas 134, 249 y 350 | Adaptador, condiciones y reloj real |
| [advance.ts](../apps/web/src/features/automations/runtime/advance.ts), [run-store.ts](../apps/web/src/features/automations/runtime/run-store.ts), [leases.ts](../apps/web/src/features/automations/runtime/leases.ts) | Transiciones y persistencia durable |
| [simulate.ts](../apps/web/src/features/automations/runtime/simulate.ts), línea 180; [simulation-fixtures.ts](../apps/web/src/features/automations/runtime/simulation-fixtures.ts) | Simulación y respuestas sintéticas |
| [builder-data.ts](../apps/web/src/features/automations/builder-data.ts), líneas 921–1150 | Preparación de muestra y tester |
| [actions.ts](../apps/web/src/features/automations/actions.ts), líneas 148–1040 | Operaciones de dashboard y controles de permisos |
| [webhook-ingress.ts](../apps/web/src/features/automations/webhook-ingress.ts), línea 199; [ssrf.ts](../apps/web/src/lib/ssrf.ts), línea 245 | Entrada firmada y HTTP saliente |
| [agent/index.ts](../apps/web/src/lib/ai/agent/index.ts), [write-tools.ts](../apps/web/src/lib/ai/agent/write-tools.ts), [write-actions.ts](../apps/web/src/lib/ai/agent/write-actions.ts), líneas 394 y 1263 | Herramientas, preview y confirmación de IA |
| [chat/route.ts](../apps/web/src/app/api/ai/chat/route.ts), línea 40 | Contexto de conversación y límites |
| [propuesta anterior de IA](automations-ai-builder-proposal.md) | Diseño previo; no evidencia de implementación |

## 3. Inventario funcional completo del catálogo

### Eventos y controles

El esquema declara **17 eventos**: `application.created`, `application.stage_changed`, `application.status_changed`, `application.hired`, `application.rejected`, `candidate.created`, `candidate.updated`, `interview.scheduled`, `interview.rescheduled`, `interview.completed`, `interview.canceled`, `task.completed`, `job.published`, `document.signature_sent`, `document.signature_changed`, `document.signature_voided` y `webhook.received`.

Un evento declarado no equivale a una prueba extremo a extremo de su emisor. Para cerrar el producto, cada evento necesita un fixture de su payload real y una prueba emisor → dispatch → versión → primer nodo. No hay un trigger de calendario en esta lista; los delays no son un planificador recurrente.

| Nodo | Capacidad actual | Verificación necesaria para el cierre |
|---|---|---|
| Trigger | Evento y filtro | Payload canónico por evento; discriminación entre datos anidados de webhook y contexto de dominio |
| Condition | Árbol evaluado y ramas true/false | Mismos datos efectivos en simulación y ejecución; explicar cada predicado |
| Action | Handler, bindings, política stop/continue/route_error | Inputs y outputs versionados; campos dinámicos validados tras resolverlos |
| Delay | Duración o próxima hora local | Reloj compartido; cambios de zona horaria y DST |
| Approval | Decisión humana, elegibles y expiración | Revocación de permisos, actor eliminado, resolución concurrente y reconexión |
| Wait | Espera por evento o paquete documental | Correlación exacta, evento adelantado, expiración y estados terminales |
| End | Finalización explícita | Éxito, advertencias, error e incertidumbre diferenciados en la UI |

Límites estructurales actuales: 100 nodos, 200 conexiones, 1 MiB de grafo, 100 hojas de condición y profundidad 8. La IA debe conocer esos límites y el servidor debe seguir imponiéndolos.

### Las 21 herramientas

Esta tabla registra capacidad y puntos de cierre; no implica ejecución real de cada integración durante la auditoría. Los controles de tenant y permisos encontrados son una base a preservar.

| Acción | Función/contrato observado | Punto de cierre prioritario |
|---|---|---|
| `move_stage` | Mueve la postulación del trigger; resuelve etapa dentro de su vacante | Alinear binding de applicationId con preflight; probar ciclos entre etapas |
| `set_status` | Cambia estado mediante servicios de postulaciones | Mismo problema de contexto; distinguir efectos derivados de hired/rejected |
| `add_note` | Nota de candidato, autor explícito y effectKey | Interpolación debe corresponder al candidato override |
| `add_tag` | Asociación de etiqueta con inserción idempotente | Simulación de condición posterior sobre la etiqueta añadida |
| `remove_tag` | Retira asociación de etiqueta | Estado ausente como resultado idempotente explicable |
| `request_documents` | Crea solicitudes/paquete por servicio de dominio | Fixture con packageId y requestIds; encadenamiento con wait |
| `generate_document` | Plantilla o contenido, snapshots y adjuntos; retorna documento/versionado | Contexto efectivo al sobrescribir applicationId; distinguir plantilla viva de snapshot |
| `send_document_for_signature` | Valida documento y asociación; genera enlace nativo con effectKey | Resolver requisitos de contexto de forma única; correlacionar eventos de firma |
| `schedule_interview` | Servicio de entrevistas, effectId y side effects estrictos | Fixture tipado; probar proveedor caído después de guardar entrevista |
| `reschedule_interview` | Reprogramación de entrevista explícita o del trigger | Conservación de referencias y semántica de reintento parcial |
| `cancel_interview` | Cancelación mediante servicio de dominio | Estado cancelado, repetición y fallo de notificación diferenciados |
| `create_offer` | Oferta con effectKey | Salida offerId realista y esquema disponible para el siguiente nodo |
| `send_offer` | Envía oferta existente mediante servicio | Diferenciar oferta guardada, envío encolado y entrega confirmada |
| `create_task` | Tarea con referencias y deduplicación por efecto | Validación de fecha y pruebas de coherencia entre tarea y activity event |
| `send_slack` | Integración de mensajería con tratamiento de incertidumbre | Permiso/integración visibles antes de publicación; referencia de proveedor |
| `send_telegram` | Mensajería del workspace | Clasificación precisa de fallo previo al envío frente a resultado incierto |
| `send_discord` | Integración de mensajería | Confirmación real de entrega, límites externos y recuperación |
| `send_in_app_alert` | Notificación a miembro validado del workspace, deduplicada | Destinatario efectivo y navegación de la notificación en integración |
| `send_email` | Encola email mediante outbox durable | Éxito del nodo significa encolado; evitar presentarlo como entrega |
| `send_booking_link` | Enlace Cal configurado y envío por correo | Estado de integración, URL y entrega separados |
| `http_request` | HTTP protegido por validación de destino, secretos referenciados, timeout e Idempotency-Key | Lectura acotada de respuesta, outputs JSON y clasificación de errores |

### Operaciones que rodean al editor

Hay operaciones para listar/crear/guardar, usar plantillas, inspeccionar versiones/métricas/runs, pedir y resolver revisión de publicación, publicar, pausar, reanudar, rollback y eliminar. Para runs hay cancelación, retry, replay desde paso, aprobación/reasignación y reconciliación de incertidumbre. El webhook tiene creación, activación y esquema de payload.

**La API REST pública `/api/v1/automations` está retirada:** sus rutas responden 410 intencionalmente; `status.ts` separa esto del builder habilitado. Harly AI dentro del producto debe usar servicios internos autenticados. “Fuera del editor” significa también chat global de Harly; no exige reactivar la API pública. Una API para terceros sería otro contrato y otra fase.

## 4. Hallazgos priorizados

P1: corregir antes de promocionar ejecución fiable/IA generadora. P2: corregir durante el revamp. P3: mejora posterior. No se identificó aquí un P0 confirmado. “Código” significa diferencia verificable por lectura, sin reproducción con infraestructura real.

### B01 · P1 · Protecciones operativas de v1 no aplicadas en v2 — código

`engine.ts` implementa el límite de acciones externas y actualiza fallos consecutivos/circuito. `dispatch.ts` copia esos parámetros al snapshot, pero `runtime/worker.ts:134` no incorpora el límite externo al contexto y el runtime v2 no contiene el control equivalente ni actualiza el contador de fallos de la definición al finalizar.

**Impacto:** configurar un umbral o circuit breaker no garantiza la protección esperada en v2. Un grafo válido puede repetir fallos o acumular efectos externos sin la política visible.

**Cambio:** llevar la política al control plane v2, con reserva atómica de cuota antes de cada efecto externo y actualización transaccional de resultados del circuito. Definir explícitamente qué cuenta como fallo y si la política se fija por versión o es un control operativo vigente. **Aceptación:** múltiples workers no superan la cuota; fallos consecutivos abren el circuito; un resultado incierto no se reenvía automáticamente; pruebas contra Postgres aislado.

### B02 · P1 · Guardado acepta parámetros operativos que no persiste — código

`definition/service.ts:279` parsea `Partial<WorkflowDefinitionInput>`, pero la actualización de definición solo copia name/description y campos de aprobación. `data.ts:331` delega directamente a esa función. Creación y publicación sí manejan los límites.

**Impacto:** una actualización puede responder correctamente sin cambiar maxRunsPerMinute, maxExternalActionsPerMinute o parámetros de circuito enviados. **Cambio:** decidir qué campos son editables y persistirlos o rechazarlos explícitamente; nunca aceptarlos silenciosamente. **Aceptación:** guardar, recargar y publicar conserva cada valor permitido; input no editable devuelve error de campo.

### B03 · P1 · Preflight acepta un applicationId que el handler no usa — código

`publish-validation.ts:65` permite satisfacer contexto faltante con un binding applicationId. Sin embargo, `moveStageSchema` solo admite destino y `moveStageHandler` obtiene applicationId del trigger. `set_status` presenta el mismo desacople. Un webhook con binding explícito puede superar esa comprobación y fallar con “No application in trigger payload”.

**Cambio:** resolver target de cada herramienta con un único contrato compartido. O se admite override y se valida su pertenencia, o el preflight no lo ofrece. También revisar requisitos excesivos: herramientas que pueden resolver candidato desde applicationId no deben exigir otro ID redundante. **Aceptación:** tabla trigger × herramienta × origen de target con casos permitidos y rechazados; ninguna combinación publicada depende de un campo descartado por Zod.

### B04 · P1 · Simulación acepta inputs dinámicos inválidos — reproducido

El preflight omite errores de campos dinámicos usando un placeholder (`publish-validation.ts:169`). El simulador resuelve bindings pero consume un fixture sin ejecutar el esquema real de la herramienta sobre el input resuelto. Un `send_email` con `trigger.email = 123` y fixture exitoso termina como succeeded en el probe; el worker real valida el esquema y lo rechaza.

**Cambio:** separar validación estática de validación con muestra y ejecutar esta última por nodo antes del fixture. **Aceptación:** email, UUID/referencia, fecha, enum y URL dinámicos inválidos fallan en el mismo campo que en runtime. El tester identifica “dato de muestra inválido”, no “falló el proveedor”.

### B05 · P2 · Fixtures predeterminados rompen cadenas válidas — reproducido

`simulation-fixtures.ts` devuelve `{simulated:true, actionType}` para todas las acciones. No incluye offerId, packageId o interviewId. El probe create_offer → send_offer con binding `output.offerId` termina fallido usando el preset de éxito.

**Cambio:** fixture por versión de herramienta, validado contra su outputSchema y con IDs sintéticos estables. **Aceptación:** crear→enviar oferta, solicitar documentos→esperar paquete y programar→reprogramar entrevista se simulan sin editar JSON. No presentar esos IDs como recursos reales.

### B06 · P2 · Relojes distintos para próxima hora local — reproducido

`simulate.ts:180` calcula minutos y suma al instante actual, conservando segundos. A las 09:00:30 UTC, esperar a 09:01 produce 09:01:30. `worker.ts:350` resuelve la hora de pared con segundos cero y lógica para saltos de horario. El cálculo por bloques de 24 horas de la simulación tampoco comparte esa semántica.

**Cambio:** extraer cálculo puro de deadline compartido, con reloj inyectado. **Aceptación:** igualdad de deadline con segundos/milisegundos, cambio de día y transiciones de zona horaria; mostrar zona e instante resultante al usuario.

### B07 · P2 · Tester obliga a tener candidato incluso para webhook — código

`builder-data.ts:996` resuelve candidato antes de discriminar el trigger. Si no hay candidato, devuelve “Create a candidate first”, aunque el flujo solo procese un webhook y llame HTTP.

**Cambio:** provider de muestras por tipo de evento; pedir entidades solo si el grafo las necesita. **Aceptación:** workspace sin candidatos puede probar webhook→HTTP con payload sintético; un flujo que sí requiere candidato muestra el requisito en el nodo correspondiente.

### B08 · P1 · Contexto del tester no sigue necesariamente al evento ni a sus efectos — código

El tester carga condiciones con sample.applicationId/candidateId/jobId incluso en webhook; el worker deriva contexto del trigger. Además el tester carga ese contexto una sola vez: un fixture de add_tag no actualiza el estado que leerá una condición posterior, mientras el worker consulta el dominio durante la ejecución.

**Cambio:** definir simulación con estado virtual mínimo por entidad para acciones soportadas. Si una acción no puede simular sus efectos sobre condiciones posteriores, declarar cobertura parcial y pedir fixture/contexto explícito. **Aceptación:** mismo evento y estado inicial producen la misma rama para añadir etiqueta→condición; webhook no toma silenciosamente un candidato ajeno al payload.

### B09 · P1 · Override de destinatario y variables de plantilla divergen — código

`registry.ts:550` elige `input.candidateId` para add_note pero llama `loadTemplateValues(ctx, target)` con el candidato original del trigger. Generate document hace algo equivalente con applicationId (`:880`).

**Impacto:** contenido interpolado con nombres/datos del origen puede guardarse en otra entidad del mismo workspace. No es un hallazgo de cruce de tenants; es un error de identidad funcional. **Cambio:** resolver primero target efectivo y cargar todas las variables desde él. **Aceptación:** trigger del candidato A con override B genera contenido y asociaciones de B; prohibir combinaciones incoherentes de candidato/postulación/vacante.

### B10 · P2 · Se descartan detalles útiles de errores — código

El adaptador `worker.ts:134` conserva code/retryable, pero pierde `result.error` y los detalles de safeParse. Muchos errores terminan como ACTION_FAILED o INVALID_ACTION_INPUT. providerRef solo se extrae de `data.id`, aunque distintas herramientas retornan claves específicas.

**Cambio:** resultado tipado con code, mensaje seguro, nodeId, fieldPath, categoría, retryAdvice y providerRef explícito. Redactar secretos y datos sensibles antes de persistir. **Aceptación:** usuario e IA pueden distinguir permiso revocado, referencia inexistente, campo inválido y resultado incierto; el error abre el campo afectado y no depende de interpretar logs internos.

### B11 · P2 · toolVersion es un número sin resolución de versión — reproducido parcialmente

`actionNodeSchema` acepta cualquier entero positivo (probe: 999). El adaptador busca por actionType y no resuelve toolVersion. El grafo versionado por sí solo no congela la semántica del handler.

**Cambio:** catálogo indexado por `(actionType, toolVersion)`, rechazo de versiones desconocidas y migración explícita de borradores. **Aceptación:** versión desconocida bloquea publicación y ejecución con error preciso; una versión publicada conserva el contrato de sus acciones tras actualizar el catálogo.

### B12 · P1 · Anti-loop basado en hijos no demuestra ausencia de ciclos — riesgo fundamentado, reproducción pendiente

`dispatch.ts:390` busca un run del mismo workflow/evento con el mismo parentRunId inmediato. Esto evita ciertos hijos repetidos; no recorre ancestros. Cada nuevo run puede producir un nuevo padre. Los servicios de postulaciones propagan automationParentRunId.

**Escenario que debe probarse:** workflow A mueve a etapa B; otro workflow devuelve a A; cada evento tiene un run padre diferente. No se ejecutó este ciclo sobre una base real y no se afirma un incidente observado.

**Cambio:** rootRunId, profundidad máxima y presupuesto de efectos de la cadena; política explícita de reentrada por workflow y entidad. **Aceptación:** test A→B→A termina de forma explicable sin depender de la velocidad del worker ni de “el registro ya estaba en esa etapa”. Permitir cadenas legítimas acotadas.

### B13 · P2 · Límite de runs es un aplazamiento, no una cuota estricta — código, carga pendiente

`dispatch.ts:358` cuenta starts recientes y difiere 15 segundos al superar el umbral. Consulta y creación no reservan un cupo atómicamente. El runtime v2 no revalida esa cuota al ejecutar la acción. Varias entradas pueden ver el mismo conteo o liberar trabajo acumulado juntas.

**Cambio:** reserva por ventana/token con próxima fecha disponible y política documentada. **Aceptación:** carga concurrente demuestra el límite; los diferidos no convergen en una ráfaga fuera de cuota. No llamar “máximo por minuto” a una heurística si se mantiene como tal.

### B14 · P2 · HTTP limita lo guardado, pero no lo leído — código

`registry.ts:1769` hace `await response.text()` y después `.slice(0,500)`. `safeFetchWebhook` entrega un stream sin tope de cuerpo. El timeout limita tiempo, no bytes recibidos dentro de ese tiempo.

**Cambio:** leer hasta un máximo de bytes, cancelar stream al excederlo y producir RESPONSE_TOO_LARGE. Separar preview truncado de output tipado. **Aceptación:** una respuesta grande no se carga completa; JSON declarado se parsea con límite y puede alimentar bindings de campos. Preservar validación SSRF, DNS fijado y restricciones de redirección existentes.

## 5. Garantías que sí deben conservarse

- Borradores separados de versiones y actualización con comparación de revisión: hay protección CAS en código, aunque su prueba con dos conexiones quedó sin ejecutar aquí.
- Validación estructural central y límites del grafo. La IA no debe saltarlos ni crear un segundo compilador.
- Worker durable con leases y persistencia de outcomes; no convertirlo en una cadena de promesas ligada al request del chat.
- Revalidación del permiso del actor antes de ejecutar un handler. Tener permiso para configurar automatizaciones no sustituye el permiso de dominio requerido por cada acción.
- effectKey/outbox y servicios de dominio reutilizados. Es incorrecto afirmar que todas las acciones carecen de idempotencia.
- Estado uncertain explícito y operaciones de reconciliación: un timeout después de I/O no prueba que el proveedor no recibió el efecto.
- Webhook con endpoint de workspace, token/firma HMAC, comprobación temporal y contrato de payload. No confundirlo con una URL pública sin autenticación.
- HTTP con validación de destino, DNS fijado y redirecciones restringidas. La lectura de cuerpo sin límite es un problema distinto de esas protecciones.

No se eleva a defecto confirmado una posible duplicación por cualquier throw: varios handlers normalizan resultados inciertos y otros usan claves de efecto. La verificación final debe hacerse por proveedor y punto de fallo.

## 6. Contrato único de herramientas propuesto

Cada herramienta debe publicar metadatos consumibles por editor, preflight, tester y Harly AI:

```ts
type AutomationToolDescriptor = {
  type: string;
  version: number;
  title: string;
  description: string;
  category: string;
  icon: string; // identificador del sistema visual existente
  inputSchema: unknown;
  outputSchema: unknown;
  requiredPermissions: string[];
  integrationRequirements: string[];
  targetPolicy: unknown;
  effect: 'read' | 'internal_write' | 'external_write';
  supportsIdempotency: boolean;
  simulation: 'stateful' | 'fixture' | 'unsupported';
};
```

Este tipo es una especificación, no código implementado. No serializar funciones Zod ni secretos al navegador/modelo: generar una representación apta para validación/presentación y mantener el ejecutor en servidor.

El contrato debe incluir ejemplos sintéticos válidos, campos que permiten bindings, campos de salida enlazables y dependencias de contexto. IDs se seleccionan mediante búsqueda de recursos autorizados, no se inventan. Outputs de pasos previos solo pueden usarse si están disponibles en esa ruta del grafo.

Separar cuatro resultados visibles: **estructura válida**, **configuración lista**, **simulación completada**, **ejecución real confirmada**. Que un correo esté en la outbox es evidencia de encolado; la entrega necesita estado del subsistema de correo. Ningún resumen de IA debe convertir uno en otro.

## 7. Harly AI: estado actual y arquitectura objetivo

### Lo que existe

`buildHarlyTools` combina lecturas y herramientas de escritura. Las escrituras declaradas sin execute se presentan para confirmación; `prepareAgentWriteAction` prepara preview y `confirmAgentWriteAction` ejecuta el handler. Hay recibos, replay y soporte de undo para operaciones reversibles. Las pruebas existentes del agente cubren parte de estos contratos.

No se encontró un catálogo implementado de herramientas de automatización en ese agente. La request del chat admite surfaceContext de candidate/section, pero no workflowId, draftRevision ni selectedNodeId. Mencionar “Automations” en el prompt no aporta el borrador real.

### Correcciones a la propuesta anterior

Reutilizar comandos del editor es una buena base de consistencia, pero no hace “imposible” crear grafos inválidos: configuraciones requeridas, compatibilidad de contextos y límites siguen necesitando validación. Tampoco una herramienta sin execute devuelve por sí sola el grafo calculado al modelo. Hace falta una fase de preparación ejecutable que produzca resultado verificable antes de confirmar la mutación.

Se propone un parche atómico por intención, no obligar al usuario a confirmar cada nodo y conexión por separado. El chat global debe resolver una automatización explícita; no depender de un estado React montado dentro del editor.

### Flujo común

1. Resolver intención y recurso. Preguntar solo por ambigüedades sustanciales: dos vacantes iguales, destinatario indefinido o una decisión de negocio faltante.
2. Leer catálogo autorizado, grafo/revisión, requisitos de integraciones y contexto de recursos mínimo.
3. Preparar un plan/patch en servidor o sandbox puro; validar estructura, bindings y targets. Devolver diff, issues y supuestos.
4. Simular el grafo preparado con muestra sintética o seleccionada y fixtures tipados. La simulación no envía correos ni crea entrevistas reales.
5. Mostrar propuesta: qué cambia, a quién afecta, requisitos pendientes, resultado y cobertura de la prueba.
6. Aplicar el parche confirmado con expectedRevision/contentHash y receipt idempotente. Si cambió el borrador, informar conflicto y preparar otro diff.
7. Mantener publicación como acción humana explícita en la primera versión propuesta. Una prueba con efectos reales requeriría una operación separada con alcance visible; no es parte de simulate.

### Herramientas propuestas

| Tool | Input principal | Output y comportamiento |
|---|---|---|
| `listAutomationTools` | filtros de categoría/intención | Catálogo permitido y versiones; sin credenciales |
| `searchAutomations` | query, estado, cursor | IDs, nombres, revisión y resumen acotado |
| `getAutomationContext` | workflowId, selección opcional | Grafo, revision/hash, versión activa, issues y capacidades; verificar workspace en servidor |
| `resolveAutomationResources` | tipo, query, filtros | IDs autorizados de vacantes, etapas, plantillas, miembros; ambigüedad explícita |
| `prepareAutomationPatch` | workflowId opcional, expectedRevision, operaciones, supuestos | proposalId, grafo propuesto, diff, validaciones y requisitos; no guardar/publicar |
| `simulateAutomationProposal` | proposalId, sampleRef o payload sintético, escenario | trace, resolved inputs redactados, outputs ficticios tipados, cobertura y issues |
| `applyAutomationProposal` | proposalId, actionId | Nueva revisión tras confirmación y CAS; recibo replayable |
| `getAutomationRun` | workflowId, runId | Versión ejecutada, timeline, error seguro y opciones disponibles |
| `prepareAutomationRepair` | workflowId, runId, expectedRevision | Propuesta de corrección; no reintentar automáticamente un efecto incierto |

No aceptar workspaceId o actorId elegidos por el modelo como autoridad. proposalId debe estar ligado al workspace/actor, tener caducidad y fijar hash/baseRevision. En el primer MVP puede guardarse en almacenamiento temporal del servidor; si debe sobrevivir a reconexiones o múltiples procesos, requiere persistencia explícita.

### Dentro del editor

Panel “Harly AI” coherente con el inspector y el tester del informe de frontend. Acciones contextuales: “Explica este paso”, “Añade una condición”, “Prueba esta rama”, “Corrige este error”. Incluir selección y **revisión del grafo visible**, también cuando existen cambios sin guardar.

Para cambios locales no guardados, enviar snapshot acotado con hash y validarlo en servidor. Al aplicar, verificar que el grafo visible conserva ese hash; incorporar el cambio como un solo comando reversible. Guardado persistente mantiene su propio CAS. No sobrescribir una edición manual realizada mientras la IA responde.

Cada respuesta accionable incluye tarjeta con resumen, nodos añadidos/modificados/eliminados, advertencias y “Aplicar al borrador”. Click en issue selecciona nodo/campo. Mostrar progreso por fases y permitir cancelar la propuesta; no prometer cancelación de efectos reales ya enviados.

### Fuera del editor

En el chat global: “Crea una automatización cuando un candidato pase a entrevista…” resuelve vacante, etapa, destinatarios y plantilla; prepara una propuesta; permite simular y crear el borrador confirmado. Retorna enlace directo al editor y revisión creada. Si el usuario pide modificar una existente, mostrar cuál antes de aplicar.

Desde candidato o vacante: ese recurso aporta contexto, no autoriza asumir que la automatización solo afectará a esa persona. Expresar alcance: “Todas las postulaciones de esta vacante que entren a esta etapa”. Desde un run fallido: diagnosticar la versión histórica y preparar corrección en el borrador vigente, sin confundir ambos.

### Límites de la IA

El chat actual tiene límites de duración, mensajes, tamaño, salida y rate limit. No elevarlos sin medir. Preferir herramientas que retornan resúmenes y subgrafos pertinentes; un grafo de 100 nodos no debería repetirse entero en cada mensaje.

Presupuesto propuesto para MVP: máximo tres ciclos preparar→validar→corregir por petición, con salida explicando lo pendiente si se agota. Es una decisión de producto propuesta, no un límite actual. No enviar secretos ni documentos completos para “dar contexto”; usar referencias, campos mínimos y payloads sintéticos por defecto. Texto de candidatos, webhooks y plantillas se trata como datos, nunca como instrucciones de herramientas.

## 8. Plan de implementación delegable

Cada paquete es una unidad revisable; no abrir todos simultáneamente sobre registry.ts. El agente implementador debe volver a comprobar el diff del worktree antes de editar.

| Paquete | Trabajo | Dependencia y aceptación |
|---|---|---|
| F01 · Contratos | Catálogo versionado, target resolver, input/output y errores tipados; B03, B09–B11 | Base para UI/IA. Pruebas por herramienta de input, target y output; versión desconocida rechazada |
| F02 · Configuración | Persistencia de settings y política de revisión; B02 | Guardar/recargar/publicar sin pérdida silenciosa; definir si modificar control operativo exige revisión |
| F03 · Ejecución | Cuotas atómicas, circuito y lineage; B01, B12, B13 | Postgres aislado, concurrencia y ciclos. No declarar cerrado con mocks |
| F04 · Tester | Validación dinámica, fixtures tipados, providers de muestras, estado virtual y reloj compartido; B04–B08 | Pruebas de paridad y cobertura visible, sin efectos externos |
| F05 · HTTP y diagnóstico | Lectura acotada, outputs JSON, clasificación antes/después de I/O; B10, B14 | Respuestas grandes/stream fallido/429/5xx y secretos redactados |
| F06 · IA base | Contexto workflow, tools de lectura, proposals, prepare/simulate/apply, receipts obligatorios | F01/F04. Conflicto CAS, proposal ajena/expirada y replay de actionId verificados |
| F07 · IA en producto | Panel del editor, chat global, selección, tarjetas diff y navegación a issues | F06 + jerarquía del informe frontend. Edición manual concurrente preservada |
| F08 · Cierre | Matriz de proveedores, E2E de reclutador y observabilidad | Todos. Evidencia de escenarios críticos y límites documentados |

### Escenarios obligatorios para aceptar el revamp

1. Reclutador crea con lenguaje natural un flujo de etapa → email → tarea; resuelve IDs, prueba y guarda borrador sin emitir efectos reales.
2. Create offer → send offer y request documents → wait enlazan outputs sin escribir JSON manualmente.
3. Campo dinámico inválido produce el mismo issue en tester y worker.
4. Acción dirigida a candidato B desde evento A usa datos de B en contenido y asociación.
5. Usuario modifica el borrador mientras IA prepara; aplicar no pierde sus cambios.
6. Dos confirmaciones del mismo proposal producen una sola mutación; nueva revisión invalida una propuesta vieja.
7. Actor pierde permiso entre publicación y ejecución: run falla con explicación específica; IA no lo elude.
8. Proveedor recibe solicitud pero se pierde respuesta: run uncertain; no retry automático ni resumen falso de entrega.
9. Dos workers compiten por run/effect; no duplican el efecto cubierto por idempotencia. Probar con base y adaptador instrumentado.
10. Cancelación durante wait, aprobación duplicada, expiración y evento recibido antes del wait conservan resultado coherente.
11. Cadena A→B→A termina por política de lineage; cuota externa y circuito funcionan en v2.
12. Hora local próxima coincide entre simulator/worker incluso en borde de día y DST.
13. Chat global abre el borrador correcto; run histórico se explica usando su versión real.
14. Workspace vacío puede probar webhook→HTTP; no necesita crear candidato ficticio.

## 9. Observabilidad y definición de terminado

Registrar por proposal/run: workspace y actor autorizados, workflow/version/revision/hash, nodeId, toolVersion, effectKey, intento, categoría de resultado y tiempos de espera/ejecución. Guardar referencias de proveedor sin secretos. Para IA: herramientas usadas, validaciones fallidas, conflictos de revisión, latencia y tokens; no registrar conversaciones completas como sustituto del tracing.

Medir porcentaje de propuestas aplicadas sin corrección manual, errores detectados antes de publicar, divergencias tester/runtime, runs inciertos y tiempo para resolverlos. Definir objetivos después de medir una línea base, sin inventar cifras actuales.

El trabajo queda terminado cuando el frontend puede explicar los estados del backend con datos reales; todas las herramientas tienen contrato de input/output/target/versión; las pruebas críticas de integración pasan; Harly AI prepara cambios revisables dentro y fuera del editor; y la UI distingue simulación, encolado, ejecución y entrega. El resultado buscado es que un reclutador entienda qué va a pasar, pueda comprobarlo y sepa cómo corregirlo.

## 10. Instrucción inicial para el agente implementador

> Trabaja exclusivamente en `.worktrees/automations-revamp`. Lee este informe y el de frontend, inspecciona AGENTS.md y el diff actual, y conserva cambios previos. Implementa por paquetes, empezando por F01 y F02; no reescribas el motor durable. Usa los defectos reproducidos como tests de regresión con expectativas corregidas. No reactives la API pública ni añadas publicación automática por IA como efecto colateral. Mantén permisos, CAS, effectKey y estados uncertain. Reporta cambios, pruebas realmente ejecutadas y escenarios aún sin verificar. Antes de F06, confirma paridad del tester y los contratos de herramientas; no consideres “simulado con éxito” evidencia de entrega real.
