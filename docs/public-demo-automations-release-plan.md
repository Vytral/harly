# Release 0.2.0 — Automations: demo público seguro y preparación de release

**Estado:** plan de implementación y verificación.

**Ámbito:** worktree `release/0.2.0`.
**Decisión de producto:** el demo público es una visita guiada de sólo lectura con simulaciones curadas; **no** es un tenant ejecutable de Automations.

## 1. Resultado que debe existir antes del release

Un visitante del demo puede entender qué automatizaciones ofrece Harly, recorrer escenarios reales y ver resultados de una simulación controlada. No puede crear, modificar, aprobar, publicar, disparar, programar ni entregar una automatización. Tampoco puede configurar integraciones, secretos u OAuth que puedan abrir una ruta de salida.

La regla no depende de que la UI o el cliente se comporte bien: el servidor debe denegar esas capacidades en cada frontera de entrada y de ejecución. Una llamada manual a una Server Action, endpoint, webhook entrante, cron o worker no debe convertir al demo en un ejecutor de trabajos.

## 2. Contrato de capacidades

| Capacidad | Demo público | Workspace normal autenticado |
| --- | --- | --- |
| Leer una explicación y escenarios predefinidos | Permitido | Permitido |
| Ver una simulación fija, sin persistencia ni entrega | Permitido | Permitido |
| Enviar un grafo, URL, payload o fixture arbitrario al simulador | Denegado | Sujeto a las validaciones de producto |
| Crear, editar, borrar, importar o clonar workflows | Denegado | Permitido según RBAC |
| Solicitar revisión, aprobar, publicar, archivar o restaurar | Denegado | Permitido según RBAC y separación de funciones |
| Despachar eventos, ejecutar jobs, programar cron o reintentar | Denegado | Permitido bajo límites operacionales |
| Recibir webhooks de automatizaciones | Denegado | Permitido sólo con endpoint/token válidos |
| Entregar HTTP, email, Slack, calendario u otro efecto externo | Denegado | Permitido sólo con integración y políticas válidas |
| Configurar secretos, instalaciones OAuth o integraciones | Denegado | Permitido según RBAC |
| Proponer o aplicar cambios de AI a un workflow | Denegado | Propuesta a borrador, nunca publicación automática |

No debe existir una capacidad "casi permitida" en demo. Si una operación genera estado, consume cola, acepta entrada externa o puede producir una salida externa, se deniega por defecto.

## 3. Modelo de amenaza mínimo

| Riesgo | Ejemplo | Control obligatorio |
| --- | --- | --- |
| Abuso de ejecución recurrente | Un visitante crea un loop cada 11 segundos | El demo no persiste workflows ni permite scheduler, worker o dispatcher |
| Egreso y reputación de IP | Workflow envía POST masivos a un webhook | El demo no llega al motor de efectos; los adaptadores de egreso mantienen defensa en profundidad |
| Bypass de UI | POST/Server Action invocado desde DevTools | La autorización se aplica en servidor, antes de mutar o encolar |
| Bypass por evento interno | Cron, outbox, webhook entrante o reintento ejecuta un workflow demo existente | Todos los caminos de dispatch consultan la misma política central |
| Escalada por integración | Configurar OAuth, secreto o token y luego usarlo | Mutaciones de integraciones y callbacks sensibles se deniegan en demo |
| Simulación convertida en ejecución | El cliente aporta grafo o datos que activan herramientas | Sólo se acepta un identificador de escenario curado; el motor usa datos y herramientas permitidas explícitamente |
| Falsa confianza | La UI dice "enviado" aunque nada se entregó | La copia dice "simulación" y explica que no hay entrega, persistencia ni conexiones externas |
| Aprobación colusiva | Una persona solicita y aprueba su propia revisión | El aprobador debe ser distinto del solicitante/autora de esa revisión concreta |

## 4. Invariantes de diseño

1. **El servidor es autoritativo.** La condición de demo se resuelve desde el contexto de workspace/sesión confiable; nunca desde un flag enviado por el navegador.
2. **Deny by default.** Una capacidad nueva de Automations debe quedar denegada en demo hasta que se añada deliberadamente a la política y a pruebas.
3. **Una política central, varios puntos de aplicación.** No se reemplaza la política por una colección de `if` dispersos. Los adaptadores pueden conservar comprobaciones adicionales, pero comparten la decisión central.
4. **No hay trabajo durable en demo.** No se crean definiciones, versiones, ejecuciones, eventos de outbox, jobs, endpoints entrantes ni registros de entrega.
5. **No hay egress en demo.** Un resultado de simulación no puede invocar proveedores, HTTP arbitrario, correo, mensajería, calendario ni secretos.
6. **La simulación es determinista y acotada.** El input elegible es un ID de escenario interno; hay límites de tamaño, pasos y tiempo. No acepta un workflow ni URL controlados por el usuario.
7. **Separación de funciones se aplica por revisión.** La identidad del solicitante/autora relevante se persiste junto a la revisión y se compara en servidor antes de aprobar.
8. **El modo normal no se degrada.** Cada guardia se prueba en demo y en un workspace normal para evitar bloquear el producto real.

