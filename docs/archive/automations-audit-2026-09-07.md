# Auditoría de automatizaciones — 7 septiembre 2026

> Este documento es una fotografía histórica de la auditoría inicial. Las afirmaciones de “pendiente” de esta sección no invalidan las correcciones posteriores; el estado vigente está en la actualización final de este archivo y en `docs/automations-product-plan.md`.

> Actualización vigente 2026-09-11: el guard de compatibilidad con el runner
> lineal fue retirado del publicador. Los grafos nuevos se validan y publican
> únicamente contra el contrato v2; el runner lineal queda sólo para lectura y
> soporte de históricos v1. No se exige migrar runs v1 para estrenar v2.

## Dictamen

El trabajo existente aporta un editor de grafos, borradores/versiones y validación estructural. **No es todavía el motor empresarial definido en automations-product-plan.md.** El problema principal no es el estilo: la representación visual y la ejecución no tienen las mismas capacidades.

Revisión sobre `feat/automations-revamp`, base `e4dcae6`, incluyendo los cambios sin commit recibidos. Se conservaron los cambios preexistentes. Las rutas siguientes son relativas al repositorio.

## Hallazgos prioritarios

### P1 — Publicación pierde semántica del grafo

Evidencia: `apps/web/src/features/automations/definition/service.ts`, `publishDraft`, compila el grafo pero utiliza `graphToLegacy` para rellenar trigger/conditions/actions. `definition/legacy-adapter.ts` recorre `next`, `true` y `success`, sustituye condiciones previas y descarta bindings no literales. `engine.ts` sigue ejecutando acciones lineales; no consume `CompiledPlan`.

Impacto: un flujo puede verse correcto pero no respetar esperas, aprobaciones, ramas falsas con acciones, condiciones intermedias, rutas de error o referencias a resultados.

Mitigación histórica: `definition/runtime-compatibility.ts` comprobaba la compatibilidad del grafo antes de publicar. Rechazaba bloques durables, bindings dinámicos, rutas de error, condiciones que no fueran la única condición inicial con salida falsa a End/stopped, y finales stopped incompatibles. Los borradores seguían permitidos. Esta capa fue retirada el 2026-09-11 cuando el publicador pasó a consumir el contrato graph-native; el panel de validación actual muestra sólo errores estructurales/configurables del v2.

Esto NO implementa el ejecutor v2 ni subsana versiones incompatibles publicadas anteriormente. Antes de activar v2: auditar versiones existentes, elegir política de migración explícita, ejecutar P06–P12 del plan y añadir pruebas de integración de publicación/ejecución. Retirar el guard sólo cuando el dispatcher consuma versiones compiladas sin adaptación con pérdida.

### P1 — Atajos duplican operaciones

Evidencia: `builder/canvas/EditorWorkspace.tsx` registraba el mismo manejador para keydown y keyup, ejecutando undo/redo/duplicate/delete en ambos eventos.

Corregido: las operaciones se ejecutan sólo en keydown, sin repetición automática; los controles de formulario, menús y diálogos quedan excluidos. Se agregaron botones visibles Undo, Redo, Duplicate y Delete. React Flow ya no administra Delete en paralelo.

### P1 — Selector de datos no se abre desde literal

Evidencia: `builder/inspector/BindingPicker.tsx`: Use data sólo cambiaba open, pero el menú únicamente se renderizaba cuando usingData ya era true.

Corregido: Popover + Command de Harly, búsqueda, grupos, opciones deshabilitadas y cierre por selección/Escape. El usuario puede abrirlo desde un literal; se advierte la limitación del runtime.

### P2 — Buscadores remotos inconsistentes

Evidencia: `inspector/ScopedSearchSelect.tsx` no descartaba respuestas fuera de orden, no capturaba errores y construía IDs repetidos por tipo. Al cerrar una búsqueda podía perder la etiqueta seleccionada.

Corregido: invalidación de solicitudes en cleanup, limpieza al cambiar consulta/ámbito, estado de carga/error, useId, conservación de la selección remota durante la vida del componente, fallback visible al ID y señal de selección. No se publican secretos en errores.

