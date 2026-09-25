# Harly Automations — especificación de producto, arquitectura e implementación

Versión del plan: 2.0. Fecha de investigación: 2026-09-06.
Worktree de referencia: `.worktrees/automations-revamp`, rama `feat/automations-revamp`.
Estado: especificación viva y registro de implementación. Cada capacidad se marca por paquete como verificada, en curso o bloqueada; no se considera implementada sólo por estar descrita aquí.
Audiencia: producto, diseño, ingeniería, QA y agentes de implementación.

> Estado de implementación 2026-09-11: el builder visual, el contrato de grafo
> v2, el worker durable, las acciones reales, waits/aprobaciones, portal de
> documentos, firma nativa, simulator y webhooks inbound ya tienen código y
> pruebas. El scheduler productivo ya invoca `/api/cron/automations` cada 10
> segundos. La verificación actual pasa typecheck, ESLint, `git diff --check`,
> `db:generate`, `drizzle-kit check`, la suite web completa (219 archivos,
> 1.031 tests), la integración PostgreSQL aislada (35/35) y el build canónico.
> La misma verificación incluye el E2E completo (3/3). Las
> migraciones fueron aplicadas sólo a las bases locales de desarrollo y
> verificación; no se ejecutó ninguna migración contra producción ni se debe
> considerar listo el rollout hasta completar la canary autorizada.

> Revalidación local 2026-09-12: el PostgreSQL de pruebas estaba apagado porque
> Colima no estaba activo; después de reactivarlo, `harly_e2e` respondió con 156
> migraciones. Un recorrido de contratación confirmó que el cambio de etapa y
> el evento durable se persistieron, y que la ruta de la carta de oferta
> respondió `200 application/pdf`. El artefacto local de 1.492 bytes se pudo
> analizar con PDF.js como un PDF de una página. Esto no demuestra todavía que
> el canvas del navegador lo renderice: las corridas E2E posteriores no
> completaron, una por `ENOSPC` al guardar artefactos y otra por esperar el
> evento `load` de `/portal/login`. El test ahora espera `domcontentloaded` en
> las rutas del portal y comprueba status/MIME del PDF; queda repetirlo con
> espacio suficiente. No considerar la revalidación actual como E2E verde ni
> como regresión confirmada del renderer. En la misma revisión se corrigieron
> las rutas de carta/campos: las excepciones de DB/storage ahora se registran y
> responden 503, mientras una oferta realmente inexistente mantiene 404; la
> regresión unitaria específica pasa 3/3.

Decisión de producto 2026-09-10: las automatizaciones nuevas se crean como
v2 desde el primer borrador y se publican únicamente con el runtime de grafo.
El motor lineal queda como lector/ejecutor histórico de instalaciones antiguas,
sin convertirse en una dependencia del builder nuevo ni en un gate para publicar
grafos v2. No se hará una migración masiva de runs v1 como requisito del estreno;
si aparecieran datos históricos, se preservan para lectura y soporte explícito.

Avance adicional 2026-09-10: la expiración del documento nativo ahora es una
transición durable completa. El cron marca el documento como `expired`, voids
el sobre nativo, expira los destinatarios pendientes, registra el evento de
auditoría y despierta los waits de documento para que el grafo continúe por su
salida `expired`. La consulta conserva el estado previo antes del `UPDATE` y
usa aliases camelCase explícitos; la prueba PostgreSQL cubre este recorrido.

Avance adicional 2026-09-10: el claim fenced de v2 acepta también la expiración
canónica de documentos nativos. Esto cierra la carrera en la que el estado de
firma se actualiza, se pierde el callback y el scheduler encuentra el run, pero
el worker no podía reclamarlo. La cobertura PostgreSQL verifica además que una
aprobación con deadline vencido se reanuda después de un reinicio y toma la
salida `expired`. El adapter productivo conserva la conexión DB entregada por
el runtime para sus lecturas directas, evitando dependencias globales en
workers aislados y pruebas.

Avance adicional 2026-09-10: la firma nativa admite hasta diez firmantes en
orden secuencial. Cada campo congelado conserva su `recipientIndex`; sólo el
firmante activo recibe un token válido y ve sus campos. Cada firma genera una
versión PDF intermedia y evidencia propia; el siguiente destinatario se activa
transaccionalmente con un outbox deduplicado. El documento y el workflow sólo
pasan a `signed`/continúan al completar el último firmante. El certificado y
los artefactos finales se generan una sola vez, evitando el conflicto de
artefactos únicos y la continuación prematura que tenía el recorrido de un
solo firmante.

Avance adicional 2026-09-09: la cola de sincronización de entrevistas conserva
ownership por worker durante cada retry. El cron y el retry manual usan un
claim atómico; el ledger ya no elimina el lock al comenzar la llamada al
proveedor, y un worker que perdió el claim no debe ejecutar el efecto externo.
La cobertura Playwright E2E pasa 3/3 en una base aislada: builder visual con
biblioteca, canvas, controles de vista y simulador; y recorrido candidato,
recruiter, entrevista, oferta y firma nativa. Se corrigió además la limpieza
de invitaciones nativas para serializar correctamente el cutoff ISO enviado a
postgres-js; antes podía abortar la finalización de una firma con
`ERR_INVALID_ARG_TYPE` antes de abrir la transacción.

Avance adicional 2026-09-09: la reconciliación de reuniones cubre las cuatro
implementaciones activas. Google Calendar recupera eventos por ID determinista;
Teams usa `onlineMeetings/createOrGet` con `externalId`; Zoom envía un tracking
field oculto y hace una búsqueda exacta, acotada y paginada tras un timeout; y
Jitsi conserva la sala ya persistida antes de generar otra. Los reemplazos de
Zoom/Teams usan una clave estable por operación y horario. Esto no promete
exactly-once contra proveedores externos, pero evita el reenvío ciego cuando
existe una evidencia recuperable.

## 0. Cómo ejecutar este documento

Leer primero las secciones 1–5, luego el modelo de datos y runtime (10–14), y finalmente ejecutar los paquetes de trabajo en el orden de la sección 20. Las especificaciones de interacción (6–9) son requisitos funcionales, no sugerencias visuales.

Los paths son relativos a la raíz del worktree. `features/...`, `components/...`, `server/...` y `lib/...` en tablas abreviadas pertenecen a `apps/web/src/`. Los archivos marcados **nuevo** son destinos propuestos, no archivos existentes. Confirmar su ausencia antes de crearlos y reutilizar equivalentes si otro cambio los introdujo.

El worktree tenía cambios sin commit de otros trabajos. Antes de implementar, registrar `git status --short`, leer el diff actual y preservar esos cambios. No asumir que el HEAD representa la versión visible en el navegador. No ejecutar migraciones sobre una base compartida para probar esta propuesta.

Cada entrega debe indicar requisitos cubiertos, archivos tocados, pruebas ejecutadas y limitaciones reales. No marcar una capacidad lista por tener un botón, un schema o un mock: requiere recorrido UI → contrato → servicio → persistencia → resultado visible.

Convenciones normativas: **debe** significa requisito de aceptación; **propuesto** significa decisión de este plan que puede cambiar mediante un ADR con justificación; **posterior** significa fuera del primer lanzamiento completo.

## 1. Objetivo y límites del producto

Construir un editor visual y un runtime durable para procesos de reclutamiento personalizados. Un equipo debe combinar acciones de Harly, herramientas externas, condiciones, tiempos y decisiones humanas, y entender tanto el diseño del flujo como el estado de cada ejecución.

El éxito no se mide por cantidad de nodos. Se mide por poder construir, probar, publicar, supervisar y corregir un proceso real sin escribir JSON, perder contexto o duplicar operaciones.

Principios:

1. Las herramientas usan los servicios de dominio de Harly y sus permisos; el motor no crea una segunda implementación del ATS.
2. El grafo representa control de ejecución. Las coordenadas representan presentación. Mover una tarjeta no cambia por sí solo el proceso.
3. Guardar un borrador no detiene la versión publicada.
4. Las esperas sobreviven reinicios y no retienen conexiones HTTP o workers.
5. El usuario ve datos requeridos, incompatibilidades, resultados y causas de espera.
6. Una herramienta nueva se incorpora mediante contrato y adaptador, sin reescribir el canvas.
7. El arrastre tiene alternativa por clic y teclado.
8. Las decisiones humanas dentro de una ejecución son distintas de la aprobación para publicar un flujo.

Alcance del primer lanzamiento completo: un disparador por workflow, grafo acíclico con ramas exclusivas y convergencia, acciones, esperas, aprobaciones y flujo documental integral. Hasta 100 nodos y 200 conexiones por versión como límites de producto iniciales configurados en un solo módulo.

Posterior: ramas paralelas, joins que esperan varias ramas, subworkflows, bucles arbitrarios, código JavaScript del usuario, edición colaborativa simultánea y marketplace de conectores. No colocar botones habilitados para capacidades posteriores.

## 2. Caso de aceptación principal

“Cuando una postulación llegue a Contratación, al día siguiente a las 09:00 del workspace pedir aprobación a Operaciones. Si aprueban, preparar un paquete documental, enviarlo a firma y mostrarlo en el portal. Cuando estén todas las firmas requeridas, mover la postulación a Incorporación, etiquetar al candidato y crear la tarea de bienvenida.”

Secuencia exacta:

| Paso | Tipo                      | Datos/configuración                                               | Salidas                                            |
| ---- | ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| N1   | Evento de cambio de etapa | Job y etapa identificados por ID                                  | `next`: applicationId, candidateId, jobId, eventId |
| N2   | Esperar fecha relativa    | Día calendario siguiente, 09:00, zona IANA del workspace          | `elapsed`                                          |
| N3   | Aprobación                | Personas elegibles de Operaciones, modo cualquiera, 48 h de plazo | `approved`, `rejected`, `expired`                  |
| N4   | Generar paquete           | Versión de plantilla, variables y destinatarios                   | `success`: packageId, documentIds                  |
| N5   | Solicitar firmas          | packageId de N4, firmantes y proveedor configurado                | `success`: signatureRequestIds                     |
| N6   | Esperar paquete firmado   | packageId de N4, todos los firmantes requeridos, plazo 7 días     | `completed`, `declined`, `expired`, `cancelled`    |
| N7   | Mover etapa               | applicationId de N1, etapa Incorporación del mismo job            | `success`                                          |
| N8   | Agregar etiqueta          | candidateId de N1, etiqueta onboarding                            | `success`                                          |
| N9   | Crear tarea               | Responsable, título, vencimiento relativo                         | `success`: taskId                                  |
| N10  | Finalizar                 | Resultado completado                                              | Ninguna                                            |

Las salidas negativas de N3 y N6 deben conectar a notificación/tarea de revisión y a un final explícito. El final distingue `completed` de `stopped`; un rechazo humano no es una excepción técnica.

“Reclutar” no se convierte silenciosamente en `application.hired`: la plantilla pide elegir entre entrada a una etapa y contratación confirmada.

Escenarios obligatorios: aprobación rechazada; miembro removido; firma parcial; paquete vencido; firma duplicada; evento recibido antes de registrar N6; reinicio durante N2/N6; dos postulaciones del mismo candidato; edición del workflow mientras espera; cancelación antes y después de enviar documentos.

## 3. Inventario comprobado y brechas

| Área existente           | Ubicación                                                                                          | Reutilización y trabajo requerido                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Modelo v1                | `features/automations/schema.ts`                                                                   | WHEN + condiciones + lista de acciones; mantener parser legacy y crear contrato v2                 |
| Ejecutor                 | `features/automations/engine.ts`                                                                   | Leases, pasos, resultados y permisos; extraer ejecución de herramienta y añadir runtime durable v2 |
| Dispatcher               | `features/automations/dispatch.ts`                                                                 | Outbox y recuperación; reemplazar heurísticas temporales anti-loop por causalidad explícita en v2  |
| Registry                 | `features/automations/registry.ts`                                                                 | Adaptadores iniciales; separar metadata cliente de handlers server-only                            |
| CRUD/versiones           | `features/automations/data.ts`, `actions.ts`                                                       | Separar draft y published; control de concurrencia; validar al publicar                            |
| Editor                   | `features/automations/builder/WorkflowBuilder.tsx`                                                 | Sustituir formulario largo por shell con canvas/inspector                                          |
| Historial                | `builder/RunsTimeline.tsx`                                                                         | Integrar y adaptar a nodos/intententos v2; conservar lector legacy                                 |
| API                      | `app/api/v1/automations/**/route.ts`                                                               | Actualmente devuelve 410; decidir nueva activación por capacidades y publicar contrato real        |
| Eventos internos         | `server/events/registry.ts`, `emit.ts`, `outbox.ts`                                                | Fuente canónica; agregar eventos documentales y recibos por consumidor                             |
| Webhooks                 | `server/webhooks/events.ts`, `emit.ts`                                                             | Exportación externa de un subconjunto, no fuente de todos los eventos internos                     |
| Solicitudes documentales | `features/documents/requests-actions.ts`, `requests-data.ts`                                       | Extraer servicio con actor explícito desde acciones con sesión                                     |
| Firma                    | `lib/esign/document-signing.ts`, `native/remote.ts`, `native/finalize.ts`, `webhook-sync.ts`       | Reutilizar proveedores, identidad y finalización; emitir evento después de persistir evidencia     |
| Portal                   | `features/portal/document-actions.ts`, `app/(portal)/portal/applications/[applicationId]/page.tsx` | Añadir pendientes de firma y acceso al recorrido existente; verificar identidad extremo a extremo  |
| Reuniones                | `features/interviews/service.ts`                                                                   | Reutilizar creación, actualización y cancelación con disponibilidad e integración                  |
| Tareas/alertas           | `features/tasks/service.ts`, `features/notifications/data.ts`                                      | Usar servicios; no insertar directamente para eludir validaciones                                  |
| Programador              | `app/api/cron/domain-events/route.ts`, `cron/automations/route.ts`                                 | Integrar batch v2; evitar dos ejecutores consumiendo el mismo run                                  |