## 5. Arquitectura propuesta

### 5.1 Política de demo

Crear un módulo de dominio para capacidades de demo, cerca de la infraestructura existente de demo. Debe exponer una API pequeña y reutilizable, por ejemplo:

```ts
type DemoCapability =
  | "automation.read-curated"
  | "automation.simulate-curated"
  | "automation.mutate"
  | "automation.execute"
  | "automation.receive-webhook"
  | "automation.configure-integration"
  | "automation.ai-proposal";

isDemoCapabilityAllowed(context, capability): boolean;
assertDemoCapability(context, capability): void;
```

Los nombres definitivos pueden variar, pero la semántica no: en demo sólo se permiten explícitamente lectura curada y simulación curada. El error debe ser estable, no filtrar secretos y permitir a la UI mostrar un mensaje honesto. Conviene registrar una métrica/auditoría de denegaciones sin almacenar payloads sensibles.

La política se consulta:

- al principio de cada mutación de Automations y de Integrations relevante;
- antes de escribir eventos o jobs;
- antes de resolver un endpoint entrante;
- antes de que cron/worker/dispatcher reclamen, inicien o reintenten ejecución;
- antes de aplicar propuestas AI relacionadas con workflows;
- como defensa adicional al borde de cada proveedor de egreso.

No usar sólo una comprobación en el componente React, ni sólo en la ruta cron: ambos son evitables por caminos alternativos.

### 5.2 Experiencia del demo

`/dashboard/automations` debe ramificarse por el contexto de demo hacia un componente dedicado, no hacia el gestor productivo parcialmente deshabilitado. El componente incluye dos o tres escenarios estáticos de alto valor, por ejemplo:

- postulación nueva → asignación de recruiter → aviso interno;
- candidato sin respuesta → recordatorio → tarea de seguimiento;
- cambio de etapa → actualización de pipeline → resumen para el equipo.

Los escenarios son fixtures de código versionados, sin IDs de base de datos, URLs ni secretos. Al seleccionar uno se puede mostrar grafo, pasos y un resultado de **simulación**, pero no controles de editar, guardar, publicar, ejecutar, conectar, importar o clonar.

La pantalla debe declarar de forma visible:

> “Estás viendo una simulación segura. No se crean automatizaciones, no se envían mensajes y no se conectan servicios externos.”

El CTA debe invitar a crear/hostear un workspace propio para configurar la función completa. No debe prometer que el demo ejecuta integraciones.

Las rutas de detalle, creación y edición deben redirigir a la visita guiada o devolver una denegación consistente si se acceden directamente.

### 5.3 Aprobación independiente

La regla de publicación es insuficiente si sólo exige que `publisherId !== approvedById`. Debe modelarse quién solicitó la revisión o quién produjo la revisión exacta que se está aprobando.

Persistir en el registro/versionado que sustenta una aprobación, como mínimo:

- identidad del solicitante o autora de la revisión;
- identidad y momento del aprobador;
- versión/hash/revisión aprobada;
- estado y control de concurrencia existente.

Al aprobar, el servicio verifica que el aprobador no sea el solicitante/autora de esa revisión. Al publicar, el servicio exige una aprobación vigente del contenido exacto y aplica la separación que corresponda a la política acordada. No inferir el solicitante desde un campo histórico de creación si cualquier miembro puede modificar revisiones posteriores.

## 6. Fases de implementación

### Fase 0 — Congelar el contrato y mapear superficies

**Objetivo:** producir un inventario verificable antes de introducir guards.

1. Identificar el resolvedor confiable de `isDemoMode`/workspace demo y documentar sus garantías.
2. Enumerar todas las mutaciones, rutas REST, Server Actions, cron, webhooks entrantes, dispatcher, worker, reintentos y proveedores de egreso de Automations.
3. Mapear cada una a una capacidad de la política central.
4. Confirmar qué operaciones de demo actuales están basadas en DB y cuáles son sólo UI.
5. Registrar un baseline de pruebas y las limitaciones de entorno (por ejemplo, E2E que necesite Docker/Colima).

**Salida:** tabla de superficies con archivo/símbolo, capability, comportamiento demo y prueba asociada.

**Gate:** no comenzar Fase 2 sin que todas las entradas de ejecución y mutación tengan dueño.

### Fase 1 — Frontera de seguridad demo en backend

**Objetivo:** hacer imposible ejecutar o persistir Automations desde el demo, incluso sin UI.