Pendiente: hidratación por ID después de recargar cuando el elemento está fuera del lote inicial; paginación/cargar más, deduplicación en resultados y pruebas de componente de carreras de red. El backend devuelve nextCursor pero el selector todavía no lo consume.

### P2 — Configuración de etapas y aprobadores

Corregido en `inspector/NodeInspector.tsx`: la acción que espera un nombre de etapa conserva la etiqueta y no guarda un UUID remoto como nombre; el filtro de etapa asociado a job conserva el ID remoto; se evita añadir dos veces al mismo aprobador.

Pendiente: uniformar contratos de etapa por ID, filtros de trigger específicos por evento, selección múltiple con nombres hidratados y mensajes claros para miembros eliminados.

### P2 — Distribución y navegación del editor

Corregido:

- Biblioteca e índice separados, con contador de pasos; descripciones visibles sin truncado y categorías con cantidad.
- Los bloques agregados con click dejan de apilarse con separaciones de 28 px.
- Arrastre con posiciones locales visibles y una actualización del historial al soltar.
- El nodo enfocado no recentra el canvas con cada movimiento del layout.
- Zoom inicial/Fit limitado al 100 %, atajos de zoom para Control y Meta, tema del canvas alineado con Harly.
- Controles con nombres accesibles, mayor área de interacción y menú View para puntos/minimapa/bloqueo. Arrange respeta el bloqueo.
- Auto-layout captura errores y no aplica un resultado a un grafo cambiado mientras calculaba.
- Dropdowns del inspector usan Select de Harly en lugar de select nativo; los de prioridad/plazo tienen nombre accesible.
- Salidas se pueden desconectar desde el inspector seleccionando Not connected.
- Seleccionar un nodo en móvil permite abrir el inspector; se verificó también la navegación mediante Steps.
- Preferencias se cargan después de hidratar y fallos de almacenamiento no rompen el editor.
- Barra superior del editor puede ocupar dos filas en pantallas estrechas, sin modificar el layout predeterminado de otros editores.

Pendiente: reemplazar conexiones en una operación (actualmente desconectar/conectar), selector de bloque al insertar sobre una arista (todavía inserta add_note), navegación de nodos totalmente accesible por teclado y pruebas de drag/conexiones multiselección. Revisar unidades de espera, zonas horarias y accesibilidad del resto de campos especializados.

### P2 — Test no significa simulación completa

Evidencia: `WorkflowBuilder.tsx` / TestView monta DryRunPanel con trigger y conditions; no ejecuta ni simula el grafo completo.

Corregido el texto: Test trigger and filters, con advertencia explícita de que no verifica acciones/ramas/esperas/aprobaciones. Pendiente implementar P09: snapshots de prueba, reloj virtual, aprobaciones simuladas, trazas por nodo, acciones externas mock y comparación de rutas esperadas.

## Brechas de producto que no se deben maquillar

1. Ejecutor durable versionado con lease, checkpoints y reanudación segura.
2. Wait/delay/approval reales, plazos, expiración, autorización al resolver y prevención de duplicados.
3. Documentos/firmas/portal, recepción del evento de firma y continuidad del flujo.
4. Reuniones e integraciones: contratos, credenciales, permisos, límites y política de reintento por herramienta.
5. Catálogo único compartido por biblioteca, inspector, compilador y ejecutor. No inferir disponibilidad por tener un formulario.
6. Formularios completos: key/value de headers no puede persistir una cadena cuando el handler necesita un objeto; bindings tipados, variables por contexto, validación del schema real antes de publicar.
7. Publicación/pausa/aprobación accesibles en tamaños pequeños: existen acciones ocultas por `lg:inline` que requieren menú responsive.
8. Validación E2E de borradores, concurrencia, conflictos, versiones, publicación y rollback contra una base aislada. No basta el número de unit tests.

## Verificación realizada