Hallazgos a revalidar al comenzar: múltiples actualizaciones del filtro parten del mismo estado; acción inválida se valida demasiado tarde; historial sin montar; draft/published acoplados; aprobaciones de publicación sin recorrido completo en editor; tests de API verifican 410. No usar la revisión anterior como prueba de que estos defectos siguen presentes después de cambios concurrentes.

Observación corregida: `pruneDomainEventOutbox` ya no elimina eventos sólo por antigüedad mientras falte el checkpoint de cualquier consumidor durable. La poda exige `published_at` y, para triggers de workflow, `automations_dispatched_at`; la integración PostgreSQL en `runtime/leases.integration.test.ts` cubre eventos pendientes y procesados.

## 4. Encaje con Harly y dependencias

Respetar ADR-002 (PostgreSQL durable + SSE de invalidación), ADR-003 (RBAC contextual por recurso) y ADR-005 (evaluación gobernada). El score no habilita rechazar automáticamente candidatos; las plantillas de evaluación conducen a revisión humana. Este requisito proviene del ADR existente, no de una nueva política de este plan.

Mantener Next.js App Router, React, TypeScript, Zod, Drizzle, server actions, logger/audit y primitivas UI existentes. Evitar imports de `server-only` desde el catálogo o los componentes cliente.

| Dependencia                          | Decisión                                  | Uso y momento                                                                              |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `@xyflow/react`                      | Añadir en paquete web, P04                | Canvas, nodos, handles, conexiones, viewport, fondo y minimapa                             |
| `elkjs`                              | Añadir en paquete web, P04                | Autoordenar grafo; carga diferida solo al usar layout                                      |
| `@dnd-kit/core`, sortable, utilities | Ya instaladas                             | Biblioteca lateral/listas; no superponer sus sensores al drag interno de React Flow        |
| `@date-fns/tz`                       | Añadir tras verificar API compatible, P07 | Cálculos de calendario en zona IANA junto a date-fns existente                             |
| Zod / Drizzle                        | Ya instaladas                             | Contratos, persistencia y migraciones                                                      |
| Radix / cmdk / componentes Harly     | Ya instaladas                             | Menús, diálogos, buscador, combobox y paneles                                              |
| Vitest / Playwright                  | Ya instaladas                             | Lógica pura, integración DB y pruebas browser                                              |
| Zustand / Redux / nuevo query client | No añadir inicialmente                    | Reducer de comandos + estado controlado; medir antes de ampliar dependencias               |
| Redis / BullMQ / Temporal            | No requeridos por esta propuesta          | PostgreSQL y programador existentes; cualquier sustitución exige ADR y migración explícita |

Verificar versiones estables, peer dependencies, licencia y compatibilidad React 19/Next del checkout al ejecutar P04/P07. Fijar versiones exactas y actualizar `pnpm-lock.yaml`; no copiar números futuros de este documento. Registrar versiones finalmente elegidas en el PR. No instalar dependencias durante la fase de planificación.