1. Implementar la política de capacidades y errores de dominio.
2. Aplicar guards a CRUD, importación, revisión, aprobación, publicación, archivo, restauración y cualquier acción que escriba.
3. Aplicar guards a simulación dinámica, AI proposals, endpoints de gestión y APIs alternativas.
4. Aplicar guard antes de encolar o despachar; proteger dispatcher, cron, recuperador de jobs, reintentos y reconciliación.
5. Rechazar webhooks entrantes de Automations para el workspace demo antes de interpretar payload o buscar herramientas.
6. Conservar guards de proveedores como defensa en profundidad; no tratarlos como frontera primaria.
7. Confirmar que los guardias no dependen de cookies o datos controlados por cliente que puedan ser falsificados.

**Pruebas mínimas:**

- cada mutación representativa falla en demo y no escribe ninguna fila/evento/job;
- una llamada directa al dispatcher/cron para un workspace demo no inicia ejecución;
- webhook entrante demo no genera entrega ni invoca proveedor;
- AI proposal/apply no cambia borradores en demo;
- cada operación equivalente sigue funcionando en un workspace normal con permisos correctos;
- los tests inspeccionan efectos persistidos, no sólo la respuesta HTTP.

**Gate:** una prueba de integración aislada prueba que no existen jobs/efectos después de intentar cada entrada de ejecución demo.

### Fase 2 — Demo guiado, fiel y no persistente

**Objetivo:** entregar valor sin exponer capacidad operacional.

1. Implementar los fixtures de escenarios curados y una interfaz de selección accesible.
2. Conectar únicamente una simulación fija o un intérprete puro que no admita herramientas/egress.
3. Ramas de rutas y componentes: demo muestra la visita; workspaces normales conservan `AutomationsManager` y builder existentes.
4. Retirar/ocultar controles operativos del demo y proteger rutas profundas en servidor.
5. Añadir copia de transparencia, estado vacío y CTA de self-host/workspace propio.

**Pruebas mínimas:**

- render de los escenarios y del aviso de simulación;
- no aparecen botones/atajos operativos;
- navegación directa a nuevo/editar/publicar no permite mutación;
- la simulación muestra resultados de fixture y nunca una entrega externa;
- snapshot o interacción equivalente en un workspace no-demo conserva el builder normal.

**Gate:** un recorrido E2E pasa sin que se creen workflows, runs o outbox rows.

### Fase 3 — Gobernanza de revisión y publicación

**Objetivo:** impedir autoaprobación real y vincular la aprobación a contenido concreto.

1. Diseñar una migración aditiva para la identidad de quien solicitó/produjo la revisión y su relación con versión/hash.
2. Backfill seguro para registros existentes: si la procedencia no se puede determinar, el registro no es aprobable sin una nueva solicitud explícita.
3. Actualizar servicios y acciones para que todas las rutas de aprobación pasen por la misma comprobación de separación de funciones.
4. Mantener compare-and-swap/revisión/hash: editar el contenido invalida o deja obsoleta la aprobación anterior.
5. Al publicar, verificar aprobación vigente, mismo contenido y política de actores antes de cualquier transición de estado.

**Pruebas mínimas:**

- A solicita y A intenta aprobar → denegado;
- A solicita, B aprueba, A publica → permitido sólo si esa es la política explícita;
- A solicita, B aprueba, C modifica → publicación denegada hasta nueva aprobación;
- dos solicitudes/revisiones concurrentes no pueden cruzar aprobación;
- intentos por endpoint/acción alterna reciben la misma denegación;
- migración y rollback lógico se prueban contra PostgreSQL aislado.

**Gate:** el caso A/B/A y sus variantes adversarias están cubiertos por pruebas de servicio e integración, no sólo por test de UI.

### Fase 4 — Presupuestos de producción y resiliencia operacional

**Objetivo:** aun fuera del demo, reducir blast radius de configuraciones erróneas o abusivas.

1. Auditar y documentar los límites ya existentes: frecuencia mínima, máximo de ejecuciones, profundidad/lineage, tamaño de payload/respuesta, timeout, concurrencia, idempotencia, backoff y circuit breaker.
2. Para cada hueco confirmado, añadir límite por workspace y por workflow, no sólo por proceso worker.
3. Limitar destinos/proveedores a integraciones verificadas; no introducir HTTP arbitrario sin un diseño específico de allowlist, SSRF, DNS/IP, redirects, métodos, tamaño y rate limits.
4. Asegurar cuotas atómicas/durables para despliegues con múltiples workers.
5. Instrumentar métricas: denegaciones, jobs encolados, ejecutados, descartados por cuota, egress bloqueado y circuitos abiertos.
6. Definir alertas y un kill switch administrativo para pausar un workflow o workspace.