- Baseline: 179 tests de automatizaciones pasaban antes de las correcciones.
- Después: 186 tests, 20 archivos, incluyendo 7 nuevos casos de compatibilidad del runtime.
- Navegador autenticado: listado → nuevo editor → añadir tarea → prioridad High → abrir buscador de bindings → selector de responsable. Sin publicar ni ejecutar automatizaciones.
- Responsive: comprobación a 1440 px y 390 px; en móvil Steps abre Configure step con controles accesibles. Se detectó el solapamiento de cabecera y se corrigió la distribución.
- Typecheck del workspace pasó después de regenerar los tipos de rutas. Había archivos de tipos generados inconsistentes en `.next/dev/types`; se conservaron fuera del proyecto en `/tmp/harly-automations-dev-types-20260907-2038` y se ejecutó `next typegen`.
- No se verificaron aún publicaciones reales, entrega de emails, webhooks, firmas, reinicios de workers o concurrencia. No se afirma que estas capacidades funcionen.

## Incidente de acceso durante la revisión

El worktree enlaza el mismo `.env.local` del repo principal; ambos usan PostgreSQL local `localhost:5432/harly`. Colima estaba apagado y la conexión devolvía ECONNREFUSED. Se inició la instancia existente, PostgreSQL recuperó estado healthy y el login autorizado funcionó. No se cambiaron credenciales, no se ejecutaron seeds ni migraciones y no se modificaron registros para permitir acceso.

## Orden recomendado de continuación

1. Cerrar pruebas de componentes del editor y formularios especializados, no ampliar el catálogo superficialmente.
2. Implementar ejecutor v2 y pruebas de equivalencia para recetas lineales existentes.
3. Añadir durabilidad y aprobaciones con integración de extremo a extremo.
4. Construir simulación fiel sobre el mismo contrato de ejecución.
5. Incorporar documentos/portal/reuniones e integraciones sólo con contratos y permisos verificables.
6. Migración gradual, observabilidad y pruebas de fallo antes de declarar disponibilidad empresarial.

El plan maestro sigue siendo `docs/automations-product-plan.md`. Este informe diferencia correcciones concretas de capacidades todavía no implementadas.

## Actualización de auditoría — 2026-09-09

> Nota de vigencia: el bloque original de esta actualización quedó escrito antes de conectar todas las acciones y el simulador. La siguiente matriz es la fuente de verdad actual para no dar instrucciones contradictorias a otra persona o agente.

Se cerró el primer corte de las tres brechas prioritarias:

- dispatch de eventos y scheduler distinguen `engineVersion` y envían runs v2 a `runtime/worker.ts`;
- el worker usa el registry real mediante adaptador productivo, con validación, actor/permisos, `effectKey` e input congelado;
- leases con fence, heartbeat abortable, retry acotado y reconciliación conservadora de intentos abandonados quedaron cubiertos por 12 pruebas Postgres aisladas.

Además, el worker ya persiste y libera waits de duración, hora local IANA, aprobación y evento; los resolvers reclaman con fence, validan workspace/miembro/elegibilidad y continúan el run desde PostgreSQL. La suite aislada pasó 14/14 e incluye delay vencido y wake-up por evento.

Esto no cambia el veredicto global: Automations todavía no es un motor empresarial terminado. Documentos/firmas, reconciliación por proveedor, bandeja/UI de aprobaciones, scheduler operativo con métricas y E2E siguen pendientes. La evidencia nueva demuestra durabilidad del runtime y del wake-up, no entrega `exactly once` para proveedores externos.

## Estado vigente de auditoría — 2026-09-09

### Confirmado en código y pruebas