La documentación oficial confirma las superficies necesarias de React Flow: [introducción y componentes](https://reactflow.dev/learn), [accesibilidad](https://reactflow.dev/learn/advanced-use/accessibility), [integración ELK](https://reactflow.dev/examples/layout/elkjs). Son referencias de APIs; el comportamiento de producto se define aquí.

Referencia para zonas horarias: [documentación oficial de @date-fns/tz](https://github.com/date-fns/tz). La librería permite cálculos en zona específica; las políticas de horas ambiguas/inexistentes de la sección 13 deben implementarse y probarse explícitamente, no asumirse por instalarla.

## 5. Arquitectura y propiedad de módulos

```text
Editor / API / cliente AI
        ↓ contratos compartidos y permisos
Servicio de definiciones → borrador → validación → versión publicada
                                                    ↓
Evento durable → dispatcher → run fijado a versión → scheduler/worker
                                                    ↓
                              runtime → herramientas → servicios Harly
                                 ↓                         ↓
                     esperas/aprobaciones       outbox/proveedor/documentos
                                 ↑                         ↓
                                 └──── eventos correlacionados ────┘

Base de datos → consultas de runs/pendientes → SSE invalida → UI consulta
```

Crear estas fronteras dentro de `apps/web/src/features/automations/`:

| Módulo nuevo                      | Responsabilidad                                    | No debe hacer                                                      |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ |
| `definition/schema-v2.ts`         | Tipos Zod de nodos, conexiones, bindings y versión | Importar React o DB                                                |
| `definition/validate.ts`          | Validación pura de estructura y dependencias       | Consultar proveedores                                              |
| `definition/compile.ts`           | Compilar grafo validado a plan determinista        | Usar coordenadas para ordenar                                      |
| `definition/legacy-adapter.ts`    | Leer/adaptar v1 sin cambiar semántica              | Crear nuevas definiciones v1 o migrar runs activos automáticamente |
| `definition/service.ts`           | CRUD, revisión, publicación y CAS                  | Implementar handlers                                               |
| `tools/catalog.ts`                | Manifestaciones client-safe                        | Secretos o lógica de ejecución                                     |
| `tools/contracts.ts`              | Input/output/error/contexto común                  | Depender de sesión                                                 |
| `tools/server-registry.ts`        | Resolver handler por tipo y versión                | Importarse en cliente                                              |
| `tools/handlers/*.ts`             | Adaptadores de servicios existentes                | Duplicar autorización del dominio                                  |
| `runtime/worker.ts`               | Reclamar, ejecutar lotes y liberar lease           | Mantener request durante espera                                    |
| `runtime/advance.ts`              | Transiciones atómicas entre pasos                  | Efectos externos en transacción DB                                 |
| `runtime/events.ts`, `timers.ts`  | Resolver esperas y tiempo                          | Basarse en SSE para durabilidad                                    |
| `runtime/approvals.ts`            | Decisiones, elegibilidad, vencimiento              | Aprobar publicación de definiciones                                |
| `runtime/repository.ts`           | Queries transaccionales y locking                  | Decisiones de presentación                                         |
| `testing/simulator.ts`            | Simulación pura con reloj y resultados controlados | Llamar handlers reales                                             |
| `builder/state/*`                 | Reducer, comandos, undo y serialización            | Ser fuente de autorización                                         |
| `builder/canvas/*`, `inspector/*` | Adaptadores visuales del contrato                  | Persistir objetos React Flow como dominio                          |

Mantener inicialmente `actions.ts` como fachada compatible delegando a servicios nuevos. Dividir por responsabilidad al crecer, conservando exports requeridos por callers existentes. Mantener `engine.ts` y el reader legacy sólo como compatibilidad histórica; no deben bloquear la creación, publicación ni ejecución de grafos v2.

## 6. Pantallas y navegación

### 6.1 Listado de automatizaciones

Ruta existente `/dashboard/automations`. Mostrar listado compacto con nombre, estado de publicación, cambios en borrador, trigger, responsable, última ejecución y errores pendientes. Búsqueda por nombre; filtros Todos/Activos/Pausados/Borradores/Con errores; paginación cursor de 25.

Acciones: Crear flujo, Plantillas, abrir editor, duplicar como borrador, pausar nuevas ejecuciones, reanudar y archivar. Archivar oculta del listado normal y bloquea nuevos runs, conservando historia; informar cantidad de runs activos y permitir ir a ellos. No cancelar ejecuciones por archivar sin una acción distinta.

La galería de plantillas muestra objetivo, bloques incluidos y requisitos de conexión. Elegir plantilla abre un borrador editable; nunca publica. Los placeholders pendientes aparecen como errores concretos, sin IDs ficticios que parezcan válidos.

### 6.2 Editor

Mantener ruta fullscreen existente `/dashboard/automations/[id]`. En `/new`, crear borrador persistido vacío en la primera edición significativa y reemplazar URL con su ID sin recargar ni perder selección.

Usar `FocusModeShell`: sus columnas tienen scroll propio. Todos los paneles y tabs pertenecen al shell; no montar métricas debajo del viewport completo.

```text
Volver | Nombre / Borrador / Publicado v3 | Guardar | Probar | Publicar | ⋯
        Editor · Ejecuciones · Pendientes · Versiones · Configuración
┌──────────────────┬──────────────────────────────┬──────────────────────┐
│ Bloques / Índice  │ Canvas con puntos            │ Inspector            │
│ Buscar           │                              │ Paso seleccionado    │
│ Disparadores     │ [Evento]                     │ Configuración        │
│ Control          │    │                         │ Datos y requisitos   │
│ Herramientas     │ [Esperar] → [Aprobar]        │ Errores locales      │
│                  │                              │                      │
├──────────────────┤ Zoom / Ajustar / Ordenar      │                      │
│ Errores (2)      │ Minimapa opcional             │                      │
└──────────────────┴──────────────────────────────┴──────────────────────┘
```

Desktop ≥1280 px: biblioteca 264 px, inspector 360 px, centro flexible. Entre 768–1279: biblioteca en drawer, inspector hasta 340 px. <768: vista de pasos como principal y configuración en sheet; canvas opcional de consulta. Ninguna función esencial queda solo en un botón oculto por breakpoint.

Usar tokens actuales `paper`, `kraft`, `foreground`, `border`, tipografía y componentes existentes; no introducir paleta global ni segundo kit de botones. No cargar campos completos dentro de todos los nodos.

### 6.3 Ejecuciones, pendientes y versiones

Tabs persistidos en query param `view`; selección de run y nodo también enlazables. Validar estos parámetros server-side al consultar datos.

Ejecuciones: búsqueda por candidato/postulación/run, estado, versión y rango de fechas; tabla de 25 con cursor. Detalle: grafo de la versión ejecutada con ruta recorrida, timeline, inputs/outputs permitidos, intentos, tiempos, errores y motivo de espera. Nunca pintar una ejecución vieja sobre el borrador nuevo.

Pendientes: Mi trabajo / Equipo / Todos según permisos. Tarjeta con candidato, proceso, responsable, fecha límite y acceso al contexto. Aprobar/Rechazar requiere persona autenticada elegible; notificación por correo enlaza al pendiente, no decide mediante GET.

Versiones: publicada actual, revisiones publicadas previas y diff semántico. Comparar nombre, configuración, bindings, conexiones y política; posiciones en comparación visual separada. Restaurar crea borrador nuevo, no altera una versión histórica ni publica automáticamente.

## 7. Canvas: interacción especificada

| Interacción          | Comportamiento obligatorio                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Fondo                | Puntos discretos, separación 24 px a zoom 100%, tamaño 1 px; toggle Mostrar puntos, preferencia por usuario                                 |
| Dirección            | Flujo inicial de arriba hacia abajo; conexiones con flecha y curvas ortogonales suaves                                                      |
| Pan                  | Arrastrar fondo con herramienta Mano; espacio+arrastre temporal desde Selección; rueda/trackpad desplaza; gesto pinch o Ctrl/Cmd+rueda zoom |
| Zoom                 | Botones +/−, porcentaje editable/presets; rango 25–200%; Ajustar con padding; sin recentrar al editar campos                                |
| Selección            | Clic nodo abre inspector; clic fondo limpia; Shift permite multiselección; Escape sale de conexión o cierra overlay superior                |
| Mover nodo           | Arrastrar cabecera; actualiza layout al soltar, no conexiones; un gesto = un comando undo                                                   |
| Arrastrar biblioteca | Ghost del bloque; convertir coordenadas de pantalla a canvas; soltar fondo crea nodo desconectado marcado pendiente                         |
| Insertar en línea    | Hover/foco muestra +; elegir bloque reemplaza una conexión por dos; operación atómica y reversible                                          |
| Conectar             | Arrastrar handle de salida a entrada; previsualización y validación; conexiones inválidas explican motivo                                   |
| Conectar sin drag    | Menú Conectar salida → seleccionar siguiente paso compatible; misma validación                                                              |
| Reordenar proceso    | Menú Mover antes/después solo en tramo lineal sin ambigüedad; reescribe conexiones, no solo posición                                        |
| Desconectar          | Seleccionar línea → Eliminar conexión; conserva nodos y muestra errores de conectividad                                                     |
| Duplicar             | Nuevo ID, copiar config/layout con offset; sin conexiones externas; bindings a nodos duplicados se remapean dentro del conjunto             |
| Eliminar             | Nodo lineal con una entrada/salida puede reconectar vecinos; mostrar efecto. En rama, no inferir destino: dejar conexión pendiente          |
| Autoordenar          | ELK, dirección DOWN, separación inicial 64 px lateral/96 px entre capas; respeta tamaños medidos; un comando undo                           |
| Minimapa             | Toggle, apagado al comenzar y disponible en controles; útil desde 15 nodos; navegable sin bloquear canvas                                   |
| Buscar nodo          | Buscador por nombre/tipo; seleccionar enfoca nodo y abre inspector sin alterar definición                                                   |
| Bloquear layout      | Impide mover tarjetas, mantiene selección/configuración; preferencia del usuario                                                            |

Puertos: trigger `next`; acción `success` y `error` cuando política es rama; condición `true/false`; espera `elapsed` o resultados de evento; aprobación `approved/rejected/expired`; final sin salida.

No permitir self-edge, ciclos, conexión a trigger ni dos destinos por un mismo puerto. Convergencia de ramas exclusivas permitida: una ejecución tiene un único token activo, no requiere join paralelo. Antes de publicar, todo nodo debe ser alcanzable y todo camino terminar explícitamente.

Atajos con foco fuera de inputs: Cmd/Ctrl+S guardar, Z deshacer, Shift+Z rehacer, D duplicar selección, Delete eliminar, Escape cancelar interacción. No secuestrar escritura ni atajos del navegador cuando el editor no tiene foco. Anunciar inserciones/reordenamientos a lectores de pantalla; etiqueta accesible para handles y nodos.

Undo/redo: historial de 100 comandos, agrupación de escritura por campo hasta blur o 750 ms de pausa. Deshacer tras autosave genera una revisión nueva. Selección, zoom y pan no ensucian la definición ni exigen republicar.

## 8. Botones, borradores y publicación

| Control                   | Cuándo habilitado                                                   | Resultado                                                                                    |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Guardar                   | Cambios locales y permiso de edición                                | Guarda borrador incluso incompleto; revisión CAS; nunca modifica publicada                   |
| Autosave                  | Tras 1500 ms sin ediciones semánticas, si borrador tiene ID         | Mismo endpoint que Guardar; single-flight; guardar cambios posteriores al terminar           |
| Probar                    | Borrador con al menos trigger y conexión ejecutable                 | Abre asistente; validación informa si no puede simular                                       |
| Publicar                  | Permiso correspondiente; siempre accesible para ver impedimentos    | Panel con errores/requisitos/diff; confirmar solo si válido y aprobación vigente             |
| Solicitar revisión        | Borrador guardado y válido, política requiere revisión              | Solicitud vinculada a hash/revisión exactos                                                  |
| Aprobar versión           | Revisor autorizado distinto del publicador según política existente | Registra revisión aprobada; no decide pendientes de runs                                     |
| Pausar nuevas ejecuciones | Publicada activa                                                    | Deshabilita nuevos disparos; mantiene runs existentes                                        |
| Reanudar                  | Publicada pausada                                                   | Reactiva versión publicada, no borrador                                                      |
| Restaurar versión         | Versión histórica accesible                                         | Copia a borrador con revisión nueva                                                          |
| Cancelar ejecución        | Run no terminal y permiso operar                                    | Solicitud atómica; cancela futuras acciones/esperas; no deshace efectos realizados           |
| Reintentar fallo          | Error recuperable o permiso de operación manual apropiado           | Nueva tentativa del mismo paso con misma clave de efecto; no repite anteriores               |
| Ejecutar otra vez         | Run terminal y versión publicada disponible                         | Run nuevo con origen replay y confirmación de efectos; no reutiliza aprobación humana previa |

Estados de guardado visibles: Sin guardar, Guardando…, Guardado a HH:mm, Sin conexión, Conflicto, Error al guardar. Una respuesta vieja no borra dirty de una edición nueva. Abort de red no implica que el servidor no guardó: recargar revisión antes de reintentar.

Usar `expectedRevision` y compare-and-swap. Ante 409, ofrecer comparar con servidor y copiar cambios a un nuevo borrador/workflow; nunca sobrescribir silenciosamente. No implementar colaboración en tiempo real como parte de CAS.

Autosave permite configuración incompleta pero JSON estructuralmente seguro: errores de negocio quedan en `validationIssues`. Publicar exige grafo válido, handlers disponibles, referencias existentes, permisos, conexiones y plantillas configuradas. Advertencias no bloqueantes se distinguen de errores.

La política de revisión mantiene el comportamiento existente de aprobación por otro miembro para workflows existentes. No relajar mediante nueva UI. Toda modificación semántica invalida aprobación; cambios de viewport no. Proporcionar bandeja real para revisar/publicar: no dejar al usuario con Request approval sin destino.

## 9. Inspector y catálogo de herramientas

Inspector con Nombre del paso, descripción breve, campos requeridos, selector de datos, vista previa y política de fallo. Validación inline al salir del campo; panel global de errores ordenado por recorrido. Al cambiar tipo de trigger o borrar nodo, señalar bindings inválidos aguas abajo sin borrarlos silenciosamente.

Valores dinámicos se seleccionan desde Evento, Postulación, Candidato, Job y Resultados anteriores. Mostrar tipo, ejemplo y origen; deshabilitar resultados de ramas que no garantizan ejecución. Valores ausentes no se convierten automáticamente en cadena vacía: definir fallback explícito o fallar validación/resolución.

### 9.1 Disparadores

Primera ola: application.created, stage_changed, hired, rejected; candidate.created/updated; interview.scheduled/rescheduled/completed/canceled; job.published. Filtros por IDs, fuente/campos compatibles y transición desde/hacia cuando payload lo permita. No ofrecer filtro job para evento que no proporciona job ni una regla de resolución determinista.

Segunda ola: document.request.submitted/accepted/declined, signature.request.completed/declined/expired, document.package.completed, evaluation.completed. `task.completed` ya está incorporado al registry y al catálogo porque cuenta con productor durable y payload validado.

Tercera ola: horario recurrente con zona IANA y calendario; webhook entrante autenticado con payload tipado y sample. Un workflow conserva un solo trigger; permitir plantillas duplicadas para distintas entradas antes de soportar multi-trigger.

### 9.2 Matriz de bloques y configuración

Todos los identificadores de tipos siguientes son propuestas v2 estables. Mantener aliases legacy en adaptador, no renombrar datos antiguos destructivamente.

| Tipo                                              | Campos del inspector                                                                                                                                                  | Salida / servicio                                              | Ola |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --- |
| `application.move_stage`                          | Postulación, job derivado, etapa del job, razón opcional                                                                                                              | applicationId, stageId; applications/service                   | 1   |
| `application.set_status`                          | Postulación, estado permitido, razón                                                                                                                                  | applicationId, status; servicios de dominio y política ADR-005 | 1   |
| `candidate.add_tag/remove_tag`                    | Candidato, etiqueta existente o nueva válida                                                                                                                          | candidateId, label, changed                                    | 1   |
| `candidate.add_note`                              | Candidato, texto con variables, visibilidad admitida                                                                                                                  | noteId; servicio de notas                                      | 1   |
| `task.create`                                     | Título, descripción, responsable/fallback, prioridad, fecha o duración                                                                                                | taskId, dueAt; tasks/service                                   | 1   |
| `email.send`                                      | Destinatario permitido, plantilla versionada o asunto/cuerpo, variables                                                                                               | outboxId, estado queued; email outbox                          | 1   |
| `chat.send`                                       | Conexión Slack/Discord, canal admitido, mensaje                                                                                                                       | deliveryId, queued; notify adapter explícito                   | 1   |
| `notification.create`                             | Destinatarios, título, cuerpo, enlace de recurso                                                                                                                      | notificationIds; notifications                                 | 1   |
| `condition`                                       | Grupos AND/OR/NOT, campos tipados, operadores compatibles                                                                                                             | true/false con explicación                                     | 1   |
| `delay`                                           | Duración o próxima fecha local, zona, hora                                                                                                                            | elapsed y wakeAt calculado                                     | 2   |
| `approval`                                        | Personas/equipo, regla cualquiera/todos, contexto, plazo, recordatorios                                                                                               | approved/rejected/expired y actorIds                           | 2   |
| `document.request`                                | Postulación, lista de documentos, instrucciones, vencimiento                                                                                                          | requestIds; requests service                                   | 2   |
| `document.package.generate` / `generate_document` | En v2 inicial: título y cuerpo textual versionados en el grafo, variables permitidas, postulación; evolución: plantilla/versiones reutilizables, adjuntos y firmantes | documentId, documentVersionId; luego packageId, documentIds    | 2   |
| `signature.request`                               | Documento/paquete, firmantes, orden compatible, expiración                                                                                                            | signatureRequestIds, packageId                                 | 2   |
| `wait.document_package`                           | packageId, plazo y recordatorios                                                                                                                                      | completed/declined/expired/cancelled                           | 2   |
| `wait.event`                                      | Tipo admitido, resourceId tipado, deadline                                                                                                                            | matched/expired y payload filtrado                             | 2   |
| `interview.booking_link`                          | Postulación, tipo, organizador, duración, mensaje                                                                                                                     | bookingRequestId; integración de agenda                        | 3   |
| `interview.schedule`                              | Participantes, postulación, inicio, zona, duración, lugar                                                                                                             | interviewId, estado proveedor                                  | 3   |
| `interview.reschedule/cancel`                     | interviewId, nueva fecha o motivo                                                                                                                                     | interviewId y resultado                                        | 3   |
| `http.request`                                    | Conexión/URL, método, headers estructurados, cuerpo, secretos                                                                                                         | status y resultado acotado                                     | 3   |
| `candidate.update_fields`                         | Campos permitidos tipados y valores                                                                                                                                   | changedFields; servicio de dominio                             | 3   |
| `evaluation.request`                              | Postulación, rúbrica/versión, motor habilitado                                                                                                                        | evaluationJobId; luego wait.event                              | 3   |
| `end`                                             | Etiqueta y resultado completed/stopped                                                                                                                                | Terminal                                                       | 1   |

Una herramienta solo es seleccionable si tiene implementación, schema, prueba, permisos y modo simulación. Si falta conexión del workspace mostrar “Conecta email” con enlace, manteniendo visible la capacidad. Si no está implementada, no presentarla como utilizable; mostrar roadmap aparte.

Campos sensibles usan selector de conexión/secret reference, nunca texto secreto persistido en el grafo. Los headers HTTP son filas key/value; serializar objeto, no textarea incompatible. Interpolación de notas/email/chat debe compartir resolver tipado; escapar según canal de salida y reutilizar sanitización HTML existente.

### 9.3 Contrato de una herramienta

Manifest client-safe: `type`, `version`, `category`, `label`, `description`, `inputSchema`, `outputSchema`, `requiredEntities`, `requiredPermissions`, `connectionKinds`, `retryClass`, `supportsSimulation`, `supportsLiveTest`.

Handler server-only: `validateReferences(ctx,input)`, `execute(ctx,input)`, `reconcile(ctx,effect)` cuando proveedor lo requiere. Simulador separado: `simulate(input,fixture)` sin DB mutable ni red.

Contexto: workspaceId verificado, actorId explícito, runId, nodeId, attemptId, effectKey, causationId, correlationId, deadline y AbortSignal. Nunca depender de cookies dentro del handler.

Resultado discriminado: succeeded(output), queued(deliveryId), retryable(errorCode,retryAfter), permanentFailure(errorCode), uncertain(externalReference). queued no significa delivered; espera posterior usa evento de entrega cuando existe.

Cada nueva herramienta requiere una entrada de catálogo, schema versionado, adaptador, validador de referencias, fixture de simulación, test de servicio, test de permisos y documentación. Una modificación incompatible crea versión nueva; no reinterpretar configs publicadas.

## 10. Contrato de definición y compilación

```ts
type WorkflowGraphV2 = {
  schemaVersion: 2;
  entryNodeId: string;
  nodes: WorkflowNode[]; // Unión Zod discriminada, no config:any
  edges: Array<{ id: string; source: string; port: string; target: string }>;
};
type Binding =
  | { kind: "literal"; value: JsonValue }
  | { kind: "trigger"; path: string; fallback?: JsonValue }
  | { kind: "output"; nodeId: string; path: string; fallback?: JsonValue };
type EditorLayout = {
  positions: Record<string, { x: number; y: number }>;
  collapsedNodeIds: string[];
};
```

Completar `WorkflowNode` como unión estricta por tipo y toolVersion. `JsonValue` no admite funciones/prototipos. Paths son segmentos allowlisted con protección de prototype traversal; no eval ni expresiones JavaScript. El servidor no confía en paths ni schemas enviados por cliente.

Config de acción incluye `failurePolicy: stop | route_error | continue`, `input` tipado y toolVersion. continue es éxito con advertencia, no oculta el fallo del paso; output fallido no satisface bindings posteriores. Acciones de aprobación no admiten continuar silenciosamente tras rechazo.

Validación en orden: tamaño de payload (1 MiB inicial), schema, IDs únicos, entry existente y único trigger, puertos correctos, ciclos, alcanzabilidad, terminales, referencias tipadas, dominancia de outputs, schemas de herramientas, referencias de dominio, permisos/conexiones, política de publicación. Limitar condiciones a 100 hojas y profundidad 8 por bloque.

Compilar índices por nodeId/puerto, orden topológico, dominadores, schemas y versión de compilador. Hash semántico excluye layout y timestamps. Persistir definición canónica; plan compilado es caché verificable por hash y compilerVersion, regenerable.

Guardar hash de contenido con serialización canónica estable. La publicación valida exactamente la revisión que bloquea mediante CAS/transacción; si cambia durante preflight retornar conflicto y repetir validación.

## 11. Persistencia propuesta

Modificar `packages/db/src/schema.ts` y generar migraciones siguiendo `packages/db/AGENTS.md`. Reutilizar tablas de identidad/workspace/dominio. Las nuevas tablas aquí son específicas de orquestación.

| Tabla nueva o cambio                      | Campos principales                                                                                           | Restricciones/índices                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| workflow_definitions (extender)           | engineVersion, publishedVersionId, triggerGeneration, archivedAt; mantener legacy                            | Workspace + activo + trigger; no borrar columnas legacy inicialmente              |
| workflow_drafts (nueva)                   | workflowId, revision, graph, layout, updatedById, contentHash, reviewHash                                    | Único workflowId; CAS revision; workspace FK                                      |
| workflow_definition_versions (extender)   | schemaVersion, graph, compilerVersion, contentHash, layoutSnapshot                                           | Único workflowId/version; inmutable tras publicación                              |
| workflow_runs (extender)                  | engineVersion, versionId, mode, logicalStatus, cursorNodeId, causationId, rootRunId, fenceToken, contextRefs | Índice workspace/status/nextAttemptAt; unique workflow/sourceEventId para entrada |
| workflow_node_executions (nueva)          | runId,nodeId,status,inputSnapshot,outputRef,startedAt,finishedAt                                             | Único runId/nodeId para grafo sin ciclos                                          |
| workflow_node_attempts (nueva)            | executionId,attemptNo,leaseToken,status,errorCode,providerRef,times                                          | Único executionId/attemptNo; append-only evidencia                                |
| workflow_waits (nueva)                    | runId,nodeId,kind,eventName,resourceType,resourceId,wakeAt,deadline,status,eventId                           | Índices pending/wakeAt y workspace/event/resource; único run/node                 |
| workflow_approvals (nueva)                | runId,nodeId,policy,eligibleActorIds,deadline,status,resolution                                              | Único run/node; índice workspace/status/deadline                                  |
| workflow_approval_decisions (nueva)       | approvalId,actorId,decision,comment,createdAt                                                                | Único approvalId/actorId; inmutable                                               |
| workflow_event_receipts (nueva)           | consumer,eventId,workflowId/runId,disposition,processedAt                                                    | Unique consumidor + evento + destino; índice pendientes                           |
| workflow_action_effects (reusar/extender) | nodeExecutionId,effectKey,status,providerRef,result                                                          | Unique effectKey; compatibilidad stepIndex legacy                                 |
| workflow_simulations (nueva)              | workspace,actor,hash,fixture,result,expiresAt                                                                | TTL y acceso por workspace/recurso; sin PII innecesaria                           |

`logicalStatus` v2 evita reinterpretar enum legacy antes de migración; serializer expone discriminante engineVersion. Estados v2 definidos en sección 12. Registrar schema final y estrategia de indexes en ADR antes de generar SQL.

Bindings guardan IDs; outputs grandes/documentos usan referencias a tablas/storage existentes. InputSnapshot del intento fija datos usados en esa tentativa; reintento reutiliza input congelado, una nueva ejecución resuelve de nuevo. Nunca copiar PDFs o credenciales a JSONB.

Membresía y aislamiento deben verificarse también en enlaces entre tablas: comprobar que resourceId pertenece al mismo workspace; donde sea viable usar claves foráneas compuestas. No aceptar workspaceId del navegador como autorización.

No crear modelo alternativo de documentos: crear `document_packages` y su relación a versiones documentales solo si el inventario P01 confirma ausencia de entidad equivalente. Identidad mínima: packageId, applicationId, candidateId, templateVersion, documentVersionIds, requiredRecipientIds, status. Modificaciones a paquete enviado crean versión/reemplazo explícito, no cambian lo que alguien ya firmó.

## 12. Runtime durable y semántica de ejecución

Estados de run: queued, running, waiting, retrying, succeeded, completed_with_warnings, stopped, failed, uncertain, cancelled. Una espera no se reporta como “Running” durante días. Estado de nodo separado: pending/running/waiting/succeeded/failed/skipped/cancelled/uncertain.

Algoritmo del worker:

1. Reclamar batch vencido mediante transacción corta y `FOR UPDATE SKIP LOCKED` o CAS equivalente; máximo inicial 25 runs por batch y 5 efectos concurrentes por proceso.
2. Incrementar fenceToken y fijar lockedBy/leaseUntil. Lease inicial 60 s, heartbeat 20 s; cada update posterior exige token vigente.
3. Cargar versión inmutable; comprobar cancelación, actor, scope y recursos. Preparar/recuperar node execution.
4. Resolver inputs y validarlos. Persistir intento y reservar effectKey antes de efecto.
5. Ejecutar servicio fuera de transacción; timeouts específicos. Tareas largas de generación/evaluación se encolan y esperan resultado.
6. Persistir resultado solo si lease/fence sigue vigente. El proveedor y el servicio deben deduplicar por effectKey; fencing local solo no evita doble efecto externo.
7. Resolver puerto; crear siguiente paso, espera o final en transacción. Liberar worker al entrar a waiting.
8. Si batch supera 20 s, reencolar continuidad para próximo tick. No usar recursión que mantenga toda la ejecución en memoria.

Retries transitorios: hasta 5 intentos iniciales, backoff 30 s/2 min/10 min/30 min y Retry-After limitado por deadline. Config inválida/recurso no permitido → fallo permanente. Timeout con resultado externo desconocido → reconciliar primero; si no hay forma fiable, estado uncertain y tarea operativa, sin reenvío ciego.

Efectos internos: cuando servicio lo permita, operación y registro de efecto/evento en misma transacción. Email: misma key del outbox. HTTP: Idempotency-Key y política explícita para proveedores sin soporte. Reintentar conserva key; “Ejecutar otra vez” crea run/key nuevos y advierte que repite efectos.

Pausar workflow bloquea nuevas entradas; runs iniciados siguen. Cancelar run marca solicitud, bloquea siguientes nodos y resuelve esperas canceladas. Un efecto ya enviado no se revierte; la UI muestra esa frontera. No ofrecer rollback genérico de emails/firmas/reuniones.

Identidad de ejecución inicial: creador/propietario explícito y permisos actuales, coherente con Harly. Pérdida de acceso termina de forma explicada o requiere reasignación operativa autorizada. No añadir automáticamente un superusuario de automatizaciones.

Causalidad: eventId, causationId, rootRunId y depth propagados. Deduplicación por evento, no por “mismo candidato en 30 segundos”. Limitar profundidad causal inicial a 10 y prohibir reentrada del mismo workflow en la cadena por defecto. Registrar supresión con motivo sin bloquear eventos independientes del mismo candidato.

Cuotas propuestas: 10 efectos concurrentes por workspace, 100 starts/min/workflow, 30 externos/min/workflow; parametrizadas, no constantes dispersas. Contadores/claim atómicos en DB, no COUNT seguido de INSERT bajo carrera. Saturación difiere trabajo, no lo descarta. Circuit breaker abre por fallos técnicos consecutivos; esperas/rechazos no cuentan. Cooldown habilita un único probe half-open; distinguir circuito abierto de pausa manual.

## 13. Eventos, tiempo y carreras

Fuente canónica: `server/events/registry.ts`. Agregar envelopes tipados con eventId, occurredAt, workspace, resource IDs, schemaVersion y causalidad. Productor usa outbox transaccional con cambio de dominio. Firma solo se considera completada después de persistir su versión/evidencia final, no al recibir cualquier callback del proveedor.

Separar consumo para iniciar workflows y consumo para despertar waits: un evento puede satisfacer ambos; la deduplicación no debe impedir el segundo. Persistir recibos por consumidor/destino y procesar lotes reintentables. SSE solo invalida vistas.

Espera documental registra resourceId=packageId y lista/versiones requeridas; candidateId solo es contexto. Al entrar a espera, consultar estado durable del paquete y registrar suscripción en una estrategia transaccional/reconciliable. Tras registrar, reconciliar otra vez contra estado/eventos. El consumidor usa CAS pending→resolved y encola continuación en la misma transacción. Reconciliador periódico recupera eventos que ocurrieron antes o durante registro.

Deadline versus evento: vence cuando el reloj durable alcanza deadline y no existe hecho de dominio completado dentro del plazo. Consumidores de timeout verifican estado canónico antes de expirar. Persistir resolución única; un evento tardío se registra sin reabrir automáticamente run terminal. El operador puede crear una ejecución nueva.

Retención: no borrar eventos requeridos por consumidores pendientes. Para esperas de meses, estado de dominio + suscripción son suficientes y no requieren conservar todo el outbox indefinidamente. Evidencia de resolución y IDs se preservan con el run. Definir TTL por categoría y respetar borrado/retención de candidato en servicios existentes; no mantener PII ilimitada en snapshots. El cleanup del outbox solo elimina filas vencidas después de `published_at` y, para eventos de workflows, después de `automations_dispatched_at`; ambos consumidores son checkpoints independientes.

Delay distingue duración exacta (24 h) de día siguiente a hora local. Guardar zona IANA y wakeAt UTC calculado al entrar. Cambio posterior de zona del workspace no cambia esperas existentes. Hora inexistente por DST: siguiente instante válido; hora repetida: primera ocurrencia. Probar ambas. Fecha pasada: continuar inmediatamente mostrando motivo. Días hábiles inicialmente lunes–viernes sin feriados y etiqueta explícita; calendarios de feriados posteriores.

Recordatorios no son loops de grafo: job durable asociado a espera, máximo 3 envíos, intervalo configurable mínimo 1 h, se cancela al resolver. Si el requisito necesita otro comportamiento, modelar nuevos nodos/versión, no un bucle implícito ilimitado.

## 14. Aprobaciones, documentos y reuniones

### 14.1 Aprobaciones dentro de un run

Primera implementación admite usuarios concretos y selección de equipo solo si hay modelo real con membresía en Harly. Si no existe, implementar directorio/resolvedor de equipos en dominio antes de habilitar selector; no usar texto libre como equipo.

Resolver snapshot de elegibles al crear pendiente y revalidar membresía/scope al responder. Modo cualquiera: primera decisión válida resuelve. Modo todos: todos aprueban; un rechazo resuelve rejected. Cero elegibles → error operativo visible, nunca aprobación automática. Remoción deja pendiente bloqueado hasta reasignación o vencimiento; administrador autorizado puede reasignar con auditoría.

Rechazar pide motivo; aprobar puede incluir comentario opcional. Dos respuestas concurrentes usan CAS/locks para una resolución. Vencimiento cancela futuras decisiones. Mostrar quién aprobó, qué versión/datos vio y cuándo. No reutilizar aprobaciones al replay.

### 14.2 Documentos y firma

Extraer servicios sin sesión para solicitar/revisar/generar; server actions actuales pasan contexto autenticado y siguen usando el mismo servicio. Preservar checks de acceso existentes.

Para generación: empezar con plantillas/versiones de documento admitidas por Harly. Si no hay motor de plantilla reusable, P10 debe implementar schema de variables y generación versionada usando librerías ya presentes, con prueba de PDF/render y mapping de firmantes. No prometer composición arbitraria de documentos como primer incremento.

Enviar firma reusa `sendDocumentForEnvelope` o recorrido nativo. Nunca crear una segunda implementación de OTP/evidencia. Portal muestra Pendiente de firma/Firmado/Vencido y botón Revisar y firmar que entra al recorrido verificado existente. Acceso del candidato debe validar postulación y destinatario, no solo poseer packageId.

Completar paquete exige todos los documentos/recipients obligatorios de esa versión; incluir firmas internas si configuradas. Descargar, subir, revisar y firmar no son equivalentes. Reintentar envío recupera las mismas solicitudes cuando efecto ya existe.

### 14.3 Reuniones

Separar enviar enlace de reserva de agendar horario fijo. Para horario fijo comprobar zona, participantes, duración, conexión y disponibilidad; conflicto devuelve error explicable o salida de revisión, nunca mover silenciosamente. Mantener reconciliación del calendario y eventos rescheduled/canceled. Simulación no reserva calendario real.

## 15. Pruebas desde el producto

Asistente de Probar con tres pasos: Datos → Escenario → Resultado.

1. Datos: sample sintético por defecto; opcional seleccionar postulación accesible mediante búsqueda paginada, no los últimos 100 candidatos de todo el workspace. Mostrar evento normalizado y permitir campos de fixture permitidos. Congelar snapshot/hash al iniciar.
2. Escenario: respuestas simuladas de aprobación/firma/proveedor y reloj virtual. Botones Aprobar, Rechazar, Firmar documento, Avanzar 1 día o Ir al próximo evento según paso seleccionado. Ningún botón llama acciones reales.
3. Resultado: recorrido coloreado y etiquetado, valores resueltos, condiciones verdaderas/falsas, envíos que ocurrirían, requisitos faltantes. Resultados invalidan al cambiar hash del borrador y se marcan desactualizados.

Modo Simular es default y no hace writes de dominio ni red a proveedores; puede guardar resultado de simulación con TTL 7 días y contenido reducido. Compilador y evaluador compartidos con runtime; adaptadores de efectos sustituidos por fixtures, para evitar dos semánticas de motor.

Modo Verificar configuración: consultas read-only para permisos, recursos y conexión; distinguir “configurada” de “entrega comprobada”. No afirmar envío correcto por verificar existencia de credenciales.

Modo Prueba real controlada, ola 3: solo herramientas con supportsLiveTest, destinatario/recursos de prueba explícitos, resumen de efectos y confirmación. Runs mode=test separados de métricas productivas; IDs de prueba propagados a recursos. No incluir cambios de estado laboral o solicitudes de firma a candidatos reales como prueba predeterminada.

Simulador admite fallos parciales, ausencia de variables, expiraciones y error del proveedor. Sus resultados son explicación, no certificación de disponibilidad futura del proveedor.

## 16. API y operaciones de servidor

Server actions y REST deben delegar a los mismos servicios. Añadir contratos en `server/api/contracts/automations.ts` y regenerar OpenAPI con el script existente. Aplicar auth/rate limits/paginación de `@harly/api`; no inventar un framework paralelo.

| Operación           | Request esencial                         | Respuesta/error                                       |
| ------------------- | ---------------------------------------- | ----------------------------------------------------- |
| Crear               | name opcional, graph parcial             | id, draftRevision, status                             |
| Guardar draft       | expectedRevision, graph, layout          | revision/hash/issues; 409 si stale                    |
| Validar             | draftRevision                            | issues por nodeId/fieldPath y capabilities            |
| Publicar            | expectedRevision, approvedHash si aplica | versionId/version; 422 inválido                       |
| Pausar/reanudar     | workflowId                               | estado publicado; borrador intacto                    |
| Listar runs         | cursor, status, date, version            | items,nextCursor                                      |
| Detalle run         | runId                                    | versión, nodos, intentos, waits, resultados filtrados |
| Resolver aprobación | approvalId, decision, expectedState      | resolución única o 409                                |
| Retry/cancel/replay | runId, expectedState, motivo             | operación auditada y estado                           |
| Simular             | hash, fixture, escenarios                | simulationId,result                                   |

Conservar familia `/api/v1/automations` para recursos y agregar subrutas draft/validate/publish/approvals/simulations cuando su servicio esté listo. El versionado del JSON es schemaVersion=2, independiente de versión de API. No activar parcialmente endpoints que acepten v2 pero ejecuten v1.

Catálogo/capacidades devuelve disponibilidad por tool/version y requisitos faltantes sin secretos. Feature flag por workspace/engine; documentación describe explícitamente capacidades públicas habilitadas. Revisar callers AI mediante búsqueda en `lib/ai` antes de ampliar schemas: deben pasar por validación/publicación equivalente, sin bypass.

## 17. Permisos y operación

Mantener `automations:manage` compatible como agrupación legacy; introducir capacidades específicas read/edit/publish/operate según patrón central de permissions.ts, con migración explícita de roles. Aprobar un pendiente requiere elegibilidad y acceso al recurso, no necesariamente permiso de editar workflows.

El dueño de un workflow no obtiene acceso a todos los jobs del workspace por tener automations:manage. Reusar guards contextuales del ADR-003 para selector, run y herramienta. Leer historial tampoco debe filtrar PII fuera del scope.

Audit events: draft saved, approval requested/decided, published, paused/resumed, run cancelled/retried/replayed, ownership changed. Guardar IDs/hashes y actor, no cuerpos completos ni secretos. Redactar outputs por schema; enlazar documento mediante control de acceso existente.

Métricas: profundidad de cola, edad del pendiente más antiguo, tiempo hasta claim, runs waiting por tipo, errores por tool, reintentos, uncertain, leases vencidos y latencia de eventos. Integrar logger/cron-runs y observabilidad existentes. No usar IDs de candidato como labels de métricas.

Scheduler dedicado lógico `automations` con endpoint nuevo `app/api/cron/automations/route.ts`, `authorizeCron` y `startCronRun`. El cron de automations es el consumidor productivo de v2; el runner legacy sólo atiende compatibilidad histórica explícita. Endpoint ejecuta batches cortos; configurar frecuencia 10 s donde scheduler lo admita o 60 s como fallback declarado. UI muestra que esperas son programadas, no exactitud de milisegundos.

Objetivos iniciales de validación, no benchmarks ya obtenidos: 100 nodos/200 edges sin bloqueo perceptible en hardware de referencia; feedback local <100 ms; guardado p95 <1 s sin latencia proveedor; despertar p95 ≤2 ticks del scheduler bajo carga de prueba. Registrar hardware/dataset/volumen y ajustar antes de prometer SLA.

Runbook debe explicar scheduler detenido, cola atrasada, lease huérfano, proveedor incierto, miembro removido, firma recibida sin despertar y circuito abierto. Cada caso incluye consulta de diagnóstico, recuperación soportada y cómo verificar que no duplicó efectos.

## 18. Compatibilidad histórica y estreno v2

La decisión de lanzamiento es **v2-first**. La migración de datos v1 no forma
parte del proyecto de estreno porque no hay un inventario confiable de uso
activo que justifique convertir recetas o runs. Sí son obligatorias las
migraciones de esquema que crean las tablas y columnas que necesita v2; eso es
preparación estructural de la base, no una migración funcional de workflows.

1. Agregar schema v2 y columnas/tablas de forma aditiva; mantener lector/runner v1 para datos históricos.
2. Crear todas las definiciones nuevas como v2 desde el primer borrador y publicar sólo versiones de grafo v2. No convertir automáticamente definiciones ni runs antiguos.
3. Runs v1 existentes conservan su snapshot y `stepIndex`; no convertir IDs de efectos ni moverlos al runner nuevo.
4. Nuevos runs eligen v2 por la versión publicada. El dispatcher impide doble consumo mediante `engineVersion` y la unicidad del evento.
5. Desplegar lector compatible, worker v2, scheduler y builder. El estreno no depende de una migración masiva ni de que exista un volumen v1 que drenar.
6. Si aparece una instalación v1, se pausa o se opera explícitamente con el reader/runner histórico. No se la convierte silenciosamente ni se bloquea el producto nuevo.
7. Eliminar código legacy sólo después de observar producción y confirmar que ya no hay necesidad de soporte histórico; es una limpieza posterior, no un requisito para lanzar v2.

La compatibilidad histórica se valida con fixtures y consultas de lectura. No
se exige un job de conversión, backfill, doble escritura ni drenaje de runs v1
para declarar listo el estreno. La telemetría de instalaciones del CLI mide
instalaciones/adopción del CLI; no demuestra que existan definiciones o runs
v1 activos y no puede usarse como señal para migrarlos. Si una inspección
operativa de sólo lectura descubre datos v1 que requieran soporte, se abrirá
un ADR separado para decidir entre mantener el runner, exportar datos o
migrar casos concretos; esa decisión no se anticipa ni bloquea este
lanzamiento.

Migraciones: editar schema.ts → `pnpm db:generate` → revisar SQL/snapshot/journal → aplicar en DB aislada → `pnpm db:migrate` → generate sin drift → check de drizzle-kit. Commit conjunto. Verificar el upgrade estructural en una DB aislada con fixtures representativos; no exigir backfill ni conversión de workflows/runs v1. Probar rollback de aplicación manteniendo el esquema expandido. No editar migraciones aplicadas.

## 19. Matriz de verificación obligatoria

| ID  | Caso                                                                  | Nivel / evidencia                                                   |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| T01 | Cambiar job limpia stage en una única actualización y conserva job    | Browser + serialización guardada                                    |
| T02 | Guardar draft vacío/incompleto; publicar bloqueado con error por nodo | Servicio + browser                                                  |
| T03 | Edición mientras save está en vuelo no queda marcada guardada         | Browser con respuesta demorada                                      |
| T04 | Dos editores guardan expectedRevision igual; solo uno gana            | Integración PostgreSQL                                              |
| T05 | IDs/puertos/ciclos/unreachable/bindings de rama inválidos             | Tests puros del compilador                                          |
| T06 | Drag cambia layout; insertar/mover antes cambia conexiones            | Browser, persist/reload/undo                                        |
| T07 | Construcción íntegra por clic/teclado y foco al eliminar              | Playwright accesibilidad manual complementaria                      |
| T08 | Guardar borrador mantiene publicada ejecutándose                      | DB + evento + worker                                                |
| T09 | Publicación de revisión distinta invalida aprobación                  | Integración                                                         |
| T10 | Dos workers reclaman mismo run; lease vencido/fencing                 | DB real con dos conexiones                                          |
| T11 | Caída antes/después del efecto y antes/después del commit             | Harness de fault injection con proveedor fake idempotente           |
| T12 | Dos eventos iguales vs dos eventos independientes mismo candidato     | Outbox + dispatcher real                                            |
| T13 | Firma antes/durante/después de registrar wait                         | Integración con barriers deterministas                              |
| T14 | Firmas de otro paquete/postulación/workspace no resuelven             | Integración y autorización                                          |
| T15 | Timeout y firma concurrentes, resolución única                        | DB real y reloj controlado                                          |
| T16 | Aprobación doble, todos/cualquiera, removido, cero elegibles          | Servicio + browser                                                  |
| T17 | DST, duración 24h vs día siguiente, fecha pasada                      | Tests de calendario con zonas y transiciones                        |
| T18 | Reiniciar proceso durante espera; continúa una vez                    | Integración de worker separada de proceso web                       |
| T19 | Cancelar durante efecto no ejecuta siguiente ni revierte envío        | Integración                                                         |
| T20 | Simulación no muta dominio ni llama proveedor                         | Adapters que fallan si se intenta red/write                         |
| T21 | Acceso contextual a run/selector/portal/secret                        | Integración multi-workspace y scope por job                         |
| T22 | Lectura histórica legacy preserva recorrido y effects                 | Fixtures v1; verificación de compatibilidad, no gate de lanzamiento |
| T23 | Outbox cleanup conserva eventos no consumidos y waits reconciliables  | Integración retención                                               |
| T24 | Caso documental principal completo, incluidos negativos               | E2E con firma de prueba y proveedor fixture                         |
| T25 | 100 nodos/200 conexiones, lista paginada y SSE reconexión             | Perfil browser y prueba de recuperación                             |
| T26 | HTTP/email queued vs delivered, uncertain no reenvía ciegamente       | Contrato + integración proveedor fake                               |

Tests puros junto a módulos; integración propuesta `apps/web/src/features/automations/__tests__/integration/`; browser `apps/web/e2e/automations-builder.spec.ts`, `automations-document-flow.spec.ts`. Reusar provision.ts/db.ts existentes con dataset aislado. Registrar configuración DB de integración explícita antes de ejecutar; no depender de mocks para demostrar locking.

Comandos desde raíz: `pnpm --filter web typecheck`, `pnpm --filter web exec vitest run src/features/automations`, `pnpm --filter web exec playwright test e2e/automations-builder.spec.ts` con entorno e2e del repositorio correctamente provisionado. Añadir pruebas de servicios afectados y lint/build/documentación correspondientes; no afirmar suite verde si no se ejecutó.

## 20. Paquetes de trabajo ejecutables y dependencias

Cada paquete es una entrega revisable; tamaño de PR puede dividirse sin alterar orden de dependencias. No estimar días sin conocer equipo y disponibilidad. Mantener checklist con pendiente/en curso/verificado y evidencia.

### P01 — Baseline e inventario (primero)

Dónde: archivos actuales de sección 3, `docs/decisions/`, permisos, deploy/scheduler y tests.
Hacer: registrar worktree/diff; reproducir defectos vigentes; inventariar servicios de documentos/firmas/equipos/plantillas/calendario y callers AI; confirmar schema/retención; documentar capacidades reales y gaps. Verificar que app localhost corresponde al checkout antes de tomar capturas.
Salida: ADR de v2 PostgreSQL + grafo, mapa de permisos y checklist baseline. Aceptación: cada acción ola 1 tiene servicio identificado; cada supuesto documental tiene evidencia o tarea explícita. No necesita cambiar producto.

### P02 — Reparar contratos actuales (depende P01)

Dónde: TriggerPanel, registry/schema/data/actions, RunsTimeline, API/docs.
Hacer: actualización atómica de filtros, validar acción al publicar, restaurar listado tras fallo de borrado, conectar runs y explicar estado de API. No imponer config completa para guardar draft.
Pruebas: T01/T02 y regresiones vigentes. Aceptación: se puede construir, guardar e inspeccionar un flujo legacy sin filtros perdidos.

### P03 — Definición, draft y versionado (depende P01)

Dónde: `definition/*` nuevos, data/actions, DB schema/migrations.
Hacer: unión Zod v2, validador/compilador, CAS, draft separado, published pointer, hashes y aprobación ligada a revisión. Añadir legacy adapter y lectura dual.
Pruebas: T02/T04/T05/T08/T09 y T22 como compatibilidad histórica no bloqueante. Aceptación: editar no interrumpe publicada; API rechaza grafo inválido; publicación atómica; toda definición nueva nace en v2.

### P04 — Canvas y comandos (depende P03)

Dónde: WorkflowBuilder y nuevos `canvas/WorkflowCanvas.tsx`, `WorkflowNode.tsx`, `WorkflowEdge.tsx`, `CanvasControls.tsx`, `state/editor-reducer.ts`, `commands.ts`, `history.ts`, `layout.ts`.
Hacer: dependencias verificadas; modelo controlado; shell tres columnas; puntos/pan/zoom/handles/ELK; crear/mover/conectar/borrar/insertar/undo. Persistir layout separado.
Pruebas: T05/T06/T07/T25. Aceptación: construir condición de dos ramas y guardar/reabrir conserva estructura y posición.

### P05 — Biblioteca, inspector y guardado (depende P04)

Dónde: nuevos `ToolLibrary.tsx`, `WorkflowOutline.tsx`, `inspector/NodeInspector.tsx`, `BindingPicker.tsx`, `ValidationPanel.tsx`, `SaveStatus.tsx`; reutilizar primitivas UI.
Hacer: búsqueda, requisitos, formularios tipados, variables, errores, autosave single-flight, conflicto, drawers responsive y atajos. Sustituir selectores de listas masivas por consultas paginadas con scope.
Pruebas: T02/T03/T04/T07/T21. Aceptación: ningún error exige leer JSON; guardado no pierde ediciones concurrentes.

### P06 — Herramientas ola 1 y worker v2 (depende P03; UI integra tras P05)

Dónde: tools/\*, runtime/worker/advance/repository, cron nuevo y servicios de dominio.
Hacer: extraer handlers, contratos I/O, efectos idempotentes, estados, cuotas atómicas, cancelación, causalidad y timeline por intento. Integrar email/chat con entrega explícita.
Pruebas: T10/T11/T12/T19/T21/T26. Aceptación: grafo publicado ejecuta ramas y efectos reales de prueba una vez ante duplicados/reinicio.

### P07 — Timers y esperas de evento (depende P06)

Dónde: runtime/timers/events, tablas waits/receipts, server/events, cleanup y scheduler.
Hacer: calendario/IANA, recibos independientes, estado canónico, deadlines, reconciliación, retención y recordatorios acotados.
Pruebas: T13/T15/T17/T18/T23. Aceptación: workflow se detiene sin ocupar worker y continúa correctamente tras reinicio.

### P08 — Aprobaciones de ejecución y publicación (depende P07)

Dónde: runtime/approvals, servicios de definiciones, UI PendingWork/ApprovalDetail nuevos, notifications y permisos.
Hacer: resolver elegibilidad, cualquiera/todos, bandejas diferenciadas, vencimiento, reassign auditado y revisión de versión. Si faltan equipos, entregar selector de personas y tarea de dominio de equipos antes de habilitar equipo.
Pruebas: T09/T16/T21. Aceptación: ningún botón de solicitar aprobación queda sin destinatario/recorrido de resolución.

### P09 — Simulador y runs UI (depende P05/P06; waits después P07/P08)

Dónde: testing/simulator, builder/TestDrawer/SimulationTimeline nuevos, RunsTimeline y readers.
Hacer: reloj virtual, fixtures, escenarios humanos, grafo ejecutado, paginación, detalle, retry/cancel/replay y datos redactados. Compartir evaluador con runtime.
Pruebas: T20/T25/T26. Aceptación: se puede simular caso principal y explicar cada decisión sin efectos externos.

### P10 — Documentos, firma y portal (depende P07/P08/P09)

Dónde: documents/requests-actions/data y servicio nuevo si necesario; lib/esign finalización/providers; portal; tools/handlers/documents/signatures nuevos.
Hacer: paquetes versionados, plantillas y variables, solicitudes idempotentes, eventos after-commit, permisos de firmante, CTA portal y espera por paquete. Probar proveedor nativo y adapter externo habilitado.
Pruebas: T13/T14/T15/T18/T21/T24. Aceptación: demostración grabada o trazas del caso principal completo y cada salida negativa; sin manipular DB manualmente para avanzar.

### P11 — Reuniones, integraciones y catálogo ola 3 (depende P10)

Dónde: interviews/service, integraciones calendario, http handler, webhook ingress nuevo, registry de eventos, evaluaciones existentes.
Hacer: agenda/reserva separadas, HTTP estructurado y SSRF existente, conexiones, evaluación asíncrona, nuevos triggers y pruebas reales opt-in por herramienta. Webhook entrante con firma/token, esquema validado, límite de tamaño y dedup ID externo.
Pruebas: contratos por herramienta, autorización, timeouts y uncertain. Aceptación: cada herramienta cumple checklist sección 9.3 antes de hacerse seleccionable.

### P12 — Operación y lanzamiento v2 (depende P10; P11 puede publicarse después)

Dónde: flags/status, deploy/scheduler, observabilidad, API/OpenAPI/docs y legacy adapter.
Hacer: activar por workspace, runbook, métricas, dataset de carga, migración de esquema aditiva, lectura histórica v1, documentación congruente y rollback que conserve waits activos. El estreno no incluye una migración masiva de datos o runs v1; la compatibilidad se comprueba con fixtures y no condiciona la activación de v2.
Pruebas: matriz completa del alcance publicado, compatibilidad de lectura histórica y ausencia de doble consumo. Aceptación: soporte puede diagnosticar/reintentar sin editar filas; documentación sólo promete capacidades habilitadas y no exige convertir datos antiguos.

Trabajo paralelizable: P02 y P03 tras inventario; P04/P05 y P06 tras contrato P03; fixtures de P09 pueden prepararse con P05. No implementar handlers/documents finales contra contratos no acordados.

## 21. Definición de terminado y seguimiento

El primer lanzamiento completo exige P01–P10 y P12. P11 amplía catálogo y puede seguir por incrementos sin bloquear el flujo documental.

Checklist de cierre:

- [ ] Contrato/versionado publicado y ADR aprobado por revisión técnica del repositorio.
- [ ] Editor con puntos, pan, zoom, conexiones, arrastre, inserción, inspector y alternativa accesible.
- [ ] Draft persistente, conflictos y publicación independiente funcionando.
- [ ] Runtime durable verificado con DB real, carreras y recuperación.
- [ ] Aprobaciones dentro del flujo y revisión de publicación utilizables.
- [ ] Caso documental y portal completos, con pruebas de fallos.
- [ ] Simulación sin efectos y estados de entrega honestos.
- [ ] Runs/pendientes/versiones y operaciones visibles.
- [ ] Permisos contextuales y compatibilidad histórica comprobados.
- [ ] Scheduler, métricas, runbook y documentación alineados.

Para cada paquete, completar aquí o en tracker enlazado: responsable, dependencias satisfechas, PR/commit, pruebas y fecha, evidencia UI, estado de rollout y pendientes. No reemplazar una prueba fallida por “se ve bien”.

## 22. Decisiones fijadas y puntos de comprobación

Fijado por esta propuesta: canvas React Flow; auto-layout ELK; PostgreSQL durable; grafo acíclico con token único; draft separado; simulación default; firma correlacionada por paquete; servicios de dominio compartidos.

Defaults de producto: día siguiente calendario con zona workspace; aprobación cualquiera con deadline 48 h en plantilla; firmas 7 días; pausa solo nuevas entradas; cambio externo de etapa no cancela automáticamente run, pero cada acción revalida recursos/estado. Para detener por cambio de negocio ofrecer cancelación explícita y, posteriormente, política configurable versionada.

Puntos a verificar en P01 sin bloquear todo el trabajo: modelo real de equipos, generación de plantillas documentales, recorrido firma desde portal, frecuencia del scheduler por deployment, política actual de ownership/permisos, callers AI y volumen objetivo. Cada gap se resuelve con tarea de dominio identificada y criterio de aceptación; nunca se sustituye por un botón decorativo.

No hay garantía de “exactly once” para cualquier proveedor externo ni soporte arbitrario de código. El objetivo de extensibilidad se cumple cuando una herramienta nueva usa el contrato existente, obtiene errores/previews coherentes y opera con durabilidad e inspección equivalentes a las demás.

## 23. Instrucción de entrega a otra persona o agente

Texto sugerido para iniciar la implementación:

> Implementa Harly Automations conforme a docs/automations-product-plan.md en el worktree de automations. Lee las convenciones y ADRs indicados y ejecuta P01 antes de modificar el producto. Preserva cambios existentes. Usa los contratos, interacciones y criterios de aceptación del documento; distingue capacidades existentes de archivos propuestos. Entrega por paquetes en orden de dependencias y registra pruebas/evidencia. No sustituyas las esperas durables por timers en memoria ni la validación por apariencia visual. Si encuentras un servicio equivalente, reutilízalo y actualiza el mapa del plan. Si una decisión del plan contradice código o política vigente, documenta la discrepancia y resuélvela antes de implementar la parte dependiente. No declares completo un paquete con placeholders, mocks productivos o botones sin recorrido funcional.

Formato de registro por paquete:

```text
Paquete: Pxx
Estado: pendiente | en curso | verificado
Commit/PR:
Requisitos y casos Txx cubiertos:
Archivos existentes reutilizados:
Archivos nuevos:
Migración/compatibilidad:
Comandos ejecutados y resultado:
Evidencia del recorrido:
Desviaciones justificadas respecto del plan:
Pendientes que bloquean el siguiente paquete:
```

## 24. Registro de paquetes

- **P01** — verificado (inventario, sin cambio de producto). Ver
  `docs/automations-p01-baseline.md` y
  `docs/decisions/ADR-006-automations-v2-durable-graph.md`.
- **P02** — verificado. Filtros atómicos, draft incompleto, validar al publicar,
  restore de delete, Runs en el editor, API 410 explicada.
- **P03** — verificado (definición v2 + draft CAS + migración 0143_hot_union_jack).
- **P04** — canvas React Flow 12.11.6 + elkjs 0.12.0, comandos, layout persistido.
- **P05** — verificado para el alcance actual: biblioteca, inspector, canvas responsive, guardado CAS, validación, selectores hidratados por ID, controles de viewport, undo/redo, drag-and-drop y estados de guardado/conflicto están implementados y cubiertos por pruebas de UI/unitarias. La edición de listas JSON anidadas conserva ahora su estructura (solicitudes documentales y firmantes secuenciales) en vez de serializarla a texto; el inspector de firma expone el orden de hasta diez firmantes. Las mejoras de accesibilidad y nuevos bloques siguen el backlog evolutivo.
- **P06** — en curso: worker v2 productivo, leases, fencing, intentos por nodo, retries acotados y adaptador al registry real están implementados; acciones de reuniones ahora usan una frontera estricta de error/retry y reconciliación de ledger. La cancelación durante trabajo activo queda recuperable por un worker sucesor mediante un lease sólo de cancelación, sin invocar herramientas. Google Calendar, Teams, Zoom y Jitsi ya tienen recuperación específica ante respuestas perdidas; faltan pruebas de fault injection y validación E2E con cuentas proveedor reales.
- **P07** — en curso: delays, hora local, aprobaciones y waits de evento/documento sobreviven reinicios; la expiración de paquetes documentales por `dueAt` y la expiración de documentos nativos ya actualizan estado, auditan y despiertan el wait por la salida correcta; los recordatorios nativos son idempotentes por destinatario/día y el scheduler los ejecuta cada hora. La integración PostgreSQL cubre ahora deadlines de aprobación y recuperación de firma perdida; faltan otras expiraciones por estado canónico y cobertura E2E específica de reinicio/fecha límite.
- **P08** — verificado para el recorrido principal: votos cercados, snapshot durable de la política efectiva, reglas any/all, resolutores autenticados, reasignación cercada/auditada, nueva ronda sin votos heredados, bandeja de aprobaciones y ciclo E2E solicitud → aprobación por otro usuario → publicación están implementados. La integración PostgreSQL cubre ahora deadline, recuperación tras reinicio y reasignación con invalidación de votos; faltan pruebas de carga y casos browser específicos de deadline/reasignación.
- **P09** — verificado para el alcance actual: simulador graph-aware conectado al botón Test, con escenarios de éxito/fallo/espera incierta, fixtures configurables por paso, payload JSON, puerto de salida, código/retryable, providerRef, traza por nodo y reloj virtual reproducible; el E2E cubre la apertura de biblioteca, controles del canvas y simulación. Faltan escenarios browser más amplios para todos los tipos de bloque.
- **P10** — en curso: solicitudes documentales, portal, firma nativa/DocuSeal y continuación durable están conectados. Los nuevos `request_documents` crean un paquete durable versionado, con estado canónico y `packageId` para waits independientes; `generate_document` ya genera un PDF determinista con variables permitidas, layout seguro de párrafos/encabezados/listas/citas, lo registra como `documents` + `document_versions`, lo asocia a la postulación y reutiliza el resultado por `effectKey`; una acción posterior puede enlazar `documentId` y ejecutar la firma. La integración PostgreSQL aislada ya ejecuta el registry real desde el worker (`generate_document → add_note`), valida el PDF, el binding de salida y la reutilización sin duplicar documentos. El portal emite un capability nativo nuevo sólo después de validar sesión, candidato, aplicación y envelope; los datos legacy siguen siendo reconciliables. Los recordatorios nativos se emiten como outbox cifrado con deduplicación diaria y el scheduler los ejecuta cada hora. La firma nativa admite hasta diez firmantes secuenciales con campos por destinatario, PDF intermedio, evidencia por firmante y continuación sólo al completar el último. El E2E cubre el recorrido de firma y ahora también el de varios firmantes con tokens/campos aislados; la integración PostgreSQL cubre expiración nativa con auditoría y continuación. La biblioteca de plantillas reutilizables, el rich text sanitizado y los anexos PDF ordenables ya están conectados al builder/runtime; los anexos validan tenant, MIME, checksum y límite, y se incorporan como páginas etiquetadas. El renderer PDF conserva énfasis, cursiva, tachado, encabezados, bullets y enlaces `http/https` como anotaciones navegables; URLs inseguras se reducen a texto sin acción. El E2E del cron de expiración está verificado; falta un E2E que reinicie el proceso entre commit de expiración y recuperación.
- Actualización P10 2026-09-11: además de la biblioteca `workflow_document_templates`, `generate_document` soporta anexos PDF existentes congelados por checksum. El inspector permite añadir, quitar y reordenar hasta diez; el runtime no acepta archivos de otro workspace, no-PDF, inactivos o modificados desde la publicación. El render conserva estructura de bloques enriquecidos y agrega separadores etiquetados antes de copiar las páginas.
- Continuación de firma 2026-09-11: se cerró un escape de conexión DB en los efectos posteriores a la firma. La invitación al siguiente firmante, publicación de evento/webhook y reanudación del wait ahora reciben obligatoriamente la conexión usada por el worker; la reanudación ocurre solo después de la última firma. Dos pruebas verifican la conexión explícita y el orden de efectos; typecheck, ESLint enfocado, suite web (1.051 pasados; 59 omitidos por opt-in), build con configuración de prueba local y E2E candidato → firma nativa (1/1) pasan.
- Firma secuencial E2E 2026-09-12: el nuevo `e2e/native-signing.spec.ts` pasó (1/1). Desde la UI crea un documento, configura dos firmantes y firma campos distintos en el portal; comprueba que el segundo no se active antes, que cada enlace sólo devuelva campos del destinatario y que el primer token quede revocado después de firmar. El run tardó 2,5 minutos contra la base E2E aislada; typecheck, ESLint enfocado y `git diff --check` también pasaron. Suite Playwright completa pendiente.
- Auditoría de firma/espera 2026-09-11: el rollback de artefactos termina ahora en el límite del commit; un fallo post-commit ya no borra el PDF que la DB referencia ni convierte una firma guardada en respuesta de error. Cada follow-up falla de forma aislada y deja que continúen los demás. La firma nativa recupera `automationParentRunId` desde `signature_envelopes.workflowEffectId → workflow_action_effects.runId`, y lo conserva en el evento durable y webhook sin una nueva migración. Una integración PostgreSQL recorre dos firmantes reales, inyecta fallos de entrega de correo y de reanudación, verifica el artefacto persistido, y demuestra la recuperación del wait por el scheduler v2; el E2E browser secuencial pasó el 2026-09-12.
- **P11** — en curso: agendamiento, reprogramación/cancelación provider-aware, ofertas, Slack/Telegram/Discord, HTTP seguro y catálogo ampliado están conectados. La acción `send_booking_link` ahora usa la URL Cal.com del workspace, prellena candidato/email, agrega metadata de correlación y entrega mediante el outbox durable. `send_in_app_alert` crea una notificación interna durable, deduplicada por efecto y visible en tiempo real para un miembro válido del workspace. Las acciones de texto interpolan variables del workflow antes de persistir o enviar; los links de alertas se vuelven a validar después de interpolar. El editor expone detalles de tareas, destinatarios opcionales de correo/booking y título de entrevista; el formato legible de headers HTTP se normaliza al contrato estructurado del handler. Los webhooks externos ahora incluyen identidad/versionado estable, agregado y workspace, y exponen también eventos de tareas, jobs y correo; los transportes síncronos marcan resultados ambiguos como `uncertain` y no los reintentan automáticamente. La operación de runs permite reconciliar manualmente un efecto incierto con nota, referencia y payload opcionales, reanudar el grafo sin volver a invocar el proveedor y dejar auditoría. El trigger inbound `webhook.received` ya tiene endpoint por workflow, token hashado, HMAC cifrado, anti-replay, límite de payload, deduplicación y outbox transaccional. Faltan fault injection E2E para proveedores y nuevas integraciones con contrato completo.
- Endurecimiento webhook inbound 2026-09-11: el builder permite configurar/editar el JSON Schema del endpoint; el servidor valida Draft 7 antes de escribir receipt/outbox durable y responde 422 ante payload inválido. El ingress limita el body durante la lectura, exige content-type JSON, autentica antes de parsear y enlaza el ID externo del evento a la firma HMAC. Se verificó con pruebas unitarias del schema/ingress/ruta, un E2E de guardar-editar-recargar el schema, typecheck y la suite web completa (1.051 pasados; 59 omitidos por opt-in). No agrega tablas ni requiere conversión de datos v1.
- **P12** — en curso: scheduler dedicado y runbook de rollout están preparados; las nuevas definiciones nacen en v2 y una migración masiva de runs v1 no es requisito del estreno. Si aparecieran datos v1, se conservan mediante el lector/runner histórico hasta decidir su tratamiento; no se convierten silenciosamente. El endpoint Prometheus ya expone intentos v2 por acción/resultado, duración agregada, cola due, waits, inciertos y runs stale, y ahora hay alertas declarativas para inciertos/stale. La migración aislada local, el build y el E2E completo 3/3 están verificados. Falta ejecutar las migraciones de esquema 0143–0156 únicamente en el entorno productivo autorizado y completar la canary/observación productiva. El correo nativo de firma ya respeta la misma conexión explícita del worker, incluida la actualización final del outbox; queda pendiente la ventana operativa productiva, no una migración de datos v1.
- Actualización P06/P07 2026-09-11: las condiciones del runtime v2 ahora reciben explícitamente la conexión DB del run, evitando que un worker aislado lea accidentalmente la conexión global. Los fallos de carga/evaluación de contexto quedan persistidos como intentos retryable, liberan el lease con `retryNodeId` durable y vuelven a evaluar el mismo nodo con límite de `maxAttempts`; los fallos de autorización del adapter siguen la misma frontera normalizada. Las acciones reales de etapas, estado, entrevistas y ofertas, junto con el outbox de correo, el ledger de sincronización de entrevistas y el dispatch de eventos encadenados, reciben ahora la misma conexión explícita del worker. Las acciones de chat también propagan esa conexión a configuración, enriquecimiento, cola Slack, entregas, reintentos y revocación. El cambio de estado `active/withdrawn` ya usa el servicio transaccional compartido y emite `application.status_changed` durable, con actividad, webhook y protección anti-loop; `hired/rejected` también propagan el `parentRunId`. El replay operativo conserva la versión publicada v2, reanuda desde el nodo elegido y copia sólo predecesores dominantes completados, sin crear runs lineales accidentalmente. Se verificó con 34/34 escenarios PostgreSQL aislados y la suite web completa (1.030 pasados; 57 omitidos por opt-in). Las pruebas de fault injection del registry clasifican 5xx y timeout como `uncertain`, 429 como `retryable`, y confirman que Slack persiste usando la DB inyectada por el worker. Las excepciones desconocidas de adapters ahora también quedan en `uncertain` y requieren reconciliación, sin reintento automático. El runner lineal además queda cercado para reclamar únicamente runs `engine_version = 1`; un run v2 no puede caer en él aunque alguien lo invoque directamente. Si la lectura de la cola due falla por infraestructura, el cron ya no la convierte en una cola vacía: el error se propaga y la ejecución del scheduler queda registrada como fallida. La reasignación de aprobación elimina los votos de la ronda anterior dentro de la misma transacción fenced.

- Actualización UI 2026-09-11: los dropdowns del trigger, condiciones y adjuntos usan el mismo primitive accesible del inspector, con menú en portal y opciones legibles en pantallas compactas. Los campos de etapas, responsables, tags, selects, fechas y offsets permiten escoger un literal o vincular datos del evento/pasos anteriores; la selección estática queda bloqueada mientras existe un binding dinámico para evitar configuraciones ambiguas. El E2E browser completo volvió a pasar 3/3 después de estos cambios: biblioteca/canvas/simulador, gobernanza/publicación y flujo candidato → entrevista → oferta → firma nativa.
- Actualización de integridad v2 2026-09-11: `emitDomainEvent` y `emitWebhookEvent` comparten ahora la misma conexión DB explícita cuando el caller es el worker o una prueba aislada. Los guardados de metadata no pueden convertir silenciosamente un grafo v2 no lineal a la receta legacy; los cambios semánticos sin `graph` se rechazan con conflicto claro. El listado resume directamente nodos v2 —incluyendo branching, delays, approvals y waits— y cuenta acciones desde el grafo. Esto mantiene un único contrato de ejecución y evita que la compatibilidad histórica altere el diseño actual. La suite actual pasa 219 archivos y 1.031 tests; las pruebas de seam DB y Cal.com verifican que la conexión global no se use por accidente.
- Actualización de concurrencia v2 2026-09-11: el resolver de approvals renueva el lease, relee el snapshot vigente de elegibilidad y membresía, revalida el deadline con `clock_timestamp()`, inserta el voto y calcula el umbral dentro de una única transacción. La reasignación revalida dentro de esa misma frontera los miembros activos, el deadline y el execution vigente antes de eliminar votos y comenzar una ronda nueva. Una regresión PostgreSQL confirma que un voto tardío se rechaza y no se persiste aunque el scheduler todavía no haya reconciliado el deadline. Replay, retry manual y runs v2 disparados inmediatamente usan `clock_timestamp()` para no quedar temporalmente fuera de la cola por diferencias entre el reloj de aplicación y PostgreSQL. La integración aislada PostgreSQL pasa 35/35 después de estas carreras.
- Contrato catálogo/runtime 2026-09-11: para cada acción seleccionable, un test compara todos los campos configurables visibles del builder con el schema Zod del handler; evita ofrecer controles que el executor rechazaría por nombres de campo desalineados.
- Carrera de reanudación 2026-09-11: el worker relee el `logicalStatus` después de obtener el fence y antes de volver a aparcar un run. La consulta inicial puede observar `waiting` justo antes de que un resolver lo deje en `queued`; usar ese snapshot antiguo podía volver a aparcarlo y retrasar la continuación. La decisión de estacionar ahora usa únicamente el estado protegido por el fence actual.
- T04 CAS PostgreSQL 2026-09-12: el placeholder que pasaba sin DB fue sustituido por una prueba opt-in protegida para la base local `harly_automations_verify_*`. Dos pools independientes guardan concurrentemente el mismo `expectedRevision`; el test exige un único ganador, un `ApiError` 409 para el perdedor y que el grafo/revisión ganadores estén persistidos. Resultado observado: 1/1 pasó. Sin URL aislada, el caso queda explícitamente omitido; no se conecta a la base ordinaria ni a producción.
- Registro/reconciliación de esperas de evento 2026-09-12: el worker registra ejecución, intento, cursor del outbox y estado `waiting` en una única transacción. Los eventos con identidad posterior al cursor se reconcilian inmediatamente y en el cron durable, incluso si su dispatch ya fue confirmado; una entrega anterior al cursor no puede despertar una espera posterior, y el recurso se compara por identidad dentro del workspace. Migración estructural aditiva 0156 añade cursor e índices, sin convertir workflows/runs v1. La integración PostgreSQL aislada cubre cursor, evento previo, dispatch perdido, alcance por recurso, resolución única y repetición del reconciliador: 39/39 casos de runtime pasaron.
- Anexos PDF en el worker 2026-09-12: la integración PostgreSQL ejecuta `generate_document` por el registry real, valida checksum publicado, conserva ambas páginas del adjunto, agrega una portada divisoria y verifica cuatro páginas finales; regresiones separadas comprueban que un checksum cambiado falla y que otro workspace no puede aportar su PDF. No hubo cambio funcional porque los guardrails ya estaban implementados; se cerró el hueco de evidencia del servicio durable. Resultado tras añadir cobertura: integración runtime 42/42; suite Automations 32 archivos y 315/315 tests.
- Expiración documental E2E 2026-09-12: una prueba contra `harly_e2e` crea un wait v2 y un sobre nativo vencido; invoca el endpoint real `/api/cron/document-expiry`, verifica expiración del documento, void del sobre, destinatario/evento auditados y, desde un request separado a `/api/cron/automations`, confirma que el worker persiste `resolvedPort=expired`. 1/1 pasó. Esto prueba una nueva ejecución del scheduler con estado durable; no se etiqueta como reinicio real del proceso, que sigue pendiente.
- Alcance de estreno v2 actualizado 2026-09-12: no hay uso v1 conocido que justifique convertir definiciones o runs; no crear un proyecto de migración masiva, backfill o drenaje para lanzar. La telemetría de instalación del CLI mide instalaciones del CLI, no uso ni adopción de Automations. Si producto necesita medir Automations, definir instrumentación propia y respetuosa de privacidad para creación, prueba, publicación y ejecución, separada del gate técnico del estreno.
- Frontera REST de reuniones 2026-09-12: la ruta de efectos ahora conserva la conexión DB inyectada del worker en los ledgers de Google Calendar, Zoom, Teams y Jitsi. Los fallos de Calendar propagan también `strictSideEffects` y ya no se tragan en su fallback, para que el executor pueda reintentar la acción en vez de declararla completada con el efecto pendiente. Regresiones test-first verifican el DB explícito y el rechazo del fallo en modo estricto. Verificación sobre `harly_automations_verify_20260909` (157/157 migraciones): entrevistas + Automations, 345/345 tests, incluidas las 43 pruebas PostgreSQL opt-in; typecheck, ESLint enfocado, Prettier y `git diff --check` pasaron. Los fixtures únicos quedaron limpiados. Siguen pendientes fault injection E2E y validación con cuentas reales de proveedores.

### Avance 2026-09-09 — reconciliación de reuniones, reloj de simulación e inbox de aprobaciones

- Corrección operativa: el contenedor productivo ahora registra y ejecuta el
  job `automations` contra `/api/cron/automations`; antes el endpoint existía
  pero no estaba en la lista del scheduler. El diagnóstico `doctor` también
  exige una ejecución reciente de ese job.
- El trigger inbound `webhook.received` se selecciona desde el inspector, se
  crea desde el builder y se asocia a un endpoint existente. El `payloadSchema`
  Draft 7 se puede configurar y editar desde el inspector, se valida en servidor
  al guardar y se aplica después de verificar el HMAC y antes de crear el recibo
  durable. La URL y el secreto se muestran una sola vez; endpoints deshabilitados
  se pueden volver a habilitar desde el inspector. El HMAC cubre timestamp, ID
  idempotente y cuerpo raw; la ruta limita la lectura streaming a 256 KiB y no
  analiza JSON antes de autenticar.

- El editor conecta automáticamente un bloque recién agregado al puerto primario
  libre del paso seleccionado (o del último paso compatible), sin quitar la
  conexión manual, inserción sobre una línea ni ramificación explícita.
- React Flow se monta después de hidratar el tema para que el canvas no genere
  diferencias servidor/cliente; los paneles móviles incluyen descripción
  accesible. El límite de transiciones ahora persiste un fallo terminal y libera
  el lease, en vez de dejar un run aparentemente activo hasta que expire.
- La base local de desarrollo quedó reconciliada con el worktree: 155 entradas
  de migración y todas las tablas v2 presentes. La integración aislada cubre
  leases, recuperación, retries, delays, approval, eventos, documentos,
  expiración, firma y reconciliación incierta.
- El build canónico desde la raíz (`NODE_OPTIONS=--max-old-space-size=8192
pnpm build`) compila Webpack, TypeScript, páginas estáticas y las rutas de
  automations, cron, firma y webhooks. El build filtrado ejecutado desde
  `apps/web` no debe usarse porque busca `.env.local` relativo a ese paquete.

### Avance 2026-09-09 — acceso documental desde portal y recordatorios de firma

- El portal ahora permite revisar y firmar solicitudes documentales nativas desde
  la sesión autenticada de la aplicación. El servidor vuelve a comprobar
  workspace, candidato, aplicación, solicitud, documento y envelope antes de
  emitir el enlace; no expone ni reutiliza el bearer token original de correo.
- La emisión rota el capability almacenado como hash y conserva la expiración
  canónica del envelope. Una solicitud con upload `accepted` pero con firma
  pendiente continúa siendo accionable; sólo una solicitud completamente
  resuelta se presenta como checklist cerrada.
- `esign-reminders` reutiliza el outbox de correo cifrado, deduplica por
  destinatario y día, rota el capability antes de enviar y corre cada hora en
  el scheduler dedicado. No reenvía enlaces vencidos, completados o anulados.
- Cobertura añadida: endpoint de recordatorios, rotación portal, rechazo de
  estados completados/vencidos, headers de idempotencia y contrato de la nueva
  acción del portal. La integración contra PostgreSQL aislado ya fue repetida
  después de reconciliar la base E2E: migraciones completas aplicadas y
  recorridos durable/signing verificados sin errores de aplicación en los logs.

- Las acciones `schedule_interview`, `reschedule_interview` y `cancel_interview` pasan `strictSideEffects` desde el registry. Una respuesta negativa del proveedor se registra en `interview_syncs` y devuelve un resultado retryable al nodo, en vez de marcar la acción como exitosa por el solo hecho de haber guardado la entrevista.
- Un retry de la misma acción reconoce el `workflowEffectId`, vuelve a procesar sólo sincronizaciones fallidas y usa actualización/reemplazo cuando ya existe un recurso externo. Esto evita repetir una creación de Google Calendar, Zoom o Teams como si fuera una operación nueva.
- El simulador conserva efectos fuera de proceso y ahora agrega `virtualTime`/`waitedMs` a la traza. Los delays de duración avanzan el reloj de forma determinista; los delays a hora local calculan el próximo momento en la zona IANA validada. La UI Test permite fijar el inicio virtual y configurar por paso el resultado del proveedor, sin ejecutar red ni writes.
- La pantalla principal de Automations muestra las aprobaciones de ejecución que corresponden al usuario autenticado, con contexto mínimo del workflow/candidato, deadline relativo y botones conectados al resolver transaccional existente.
- Registro histórico de verificación: typecheck, ESLint, `git diff --check`, suite unitaria de web (216 archivos, 1.010 tests; 14 archivos y 50 tests skipped explícitamente), prueba PostgreSQL aislada del worker/registry (27/27) y build canónico desde la raíz. La verificación vigente está en el encabezado de este documento; el E2E 3/3 y la integración PostgreSQL aislada de firma quedaron verificados en iteraciones anteriores; el rollout productivo sigue requiriendo aprobación y ventana operativa.
- Corrección de consistencia 2026-09-09: la decisión de retry usa el `attemptNo` durable de `workflow_node_attempts`, no los claims de lease del run. Se añadió regresión para resolver waits/aprobaciones antes de una acción retryable. Los selectores ahora hidratan valores guardados por ID exacto. También se corrigió la recuperación de cancelaciones solicitadas durante una acción: el worker sucesor puede adquirir un lease de sólo cancelación, finalizar el run y no ejecutar el provider. Los webhooks ahora conservan compatibilidad y entregan envelope/headers con identidad y versionado estables, además de eventos de tareas, jobs y correo. La verificación de código pasa typecheck, ESLint y `git diff --check`; la integración PostgreSQL sólo es válida cuando se ejecuta contra la base aislada disponible.
- Consistencia documental 2026-09-09: `document_request_packages` separa la identidad de un paquete de sus items. `request_documents` crea/reutiliza por `effectKey`, devuelve `packageId`, y la resolución ya no mezcla solicitudes independientes de una misma aplicación. Upload, revisión, waive y cancelación recalculan el estado del paquete dentro de la transacción y despiertan la rama usando `packageId` (con fallback legacy a aplicación/documento); la expiración lo marca como `expired` y despierta la rama correspondiente. `db:generate` no produce drift, `drizzle-kit check` pasa y la migración aislada quedó verificada.
- Consistencia del simulador 2026-09-09: el Test tab ya no depende sólo de presets globales. Cada acción/espera puede tener resultado exitoso, fallido, incierto o ausente; el caso exitoso admite payload JSON, puerto de continuación y `providerRef`, y el fallo admite código y `retryable`. El servidor valida IDs, estados, JSON y puertos contra el grafo antes de simular. El inicio virtual se envía explícitamente para reproducir delays sin depender del reloj del servidor.
- Robustez posterior 2026-09-09: la recuperación de waits documentales también descubre paquetes terminales aunque se haya perdido el callback y el claim del scheduler los considera elegibles antes del deadline original. La bandeja de aprobaciones distingue pendientes de vencidas, el resolver rechaza decisiones posteriores al deadline y la reasignación conserva un snapshot de política, valida miembros y queda cercada/auditada. Telegram/Discord y `http_request` marcan timeouts, errores de red y respuestas `5xx` como `uncertain`; sólo respuestas inequívocamente reintentables, como `429`, mantienen retry automático. La suite unitaria completa, E2E y build quedaron verificados en esta iteración.
- Recuperación de firma 2026-09-10: el scheduler también descubre waits de documentos individuales en estado `signed`, `declined` o `expired` cuando se pierde el callback; la consulta vive en `runtime/due-runs.ts`, separada de los efectos del dispatcher, y cuenta con prueba PostgreSQL de recuperación por estado canónico.
- Reconciliación operativa 2026-09-09: un operador autorizado puede registrar el resultado de un efecto `uncertain`, referencia del proveedor, nota obligatoria y payload JSON para bindings downstream. La transición bloquea el run, actualiza el intento y el nodo de forma atómica, vuelve a poner el run en cola y ejecuta el worker v2 desde la evidencia persistida; no hace replay ni nueva llamada externa. La acción queda auditada y la UI explica explícitamente esa frontera.
- Continuidad de firma 2026-09-09: los waits documentales persistidos distinguen
  explícitamente `package` de `document`. El claim del worker y `resumeDue`
  despiertan ambos estados terminales aun cuando se perdió el callback de firma;
  los waits legacy sin tipo conservan auto-detección para no romper históricos.
- Builder v2 2026-09-10: se corrigió la frontera de serialización del inspector
  para que listas/objetos configurables lleguen como JSON válido al schema del
  registry. El bloque de firma ahora permite configurar visualmente hasta diez
  firmantes ordenados; vacío significa firmar sólo como candidato. Se verificó
  con tests del inspector/catalog, typecheck, ESLint y `git diff --check`.
- Document generation v2 2026-09-10: se añadió `generate_document` como primer
  formato ejecutable de plantilla textual. Rechaza variables desconocidas,
  renderiza un PDF paginado sin depender del browser, guarda una versión
  inmutable y protege retries con índice único por workspace/efecto. La
  generación usa la fuente Unicode Noto Sans ya incluida en Harly para soportar
  nombres y contenido internacional. Este registro describe el primer corte;
  la biblioteca reusable, el layout enriquecido básico y los anexos se añadieron
  en actualizaciones posteriores de P10.
- Verificación de ejecución documental 2026-09-10: la integración PostgreSQL
  aislada ejecuta el worker v2 con el registry productivo para generar un PDF,
  pasa su `documentId` mediante binding al siguiente nodo y repite el mismo
  efecto sin crear un segundo documento. El fixture usa una base efímera y un
  directorio de storage temporal; la base normal no se utiliza.
- Robustez temporal 2026-09-10: `next_local` ahora resuelve la hora local
  iterativamente y valida el round-trip de zona IANA. Las horas inexistentes
  durante el salto de horario de verano se omiten hasta la siguiente ocurrencia
  válida, y hay regresiones explícitas para el cambio DST de Nueva York.
- UX temporal 2026-09-10: al cambiar un delay a `next_local`, el builder
  inicializa el timezone IANA del perfil del usuario (con fallback validado a
  `UTC`) y lo persiste en el grafo. Así el placeholder no puede dejar un draft
  que parece configurado pero falla al publicar por faltar zona horaria.
- Biblioteca documental 2026-09-10: `workflow_document_templates` añade una
  biblioteca reusable workspace-scoped con CRUD protegido, archivado y
  auditoría. `generate_document` acepta `templateId` y el builder persiste un
  snapshot de id, nombre, título, contenido y formato dentro del nodo; editar o
  archivar posteriormente la biblioteca no altera un workflow ya guardado.
  El editor usa el rich-text existente, el servidor sanitiza el contenido y el
  renderizador PDF convierte el markup permitido a texto determinista. La
  migración generada es `0155_little_leech.sql`, verificada en una base aislada.
- Anexos documentales 2026-09-11: `generate_document` admite hasta diez PDFs
  activos existentes, congelados por `documentId` + checksum en el nodo. El
  inspector permite añadir, reordenar y quitar anexos; el runtime comprueba
  workspace, estado, MIME y checksum antes de leerlos y los agrega detrás de
  un separador etiquetado. La prueba de renderizado cubre el conteo de páginas.
- Verificación E2E 2026-09-09: `e2e/automations-builder.spec.ts` cubre la
  construcción por biblioteca, los controles del canvas, la simulación sintética
  y el ciclo gobernado de aprobación/publicación entre usuarios; `e2e/hiring-flow.spec.ts`
  cubre la firma nativa completa. Las tres pruebas pasan juntas contra
  `harly_e2e`; la cadena de 155 migraciones queda alineada y `db:generate` no
  detecta drift.
- Reconciliación de reuniones 2026-09-09: las creaciones y reemplazos externos
  ahora tienen una clave recuperable por operación. Google usa el ID de evento
  determinista; Teams llama `createOrGet`; Zoom busca un tracking field oculto
  exacto tras un error ambiguo, con máximo de cinco páginas; Jitsi devuelve la
  sala guardada antes de generar una nueva. Las pruebas de Zoom cubren la caída
  después del commit remoto y la recuperación sin segunda creación.

- Verificación de continuidad P05/P09 2026-09-12: entre 768 y 1279 px, `Steps` alterna correctamente del canvas al outline y de vuelta; Playwright lo recorrió a 1024×768. El simulador ahora recibe un body JSON propio para `webhook.received`, comprueba límites y el JSON Schema del endpoint ligado al workflow, y usa el mismo sobre de evento del ingress; el E2E cubre payload inválido y válido sin efectos externos. La suite `automations-builder.spec.ts` pasó 3/3; Vitest de Automations pasó 273 y omitió 38 pruebas PostgreSQL opt-in en esa ejecución; typecheck, ESLint enfocado, Prettier y `git diff --check` pasaron. No se añadió ni aplicó migración en este incremento.

### Avance 2026-09-08 — núcleo de ejecución compartido (P06/P09 en curso)

- `runtime/advance.ts`: decisiones deterministas por nodo, control de versión/cancelación, resolución de bindings con dominancia y lectura propia segura, salidas de error, resultados inciertos y finales con advertencias. Solicita efectos/esperas; no ejecuta proveedores ni presume durabilidad.
- `runtime/simulate.ts`: consume ese mismo núcleo sobre grafos compilados. Usa fixtures explícitos para efectos/resoluciones; si falta uno devuelve `needs_fixture`, no éxito ficticio. Condiciones reciben el evaluador del adapter. Traza cada decisión y limita pasos según tamaño del DAG. `runtime/simulation-fixtures.ts` centraliza presets reproducibles para que servidor y UI compartan la misma semántica.
- `definition/ports.ts`: contrato único de puertos para editor, validador y runtime. Corregida contradicción previa: espera documental ahora ofrece/exige completed/declined/cancelled/expired, no matched.
- Pruebas nuevas: `runtime/advance.test.ts`, `runtime/simulate.test.ts`, `definition/ports.test.ts` (26 casos). Incluyen ramas exclusivas compiladas, fallos/uncertain, cancelación, bindings falsy, fuentes fallidas, fixtures ausentes y puertos documentales.
- Registro histórico de la iteración inicial; no describe el estado actual. El adapter Postgres, el dispatcher/worker v2 y la interfaz de simulación ya están conectados y verificados. Las pendientes vigentes están en el registro canónico de P06–P12 de la sección 24 y en el runbook de rollout.
- Sigue vigente el alcance completo de P01–P12 y checklist de sección 21. Este avance no certifica esperas durables, documentos, firmas ni uso empresarial.

### Avance 2026-09-09 — worker v2 conectado y efectos protegidos (P06/P07/P08 en curso)

> Esta sección conserva el registro histórico de decisiones y evidencias de la iteración. El estado canónico de cada paquete está en la lista inmediatamente anterior y en `docs/automations-production-rollout.md`.

- `runtime/worker.ts` consume `advance`, `graphRunLeases`, `graphRunStore` y `graphNodeStore` en producción. `dispatchWorkflowEvent` y `dispatchDueWorkflowRuns` enrutan por `engineVersion`; publicaciones nuevas usan la versión de grafo inmutable y el cursor `entryNodeId`. Runs legacy siguen en `engine.ts`.
- El adaptador productivo resuelve `getActionHandler` del registry real, valida input, comprueba el permiso del actor versionado y ejecuta fuera de la transacción. El `effectKey` estable y `inputSnapshot` congelado acompañan cada llamada.
- Heartbeat cada 20 s renueva el lease. Si falla, aborta I/O cooperativo y no persiste un resultado tardío. Un worker sucesor marca intentos de fence anterior que quedaron `running` como `uncertain`; no reenvía acciones externas a ciegas.
- Retries conocidos persisten `retryNodeId`, crean un nuevo intento con fence nuevo, conservan evidencia anterior y aplican backoff acotado. Resultado `uncertain` queda detenido para reconciliación explícita.
- Migraciones nuevas: `0145_pink_monster_badoon.sql` (`retry_node_id`) y `0146_easy_smiling_tiger.sql` (`workflow_node_executions.retryable`). No se ejecutaron sobre la DB principal.
- Evidencia: `leases.integration.test.ts` pasa 12/12 contra PostgreSQL aislado: carrera de claim, takeover, fence, cancelación, ejecución v2, retry de proveedor y recuperación incierta.
- `runtime/worker.ts` ahora registra waits de duración, siguiente hora local IANA, aprobación y evento en PostgreSQL; libera el lease y reanuda por deadline o por resolver autorizado. La expiración utiliza puertos explícitos (`elapsed`/`expired`) y no timers en memoria.
- Las aprobaciones tienen votos únicos por ejecución/actor, reglas `any`/`all`, validación de miembro/elegibilidad y resolución cercada por lease. El evento de dominio se intenta resolver antes de crear nuevas entradas para evitar perder un wake-up.
- `0147_cynical_zodiak.sql` añade metadata durable de wait, estado de intento `waiting` y `workflow_approval_votes`; `drizzle-kit check` y una segunda generación no detectan drift. No se ejecutaron migraciones sobre la DB principal.
- Evidencia actual: `leases.integration.test.ts` pasa 14/14 contra PostgreSQL aislado: incluye delay, expiración y reanudación por evento, además de carrera de claim, takeover, fence, cancelación, ejecución v2, retry y recuperación incierta.
- Aún pendiente antes de llamar P06–P08 completos: reconciliación específica por `providerRef`, acciones de documentos/firmas y reuniones, bandeja/UI de aprobaciones, política de retry por nodo, métricas/alertas, y pruebas E2E de publicación/dispatch contra API.

### Compilador — segunda revisión 2026-09-08

- Índices de nodos/puertos/dominadores sin prototipo: IDs válidos como `constructor` no acceden ni modifican propiedades heredadas.
- El límite de 1 MiB se mide en bytes UTF-8; entradas circulares/no serializables producen un error de validación, no una excepción sin controlar.
- Las referencias `wait.resourceId` ahora tienen la misma comprobación de existencia y dominancia que inputs de acciones; se rechazan referencias propias o a nodos ausentes.
- Siete regresiones nuevas en `definition/compile-safety.test.ts`. Persistencia v2 sigue pendiente: inventario confirmado de `workflow_runs`, `workflow_run_steps`, `workflow_action_effects`; conservar históricos legacy y agregar cursor/fencing/nodos/intentos mediante migración generada, no reinterpretar índices de pasos existentes.

### P06 — reserva y resultados de nodos, 2026-09-08

- `runtime/node-store.ts` reserva ejecución e intento en una transacción corta que bloquea el run mediante renovación CAS. Exige cursor coincidente, workspace, worker, fence vigente y ausencia de cancelación. Los proveedores nunca se invocan dentro de esta transacción.
- Input y effectKey quedan fijos en la reserva. Repetir reserva devuelve la ejecución existente, no una nueva autorización para reenviar. `settle` exige intento running con el mismo fence; actualiza resultado de nodo e intento atómicamente y rechaza resultados tardíos/duplicados.
- Leases usan `clock_timestamp()` para no extender validez artificialmente por un timestamp congelado al comienzo de una transacción.
- `leases.integration.test.ts`: siete pruebas reales en DB aislada pasan, incluyendo reserva duplicada, input congelado, resultado inmutable, cursor incorrecto y takeover entre workers. Typecheck verificado.
- Pendiente inmediato: leer versión/contexto/resultados para `advance`, persistir transición de cursor/final bajo fence, implementar reconciliación de intentos running recuperados (sin reenvío ciego), política de retries y conectar dispatcher/worker. No activar ejecución v2 hasta cumplir estas condiciones.