**Gate:** un test de carga controlado demuestra que exceder presupuesto no produce más ejecuciones/egress y que una instancia nueva no reinicia indebidamente el límite.

### Fase 5 — Validación de release y operación local

**Objetivo:** convertir cambios correctos en evidencia suficiente para un release.

1. Ejecutar chequeos estáticos y pruebas focalizadas del paquete web/Automations.
2. Ejecutar integración con PostgreSQL aislado para jobs, aprobaciones y ausencia de efectos demo.
3. Ejecutar E2E production-like con dependencias disponibles; si Docker/Colima no está disponible, declarar el gate pendiente, no marcarlo como aprobado.
4. Revisar el diff completo por rutas de bypass y regresiones de no-demo.
5. Probar manualmente el demo con DevTools/red y una cuenta normal separada.
6. Crear commits locales pequeños por fase. Mantener el PR en draft y no hacer push hasta alcanzar todos los gates obligatorios.

## 7. Matriz de verificación ejecutable

| Capa | Verificación | Evidencia esperada |
| --- | --- | --- |
| Estática | `pnpm --filter web typecheck` y `pnpm --filter web lint` | Ambos finalizan con código 0 |
| Pruebas de dominio | `HARLY_URL=http://127.0.0.1:3000 pnpm --filter web exec vitest run src/features/automations` | Tests nuevos y existentes verdes; skips explicados |
| Capacidades | `pnpm --filter web check:automation-capabilities` | Registro/contrato coherente y código 0 |
| PostgreSQL aislado | Suite de job/proposal/review/demo con DB efímera | Evidencia de cero job/outbox/run/entrega tras intentos demo |
| Rutas/acciones | Pruebas de integración de cada entrada pública | Misma denegación de política y cero efectos |
| E2E | Recorrido demo y workspace normal en build production-like | Demo no muta; normal no queda bloqueado |
| Revisión manual | Network/DevTools, URL directa, payload modificado | Ningún bypass de UI alcanza mutación o ejecución |
| Operación | Métricas/logs sin secretos, kill switch y documentación | Una respuesta accionable ante abuso |

Los comandos pueden ajustarse a scripts reales del repositorio, pero cada resultado debe conservarse con fecha, commit y entorno. Un test omitido por infraestructura es evidencia de un gate pendiente, no un éxito.

## 8. Criterios Go / No-Go

**Go** sólo cuando se cumpla todo lo siguiente:

- El demo es explícitamente una visita guiada y sólo ejecuta simulaciones curadas sin persistencia.
- Las entradas de mutación, ejecución, scheduler, webhook y AI están denegadas en servidor para demo.
- La prueba de efectos demuestra cero filas de trabajo/entrega tras intentos de bypass demo.
- La separación de aprobación es por revisión y no permite autoaprobación.
- Los límites de producción han sido auditados y los huecos P0/P1 resueltos o formalmente excluidos del release.
- Typecheck, lint, pruebas focalizadas, integración de DB y E2E aplicable tienen evidencia verde.
- El diff ha sido revisado y los commits siguen locales; el PR continúa draft hasta obtener esa evidencia.

**No-Go** si cualquiera de estas afirmaciones sigue siendo cierta:

- un visitante puede llegar al dispatcher, cron, job, endpoint entrante o proveedor mediante una ruta alternativa;
- el demo acepta un workflow, URL o payload libre para simular/ejecutar;
- una aprobación puede ser creada por quien la solicitó/autorizó para esa revisión;
- los recorridos de demo muestran entrega o publicación que no ocurrió;
- E2E o integración requerida no se ejecutó y no hay una decisión explícita de posponer el release.

## 9. Handoff para otro agente

1. Leer este documento completo, `AGENTS.md` y el estado actual de git antes de editar.
2. Usar CodeGraph si el índice corresponde al worktree; si no, indicar la discrepancia y usar búsquedas acotadas.
3. Elegir una fase completa y no mezclar cambios de UI, política de ejecución y gobernanza en el mismo commit salvo que un contrato compartido lo exija.
4. Añadir primero una prueba que reproduzca el bypass o comportamiento faltante; implementar el cambio mínimo que la haga pasar.
5. Ejecutar los chequeos pertinentes y reportar comando, resultado y limitaciones reales.
6. No hacer push, no publicar PR y no borrar cambios de otros autores. Usar commits locales convencionales, sin coautorías.

## 10. Fuera de alcance de este plan

- Habilitar automatizaciones ejecutables para visitantes públicos.
- Permitir webhooks/HTTP arbitrarios como atajo de demo.
- Reemplazar la política de seguridad por rate limiting sólo del frontend o proveedor.
- Declarar listo un release sólo con pruebas unitarias si faltan las rutas de integración/E2E requeridas.