- El dispatcher productivo separa eventos durables, creación de runs y ejecución: los runs publicados con `engineVersion = 2` entran a `runtime/worker.ts`; los históricos v1 permanecen en `engine.ts`.
- El worker v2 usa la versión de grafo publicada, reserva nodos e intentos bajo lease/fence, conserva `inputSnapshot` y `effectKey`, renueva heartbeat, aborta I/O al perder lease y no persiste resultados tardíos. Una cancelación solicitada durante trabajo activo invalida el lease normal y puede ser recogida por un worker sucesor con lease sólo de cancelación; ese camino finaliza sin volver a invocar acciones.
- Los errores retryable programan el siguiente intento con backoff persistido; los efectos ambiguos terminan en `uncertain` y requieren reconciliación explícita.
- Delays, hora local, aprobaciones, waits de evento y waits documentales liberan el worker y reanudan desde PostgreSQL. Upload/revisión de portal y firma terminal llaman al resolver después del commit.
- Un cron documental expira paquetes pendientes cuyo `dueAt` pasó, registra actividad/notificación y despierta los waits por `packageId`; el deadline ya no depende sólo de que un worker vuelva a pasar por el run.
- Las acciones reales del registry incluyen pipeline, notas/tags, tareas, email/outbox, chat, documentos, firma, entrevistas, ofertas y HTTP con SSRF/secret refs. El builder no muestra las acciones AI sin contrato de revisión humana, privacidad y durabilidad.
- El botón Test ejecuta el simulador sobre el grafo, no sólo el filtro: muestra pasos visitados, ramas omitidas, fallos, waits inciertos y el terminal; no toca proveedores ni DB de negocio.
- El catálogo ahora ofrece también `interview.rescheduled`, `interview.canceled` y `task.completed`; completar tareas persiste y emite el evento durable correspondiente.

### Parcial o pendiente, sin maquillarlo

- No está certificado el “exactly once” universal de proveedores externos. Slack OAuth usa cola durable; Telegram/Discord y algunos proveedores síncronos conservan la clave de efecto, y un timeout/resultado ambiguo ya termina en `uncertain` en vez de repetir a ciegas. Ahora existe resolución operativa manual por run: el operador autorizado registra resultado, nota, referencia y payload sin invocar de nuevo al proveedor; siguen faltando reconciliadores específicos por `providerRef`/consulta de estado para cada integración. Las acciones de entrevistas ya registran fallos en `interview_syncs`, exigen resultado estricto para workflows y reintentan sólo ledger fallido.
- Los paquetes documentales ya tienen una entidad durable `document_request_packages`, estado canónico y `packageId` independiente por efecto; el runtime conserva fallback para solicitudes legacy por aplicación/documento. El builder expone `primaryRequestId` como binding y la acción de firma resuelve de forma workspace-scoped el PDF efectivamente subido antes de crear la invitación. Aún faltan plantillas versionadas con variables, múltiples firmantes, recordatorios completos y E2E con portal/provider fixture.
- El scheduler dedicado está implementado, pero la migración productiva no se ejecutó desde este worktree: requiere el entorno autorizado, backup y evidencia del deploy.
- Faltan alertas operativas completas y pruebas E2E con providers fixture. El endpoint Prometheus ya expone intentos v2 por acción/resultado, duración agregada, cola due, waits, inciertos y runs stale; aún falta definir umbrales, paneles y routing de alertas. La reasignación de aprobaciones ya es durable, cercada por lease y auditada; la bandeja distingue solicitudes activas de vencidas y el resolver rechaza decisiones posteriores al deadline. Los selectores ya hidratan por ID exacto los valores guardados fuera de la primera página. El simulador ya tiene reloj virtual para delays y fixtures configurables por paso (resultado, payload JSON, puerto, código, retryable y `providerRef`); la bandeja de aprobaciones ya existe en la pantalla principal. Las acciones de reprogramar/cancelar entrevistas reutilizan el servicio provider-aware con `effectKey` y reconciliación del ledger.
  - El motor lineal no se elimina todavía: existen runs v1 históricos. Se conserva sólo como lector/ejecutor de soporte; no participa en la publicación v2 ni existe ya un guard que bloquee grafos nuevos. Su eliminación física queda para una decisión operativa posterior, después de confirmar que no hay históricos activos que requieran ejecución.

### Próximos cortes verificables

1. Añadir fixtures E2E para publish → event → run v2 → action/wait → resolver y para retry/lease takeover sin duplicar efectos.
2. Completar reconciliadores por proveedor y persistir `providerRef`/evidencia de idempotencia para Telegram/Discord/HTTP y cualquier I/O ambiguo antes de ampliar el catálogo.
3. Completar la bandeja de pendientes, métricas y alertas; después ejecutar el canary del runbook en el entorno productivo autorizado.
4. Drenar y medir v1; sólo con evidencia de cero activos y compatibilidad histórica retirar el engine lineal.
