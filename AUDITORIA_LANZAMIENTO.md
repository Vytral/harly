# Auditoría de lanzamiento — Harly

Documento persistente para evaluar qué falta antes del primer lanzamiento de Harly como ATS open source self-hosted. No es un backlog de deseos: cada hallazgo debe incluir evidencia, impacto, recomendación y estado.

## Criterio de salida

Harly puede lanzarse cuando el flujo principal de candidato y reclutador funciona de extremo a extremo, no existen hallazgos críticos abiertos de seguridad/aislamiento, y la instalación self-hosted queda reproducible y observable.

Estados: `pendiente` · `en revisión` · `bloqueado` · `resuelto` · `aceptado para después del launch`.

## Fase 1 — Flujos ATS centrales

Estado: `en revisión` — recorrido de código completado; falta validación E2E y visual.

Alcance inicial: `apps/web/src/features/` y las rutas/API directamente relacionadas.

### Candidato y postulación

- [ ] Publicación y despublicación de puestos; visibilidad correcta en career page/API pública.
- [ ] Aplicación completa: validaciones, preguntas, CV, almacenamiento, idempotencia y mensajes de error.
- [ ] Confirmación al candidato y notificaciones internas.
- [ ] Detección de duplicados: comportamiento manual/automático, falsos positivos y recuperación.
- [ ] Portal de candidato: autenticación, perfil, estado de aplicación y privacidad.
- [ ] Importación, edición, eliminación/restauración y retención de candidatos.

### Pipeline y colaboración

- [ ] Creación/edición de etapas y orden de pipeline por puesto.
- [ ] Mover una candidatura: permisos, concurrencia, historial, notificaciones y efectos secundarios.
- [ ] Vistas board/lista; filtros, búsqueda, paginación y estados vacíos.
- [ ] Notas, menciones, actividad y auditoría con aislamiento por workspace.
- [ ] Equipo de contratación, roles y permisos efectivos en cada acción.
- [ ] Talent pool: asignación a puesto, deduplicación y procedencia.

### Entrevistas y calendario

- [ ] Programar, reprogramar y cancelar desde candidato y pipeline.
- [ ] Validar zona horaria, disponibilidad, entrevistadores y conflictos.
- [ ] Sincronización Google/Outlook/Zoom/Cal.com: degradación cuando no están configurados.
- [ ] Invitaciones, enlaces de videollamada, recordatorios y estados posteriores a la entrevista.
- [ ] Scorecards/evaluaciones: permisos, consistencia y visibilidad.

### Comunicación y ofertas

- [ ] Plantillas y envío de correo: render, destinatario, adjuntos, fallos y reintentos.
- [ ] Inbox IMAP/SMTP: configuración, polling, deduplicación, adjuntos, respuesta y aislamiento.
- [ ] Replies webhook legacy: compatibilidad con Inbox y no pérdida de mensajes.
- [ ] Ofertas: creación, aprobación si aplica, envío, aceptación/rechazo/retiro e historial.
- [ ] Acciones asistidas por IA: siempre manuales, editables y con manejo seguro de errores.

## Fase 2 — Seguridad, datos y APIs

Estado: `en revisión` — autorización/API/secretos auditados; retención, backup y restauración requieren validación operacional en Fase 4.

- [ ] Autorización por workspace en acciones, server actions, rutas y descarga de archivos.
- [ ] Roles personalizados, owner/admin y permisos mínimos.
- [ ] Secretos cifrados, logs sin datos sensibles y rotación/configuración segura.
- [ ] Webhooks, cron y API pública: autenticación, replay/idempotencia, rate limiting y errores.
- [ ] Migraciones, integridad referencial, índices críticos, backup/restore y borrado de datos.
- [ ] Privacidad: consentimiento, retención, exportación/DSAR y portal del candidato.

## Fase 3 — Producto, diseño y accesibilidad

Estado: `en revisión` — auditoría profunda estática completada en cuatro subfases; el cierre requiere recorrido visual autenticado y en breakpoints reales.

Subfases de diseño completadas:

- **3A · Sistema visual:** tokens, tipografía, dark mode, primitives, contraste y motion.
- **3B · Consola recruiter:** sidebar/topbar, dashboard, candidatos, pipeline, calendario, Inbox y settings.
- **3C · Experiencia candidata:** career pages, job board, postulación, onboarding y portal.
- **3D · Accesibilidad y responsive:** teclado, foco, diálogos, objetivos táctiles, estados y matriz de validación.
- **3E · Validación renderizada:** pendiente; requiere runtime reproducible de F4 y runner visual/a11y de F5.

- [ ] Navegación, layout, responsive 320/768/1024/1440 y estados de carga/error/vacío.
- [ ] Consistencia de componentes, tipografía, densidad, contraste y jerarquía de información.
- [ ] Accesibilidad por teclado, foco, labels, diálogos y lectores de pantalla.
- [ ] Flujos largos: feedback de guardado, optimismo, errores recuperables y prevención de pérdida de datos.
- [ ] Career page, portal e inbox: calidad visual, branding y contenido realista.

## Fase 4 — Self-hosting y operación

Estado: `en revisión` — runtime Docker Compose validado en instalación temporal aislada; falta RC limpio final y smoke autenticado/cloud.

- [x] Docker Compose desde cero: base de datos, storage, migraciones y app. Validado en instalación temporal aislada el 2026-07-18.
- [x] CLI/wizard: variables, generación de secretos, admin inicial, dominio y health checks. `npx @harly/cli` detecta instalaciones hijas y evita ofrecer una instalación nueva.
- [ ] Scheduler instalable: mailbox sync cada 2 min, webhook retries y mecanismo Docker/systemd/Kubernetes.
- [x] Documentación: requisitos, upgrade, backup, restore, plataformas cloud y seguridad. Requiere mantenimiento por release.
- [ ] Observabilidad: logs estructurados, estado de integraciones, alertas y diagnóstico.
- [ ] CI: typecheck, tests, build, migraciones y smoke/E2E del flujo crítico.

## Fase 5 — Go/no-go

Estado: `en revisión` — ya existe runtime reproducible; falta completar RC limpio de backup/restore/update y el escenario ATS autenticado.

- [ ] Ejecutar escenario E2E: publicar puesto → aplicar → revisar → mover pipeline → entrevista → evaluación → oferta → cierre.
- [ ] Ejecutar escenario de fallo: storage/email/integración/cron caídos y recuperación.
- [ ] Resolver o aceptar explícitamente cada hallazgo crítico/alto.
- [ ] Publicar changelog, licencia, guía de contribución y canal de soporte/security contact.
- [ ] Release candidate en instalación limpia self-hosted.

## Registro de hallazgos

| ID | Fase | Severidad | Evidencia | Recomendación | Estado |
| --- | --- | --- | --- | --- | --- |
| F1-01 | Pipeline | P0 | `features/pipeline/actions.ts:233-271, 413-516`: valida la etapa destino por workspace, no por el puesto de la candidatura. | Validar `jobStages.jobId === applications.jobId` atómicamente en movimientos individual y masivo; cubrir cruce entre puestos. | Completado ✅ |
| F1-02 | Puestos públicos | P0 | `features/jobs/data.ts:220-235` sólo marca `deletedAt`; las lecturas públicas y la creación de postulación no lo filtran. | Excluir `deletedAt` de cada lectura/intake público o cerrar el puesto al enviarlo a papelera; E2E papelera → 404/no postulación. | Completado ✅ |
| F1-03 | Autorización ATS | P0 | Acciones de pipeline, entrevistas, scorecards, notas y email sólo obtienen contexto; no aplican los permisos granulares definidos. | Exigir permiso por mutación (`candidates:move`, `collab:write`, etc.) y pruebas negativas para roles custom. | Completado ✅ |
| F1-04 | Integraciones OAuth | P0 | Install/callback de Google, Outlook y Zoom no exigen `integrations:manage`; state no queda ligado a sesión/uso único. | Proteger instalación/callback, state one-time asociado a usuario/workspace y pruebas de escalación/replay. | Completado ✅ |
| F1-05 | Inbox canónico | P0 | Inbox lee `mailThreads/mailMessages`; Replies continúa leyendo `candidateMessages` en una vista paralela. | Unificar el modelo/vista o migrar compatiblemente Replies a filtro/acceso del Inbox, sin perder estados ni adjuntos. | Completado ✅ |
| F1-06 | Inbox RBAC | P0 | `features/mailbox/actions.ts:12-50` archiva, marca leído y envía SMTP sin `requirePermission`. | Autorizar lectura/mutación/envío explícitamente y probar acceso por rol y workspace. | Completado ✅ |
| F1-07 | Repostulación | P1 | `features/applications/data.ts:180-261`: actualiza/crea candidato antes de detectar candidatura duplicada. | Comprobar duplicado antes de mutar o definir la actualización consentida; excluir candidatos eliminados de forma explícita. | Completado ✅ — ya comprueba el duplicado antes de mutar; cubierto por `src/features/applications/create-public-application.test.ts` (rechaza la aplicación duplicada y no invoca `update`/`insert` sobre el candidato). Falta política explícita para candidatos eliminados de forma explícita. |
| F1-08 | Historial pipeline | P1 | El movimiento persiste/publica la etapa actual leída de BD. Movimientos individual, masivo y reordenamiento comparan `updatedAt`; un conflicto revierte la transacción. | Usar el estado leído de BD y añadir control de concurrencia para drag-and-drop. | Completado ✅ — el movimiento compara `updatedAt` y revierte la transacción en conflicto. Cubierto por `src/features/pipeline/move-concurrency.test.ts` (rechaza el move cuando el `updatedAt` ya no coincide, y lo completa cuando no hay modificación concurrente). Falta escenario de concurrencia a nivel BD en F1-19/F5. |
| F1-09 | Talent pool | P1 | `features/pool/actions.ts:180-257` permitía asignar a un puesto draft/cerrado. | Exigir puesto abierto, transacción y manejo de conflicto único/reintento. | Completado ✅ — exige `open` (WHERE descarta draft/closed), inserta candidatura+historial en una transacción con `onConflictDoNothing` idempotente; cubierto por `src/features/pool/assign.test.ts` (rechaza puesto closed/draft, rechaza duplicado y crea en transacción). |
| F1-10 | Entrevistas video | P1 | `features/interviews/actions.ts:268-357` creaba Meet, Teams y Zoom si coexisten; correo usaba ubicación, no enlace creado. | Seleccionar un proveedor por entrevista, persistir enlace determinista y enviarlo tras crearla. | Completado ✅ — prioridad Zoom → Teams → Meet, espera la persistencia y usa `meetLink` en el correo; cubierto por `src/features/interviews/schedule.test.ts` (un solo proveedor seleccionado, sin crear Meet/Teams cuando gana Zoom). |
| F1-11 | Reprogramación | P1 | Reprogramar/editar sólo sincronizaba Google Calendar; Teams/Zoom quedaban desfasados. | Implementar update/cancel para todos los proveedores y probar cambio de horario/modalidad. | Completado ✅ — `rescheduleInterview` y `updateInterview` recrean Teams/Zoom cuando cambia fecha, duración, modalidad o título; cubierto por `src/features/interviews/schedule.test.ts` (reprogramar cancela y recrea la reunión de Teams, sin tocar Zoom). |
| F1-12 | Conflictos | P1 | Disponibilidad externa sigue siendo advertencia, pero ya no es la única protección. | Revalidar en servidor/intervistador y definir política explícita de bloqueo o confirmación. | Completado ✅ — el servidor bloquea solapamientos de entrevistas `scheduled` del mismo entrevistador; disponibilidad de calendario externo queda como advertencia. Cubierto por `src/features/interviews/schedule.test.ts` (rechaza interview que solapa una `scheduled` del mismo entrevistador). Falta definir política explícita de bloqueo vs. confirmación para disponibilidad externa. |
| F1-13 | Ofertas | P1 | `features/offers/actions.ts:304-369,398-410,530-560`: pasa a sent antes de entrega, sin outbox/reintento ni validación de caducidad. | Outbox/estado de entrega recuperable y bloquear decisiones sobre ofertas vencidas. | Completado ✅ — `email_outbox` durable se inserta antes de la entrega; una oferta sólo pasa a `sent` al aceptar el proveedor y los fallos quedan pendientes con retry programado. Cubierto por `src/features/offers/send.test.ts` (inserta outbox antes del envío, marca `sent` sólo en éxito, deja pendiente+retry en fallo). Falta un worker/scheduler para consumir pendientes — bloqueado por F4-03. |
| F1-14 | Entrega de comunicaciones | P1 | Confirmaciones de postulación y correos de pipeline se lanzan con `void` (`applications/notifications.ts:21-65`, `pipeline/actions.ts:361-375`). | Outbox persistente, reintentos/alertas e idempotencia; no depender de tareas efímeras. | Completado ✅ — `sendApplicationReceivedEmails` y `sendPipelineEmails` ahora encolan filas duraderas en `email_outbox` (kinds `application.received.candidate`, `application.received.recruiter`, `pipeline.stage`, `pipeline.rejected`) y delegan la entrega a `processEmailOutbox`, reutilizando la misma infraestructura que F1-13 (ofertas). Los fallos de proveedor quedan `pending`/`failed` y se reintentan vía scheduler (F4-03). `outbox-processor.ts` añade los cuatro `deliver*` con idempotencia. Cubierto por `src/features/applications/notifications.test.ts` (enqueue + kinds + procesamiento) y `src/features/offers/send.test.ts` (patrón). Falta worker scheduler (F4-03) y E2E de entrega (F1-19/F5). |
| F1-15 | Inbox funcional | P1 | Adjuntos IMAP se almacenan pero no se exponen; crear candidatura/IA/vincular/asignar siguen incompletos o placeholder. | Añadir descarga autorizada, vínculo/creación editables, candidatura, owner e IA manual confirmable. | Parcial ⚠️ — adjuntos IMAP ya aparecen en el read model y se descargan mediante una ruta privada con RBAC/workspace; creación de candidato y vínculo seguro de hilo a una candidatura del mismo candidato están disponibles. Falta exponer selectores de vínculo/owner en la UI e IA manual confirmable. |
| F1-16 | Canal de correo | P1 | Candidate timeline usa provider/`candidateMessages`; Inbox usa SMTP/`mailMessages`, sin sincronización bidireccional. | Definir transport y modelo canónicos; mantener compatibilidad con inbound legacy y notificar nuevos IMAP. | Completado ✅ — `mailThreads`/`mailMessages` es el modelo canónico; inbound legacy y outbound de candidatos ya escriben allí, timeline/replies leen allí, `candidateMessages` queda archivada, y `harly migrate:mail-unification --dry-run`/ejecución real migran históricos de forma idempotente y tolerante a huérfanos. `source` + `mailboxId` tienen constraint DB, `conversationId` vincula cruces provider/IMAP y los adjuntos reutilizan metadata/storage keys. |
| F1-17 | Seguridad IMAP | P1 | Sync descarga adjuntos sin límites/tipo/saneamiento y silencia errores de adjuntos/Sent. | Límites y validación de adjuntos, estado/reintento visible y pruebas de errores parciales. | Parcial ⚠️ — límite de 25 MB, allowlist MIME y saneamiento de nombre cubiertos con pruebas; falta estado/reintento visible de fallos parciales y copia Sent. |
| F1-18 | Escala/UX Inbox | P2 | Carga 100 hilos + 500 mensajes globales y filtra en cliente; filtros no respetan “Assigned to me” ni estados. | Consultas paginadas/filtradas en BD, preview y filtros semánticamente correctos. | Completado ✅ — `features/mailbox/data.ts` pagina 40 hilos, filtra en PostgreSQL (incluye `Assigned to me`, estados, unread, candidatos y replies), obtiene preview desde el último mensaje y sólo carga mensajes/adjuntos del hilo seleccionado. La UI navega por `filter/page/thread` y ofrece “Load more”. `pnpm --filter web typecheck` y `pnpm --filter web test -- src/features/mailbox` pasan. |
| F1-19 | Cobertura de flujo | P1 | 52 tests verdes son de validación/utilidades; no hay tests de pipeline, inbox, entrevistas, ofertas, OAuth o permisos. | Añadir integración/E2E de los hallazgos F1-01…17 antes de release candidate. | pendiente |
| F1-20 | Privacidad del portal | P0 | `app/(portal)/portal/applications/[applicationId]/page.tsx:95-112,293-300` selecciona y renderiza `interviews.notes` al candidato, sin campo de visibilidad/filtro. | Separar notas internas de contenido candidato, privado por defecto, y prueba negativa de no exposición. | Completado ✅ |
| F1-21 | Postulación desde portal | P1 | `portal/JobApplyForm.tsx:196-240` degrada preguntas select/radio a texto; `portal/actions.ts:95-198` no valida configuración, requeridos, tipos, consentimiento ni CV obligatorio. | Unificar schema/servicio con la postulación pública y cubrir todas las variantes. | Completado ✅ — valida servidor contra preguntas/configuración persistida (requeridos, minLength, select, URL y CV aislado por workspace), descarta claves no configuradas y registra consentimiento. Cubierto por `src/features/portal/application-validation.test.ts` (rechaza CV requerido, respuestas select inválidas y descarta claves no configuradas; acepta sólo respuestas configuradas con CV aislado por workspace). |
| F1-22 | Visibilidad de estado en portal | P1 | Dashboard respeta `portalShowApplicationStatus`, pero detalle de postulación carga y muestra etapas sin leer esa preferencia (`portal/applications/[applicationId]/page.tsx:86-93,168-223`). | Aplicar la misma política en cada ruta del portal y E2E de la configuración. | Completado ✅ — el detalle de postulación ahora lee `workspaceSettings.portalShowApplicationStatus` y oculta el panel de etapas (y colapsa la rejilla a una columna) cuando la preferencia es `false`, igual que el dashboard. Cubierto por la misma política que `portal/dashboard/page.tsx:59,65,187`. Falta E2E de la configuración (F1-19/F5). |
| F1-23 | Onboarding e invitaciones | P1 | El rol elegido en onboarding no se persiste; invitaciones usan `Promise.allSettled` sin resultado/recuperación visible (`OnboardingWizard.tsx:103,154-189`). | Persistir/eliminar la pregunta y mostrar fallos/reintento de invitaciones. | Completado ✅ — `user.onboarding_role` añadido (migración `0064_striped_psynapse.sql`) y `saveOnboardingRoleAction` lo persiste en `finish()`; las invitaciones ya no descartan `Promise.allSettled`: `finish()`/`retryInvites()` acumulan fallos, los muestran en el paso 4 con botón “Retry failed” y “Continue to dashboard”, y no navegan hasta que todas las invitaciones pendientes se envían o el usuario las omite. `tsc` limpio; migración aplicada sin drift (`drizzle-kit check` ✅). Falta E2E de invitaciones (F1-19/F5). |
| F2-01 | OAuth de integraciones | P0 | Install/callback Google, Outlook, Zoom y Slack sólo validan sesión y persisten credenciales sin `integrations:manage`. | Requerir permiso en ambos extremos y verificar actor/workspace originales. | Completado ✅ |
| F2-02 | OAuth state | P0 | State HMAC no se persiste ni consume; callbacks no lo ligan a sesión y usan workspace activo. | Nonce server-side, TTL, single-use, actor/workspace vinculados y rechazo sin secreto dedicado. | Completado ✅ |
| F2-03 | Storage cross-workspace | P0 | `api/storage/upload` y presign usan keys sin namespace workspace ni prueba de propiedad; un usuario autenticado puede sobrescribir objetos. | Namespaces inmutables por workspace/candidato, upload intent y autorización antes de PUT/adjuntar. | Completado ✅ |
| F2-04 | Permisos de mutación | P0 | Pipeline, entrevistas, scorecards, replies e Inbox usan contexto pero no permisos granulares. | Aplicar RBAC servidor por acción y pruebas negativas de cada rol. | Completado ✅ |
| F2-05 | Presign público | P1 | Presign de imagen/CV acepta slug público; permite consumir storage ajeno. Rate limit es local y toma IP de headers. | Cuotas/abuse controls compartidos, claves efímeras por intento y una fuente de IP confiable. | Completado ✅ |
| F2-06 | Cron | P1 | Mailbox/webhook cron aceptaba secreto por query y usaba un lock local. | Sólo header, comparación timing-safe, lock distribuido y auditoría de ejecución. | Completado ✅ — GET y `?secret=` fueron eliminados; los tres endpoints usan Bearer con hash + `timingSafeEqual`, advisory locks PostgreSQL y el scheduler registra `cron_runs`. |
| F2-07 | Rate limit | P1 | Limitador en memoria por proceso no protege topologías multi-instancia; API keys tampoco tienen control de intentos. | Store compartido y límites por key/origen/ruta; métricas y alertas. | Completado ✅ — `enforceRateLimit` ahora usa un `RateLimitStore` enchufable: `MemoryStore` por defecto (instancia única) y `DatabaseStore` compartido vía Postgres con `SELECT … FOR UPDATE` para topologías multi-instancia (`RATE_LIMIT_STORE=database`). Las API keys ahora tienen presupuesto propio (`apikey:<id>`, 1000/10 min) aplicado en `authenticateApiKey`. Cubierto por `src/server/api/ratelimit.test.ts` (límite en memoria, store enchufable y `DatabaseStore` atómico) y `src/server/api/auth.test.ts` (presupuesto por key aplicado y rechazo al agotarlo). |
| F2-08 | Secretos y logs | P1 | Secretos de webhook quedan en claro; logger no redacta globalmente y se registran emails/tokens inbound. | Cifrar/rotar secretos, logger con `redact` y eliminar/hash de PII/token en logs. | Completado ✅ |
| F2-09 | Portal OAuth | P1 | State de portal es base64 sin firma/nonce, susceptible a login-CSRF. | State firmado, ligado a sesión y uso único. | N/A ✅ (portal usa login por email, sin OAuth) |
| F2-10 | Archivos y adjuntos | P1 | Adjuntos legacy filtran workspace pero no permiso de candidato/equipo; LocalAdapter no honra siempre `UPLOADS_DIR`. | Control de acceso granular, pruebas cross-role y consistencia de ruta/volumen. | Completado ✅ — la descarga IMAP exige `collab:write` y filtra por workspace (404 si no pertenece al workspace, sin lectura del objeto); `LocalAdapter` ahora honra `UPLOADS_DIR` y rechaza path traversal. Cubierto por `src/app/api/mailbox/attachments/mailbox-attachment-download.test.ts` (403 sin permiso, 404 cross-workspace, 200 con bytes y headers seguros) y `src/lib/storage/local-adapter.test.ts` (raíz bajo `UPLOADS_DIR`, bloqueo de `../`). Falta cobertura cross-role con integración. |
| F2-11 | Observabilidad de salud | P2 | `/api/health` devuelve mensajes internos de BD. | Exponer estado genérico públicamente y detalle sólo autenticado/logs. | Completado ✅ |
| F3-01 | Pipeline móvil | P1 | `PipelineBoard.tsx:576-607` elimina destinos DnD bajo `sm`; `CandidateCard` no ofrece mover de etapa. | Acción accesible “Mover a etapa” y E2E a 320 px. | pendiente |
| F3-02 | Recuperación UI | P1 | Sólo existe boundary en portal; dashboard, career y apply no tienen `error.tsx` contextual. | Boundaries por layout, retry y E2E de fetch/upload/submit fallidos. | pendiente |
| F3-03 | Feedback Inbox | P1 | `RecruitingInbox.tsx:15-22` descarta errores y puede mostrar hilo oculto tras filtrar. | Feedback recuperable/live region, estado pending y selección/empty state correctos. | pendiente |
| F3-04 | Navegación correo | P1 | Nav mantiene Inbox y Replies como destinos paralelos con badges separados. | Convertir Replies en filtro/acceso del Inbox o explicar migración temporal. | Completado ✅ |
| F3-05 | Teclado pipeline | P1 | `CandidateCard.tsx:132-149` abre perfil por click sobre `article` no enfocable. | Usar control semántico/teclado y prueba Tab/Enter/Espacio. | pendiente |
| F3-06 | DnD accesible | P1 | `PipelineBoard.tsx:555-610` no anuncia arrastre/destino/resultado ni error async. | Anuncios DnD, alerta de error y pruebas con lector/teclado. | pendiente |
| F3-07 | Formularios y filtros | P1 | Pipeline, calendario y Schedule tienen selects/botones sin nombre/estado programático. | Labels asociados, radiogroup/`aria-pressed` y pruebas axe. | pendiente |
| F3-08 | Calendario | P1 | Día sin semántica/estado suficiente; detalle no toma foco; ancla externa anidada en `Link`. | Patrón de grid accesible, foco/anuncio y enlaces no anidados. | pendiente |
| F3-09 | Estado dinámico | P1 | Inbox, Schedule y Apply no anuncian cambios, conflictos, errores o éxito correctamente. | `aria-live`/`role=alert`, `aria-invalid` y `aria-describedby`; E2E con lector. | pendiente |
| F3-10 | Campos secundarios | P2 | Notas, activity rail y perfil portal tienen semántica/feedback incompletos. | Etiquetas, roles/controles asociados y mensajes de guardado accesibles. | pendiente |
| F3-11 | Estados UI incompletos | P2 | Inbox no tiene empty state por filtro y muestra acciones disabled/IA sin explicación. | Estados por filtro y feature-state/tooltips; ocultar acciones no disponibles. | pendiente |
| F3-12 | Validación visual | P1 | No hay evidencia de pruebas 320/375/768/1024/1440, zoom 200 %, contraste ni teclado/axe. | Matriz Playwright visual y a11y previa a RC. | pendiente |
| F3-13 | Sistema visual fragmentado | P1 | Aunque existen tokens globales y primitives, hay al menos 98 archivos con `rounded-xl/2xl/3xl` y 59 con tipografía arbitraria en píxeles; conviven `Card` a `rounded-3xl`, formularios redondos (`Input`/`Select`/`Button`) y numerosos componentes locales rectangulares o con colores hardcodeados. | Formalizar tokens de radio, espaciado, tipografía, elevación y estado; migrar primero dashboard, pipeline, inbox y settings al mismo contrato. | pendiente — fuera de alcance del pase del 12 de julio (frontend): migración de ~98+59 archivos requiere verificación visual por pantalla, no cabe en un pase de bugfix. Recomendado como iniciativa dedicada siguiendo el orden ya propuesto (dashboard → pipeline → inbox → settings). |
| F3-14 | Contraste y color semántico | P1 | `--ink-soft: #8a8a86` se usa como `text-muted-foreground` sobre `--paper: #f5f5f4`; varias etiquetas reducen aún más la opacidad (`/60`, `/70`). Los estados usan color como señal principal (urgencia, score y etapas) y algunos colores se definen localmente. | Medir combinaciones renderizadas en claro/oscuro contra WCAG AA, subir contraste de texto auxiliar y acompañar todos los estados con texto/icono; no aprobar sólo por inspección de tokens. | Completado ✅ — `globals.css`: `--ink-soft` en modo claro pasó de `#8a8a86` (~3.17:1 sobre `--paper`, falla AA) a `#6a6a67` (~4.95:1, cumple AA). Modo oscuro no se tocó (ya cumplía, ~6.6:1). Auditados los ~60 usos de `muted-foreground/60`, `muted-foreground/70` e `ink-soft/70`: removida la opacidad en los que colorean texto real (labels, timestamps, contadores); se dejó intacta en los que colorean sólo iconos decorativos (prefijos de input, enlace externo) o un fondo no textual (punto de bullet). Color como única señal de estado (urgencia/score/etapas) queda pendiente — no evaluado en este pase. |
| F3-15 | Inbox no alcanza el lenguaje del producto | P1 | `RecruitingInbox.tsx` está comprimido en una sola línea, no reutiliza `PageHeader`, `EmptyState`, `Textarea` ni primitives del dashboard; la vista de tres columnas pasa a bloques verticales sin un patrón móvil de lectura/retorno y mantiene acciones IA aparentes pero inoperantes. | Rediseñar como superficie canónica: header/estados compartidos, lista con preview, lector con adjuntos y panel contextual; definir navegación móvil y ocultar o explicar funciones no disponibles. | Completado ✅ — el hallazgo estaba desactualizado: `RecruitingInbox.tsx` ya usa `PageHeader`/`EmptyState`, transición móvil lista↔hilo, `aria-live` para anuncios; `InboxThreadList.tsx` usa `role="tablist"`, avatar, punto de no-leído y `EmptyState` por filtro; `InboxActionsPanel.tsx` ya deshabilita las acciones de IA no construidas con `aria-disabled` + tooltip "Coming soon" (mismo patrón honesto pedido en F3-20). No se requirió rediseño. |
| F3-16 | Navegación y foco diario | P2 | Sidebar separa sólo `Home/Inbox/Replies` de diez herramientas heterogéneas; conserva Inbox/Replies duplicados. La barra superior muestra un control `Activity` cuyo contenido promete una función futura. | Consolidar correo, agrupar el trabajo diario (Jobs, Pipeline, Candidates, Tasks), dejar configuración al final y eliminar/convertir Activity en actividad real antes de exponerlo. | pendiente |
| F3-17 | Jerarquía y practicidad del dashboard | P2 | El inicio tiene una buena síntesis de prioridad, pero seis widgets compiten con igual peso visual y no hay preferencia/personalización ni una ruta de acción única al estado vacío. | Mantener la síntesis, priorizar por urgencia y permitir ocultar/reordenar widgets; en cada vacío ofrecer una acción de primer paso consistente. | pendiente |
| F3-18 | Componentes genéricos insuficientemente adoptados | P2 | Ya existen `PageHeader`, `EmptyState`, `Card`, `Tile` y helpers de settings, pero múltiples features recrean headers, cards, vacíos, inputs y botones con estilos locales. | Definir qué primitive se usa para cada patrón y añadir ejemplos/reglas de contribución; extraer sólo patrones repetidos, no una capa de abstracción genérica sin uso. | pendiente |
| F3-19 | Tipografía y carga de fuentes | P1 | La intención tipográfica es coherente (Inter + display y Fraunces sólo para Folio), pero `next/font/google` rompe el build sin DNS (F5-04) y algunos subproductos vuelven a zinc/stone y tamaños de 10–11 px. | Empaquetar fuentes y establecer escala mínima legible; reservar mono y serif para los contextos definidos y revisar a 200 % de zoom. | pendiente |
| F3-20 | Promesa visual vs. estado funcional | P1 | README promete un ATS integral; hay affordances visibles que no cumplen esa expectativa: Activity dice “will show up here”, botones IA del Inbox no ejecutan acción y algunos destinos anuncian “Coming soon”. | No presentar acciones como disponibles hasta tener flujo/error/feedback; marcar beta de forma consistente o retirar la navegación incompleta del release. | Completado ✅ — el botón `Activity` en `TopBar.tsx` (antes un popover interactivo que abría a una promesa vacía) ahora es un botón deshabilitado con tooltip "Coming soon", igual al patrón ya usado en `InboxActionsPanel.tsx` (F3-15). Los botones IA del Inbox ya seguían ese patrón. Beta/"Coming soon" fuera del Inbox y de Activity no se auditó exhaustivamente en este pase. |
| F3-21 | Navegación móvil bloqueada | P0 | `Sidebar` pasa a `Sheet` al detectar móvil (`components/ui/sidebar.tsx:183-205`), pero `SidebarTrigger` no se monta fuera de su definición y AppSidebar sólo tiene controles dentro del propio sidebar. TopBar no ofrece menú. | Montar un trigger accesible y visible en el TopBar móvil; probar abrir/cerrar, foco y navegación a cada destino a 320–390 px. | Completado ✅ — `TopBar.tsx` renderiza `<SidebarTrigger className="md:hidden">` al inicio del header; `SidebarTrigger` ya era mobile-aware (`toggleSidebar()` llama `setOpenMobile` bajo 768px). Verificado en navegador a 375px: el trigger abre/cierra el Sheet y navega a cada destino. Desktop conserva su control de colapso existente (`SidebarBrand`), sin cambios. |
| F3-22 | Branding configurable sin contraste | P1 | `board-primary` configurable se usa con texto blanco en CTA/CookiePanel y como color de foco (`ApplyForm.tsx:216-231`, `CookieConsentBanner.tsx:240-248,299-307`); templates públicos hacen lo mismo. | Calcular foreground por luminancia o restringir paleta; probar cada combinación con WCAG AA. | pendiente |
| F3-23 | Diálogos, cookie y editor | P1 | Dialog base no limita alto ni scroll (`ui/dialog.tsx:63-81`); Cookie consent no es modal/foco robusto; toolbar RichText usa controles 24×24 sin nombre accesible/foco claro (`RichTextEditor.tsx:195-258`). | Estándar único para viewport/focus-return/scroll, diálogo cookie modal y controles de al menos 44 px con etiquetas. | pendiente |
| F3-24 | Atajos y navegación global inconsistentes | P1 | Quick Create anuncia crear pero sólo navega; command palette omite destinos del sidebar y contiene `/settings/account` inexistente; el calendario no ofrece creación (`QuickCreateMenu.tsx:40-51`, `CommandMenu.tsx:30-36,228-244`, `CalendarBoard.tsx:141-418`). | Fuente de verdad única de navegación, rutas testeadas y acciones que ejecuten lo que anuncian. | Parcial ⚠️ — `CommandMenu.tsx` ahora construye su grupo "Navigate" desde `primaryNav`+`workspaceNav` (`nav-items.ts`, la misma fuente de verdad que `AppSidebar`), filtrando por `requiredPermission` igual que el sidebar; la ruta muerta `/settings/account` se corrigió a `/account`. Se revisó `QuickCreateMenu`: sus items navegan a páginas reales y funcionales, no son una promesa vacía — no se consideró un defecto y se dejó sin cambios. Falta: creación desde el calendario (`CalendarBoard.tsx`), no evaluada en este pase. |
| F3-25 | Calendario/candidatos en pantallas pequeñas o grandes | P1 | Calendario siempre conserva siete columnas y celdas `min-h-24`; Candidates carga/filtra localmente sin paginación y muestra rail IA incompleta (`CalendarBoard.tsx:238-314`, `CandidatesTable.tsx:130-199,370-477,634-653`). | Agenda/lista móvil con zona horaria; búsqueda/filtros server-side y paginación; ocultar rail no operativa. | pendiente |
| F3-26 | Perfil y settings navegables a medias | P2 | Perfil de candidato concentra seis tabs no persistidas en URL; Settings muestra nueve secciones como cinta horizontal en móvil (`CandidateProfileTabs.tsx:269-298`, `SettingsNav.tsx:88-149`). | Tabs con deep-link/recuentos y selector/accordion/búsqueda para settings en móvil. | pendiente |
| F3-27 | Estados públicos de carga/error | P1 | Job y apply públicos son dinámicos pero carecen de boundaries de carga/error; portal login/upload no anuncia estado de forma accesible. | Añadir loading/error/retry contextual y live regions a upload/login/submit. | pendiente |
| F4-01 | Docker deployable | P0 | Compose generado define Postgres 16 privado, migrator, app, scheduler, volúmenes y healthchecks. RC VPS 2026-07-19 ejecutó instalación local y upgrade Caddy/DNS/HTTPS público a `ghcr.io/vytral/harly:0.1.0-beta.2` digest `sha256:f0b999…0776a16`; migración, certificados, app, scheduler y readiness públicos verdes. | Mantener smoke por release. | resuelto para beta.2 ✅ |
| F4-02 | CLI/wizard | P0 | `init`, `launch`, `doctor`, `backup`, `restore`, `update` y `uninstall` existen; el menú detecta sólo instalaciones ancestras y CI desactiva prompts. Falta publicar estos fixes como 0.1.3 y validar el flujo TTY completo. | Publicar y ejecutar RC de CLI distribuido. | parcial |
| F4-03 | Scheduler | P0 | Scheduler es un servicio Compose con dependencia de app healthy, reinicio y límites; arrancó en la prueba local. Aún no hay prueba de solapamiento, caída y recuperación. | Pruebas de locks, reintentos y recuperación. | parcial — SELFHOST-RC-01 |
| F4-04 | Storage local | P1 | Compose monta `uploads:/data/uploads`; `UPLOADS_DIR=/data/uploads` es el contrato runtime y hay prueba de `LocalAdapter`/path traversal. | Mantener prueba de reinicio en RC. | resuelto ✅ |
| F4-05 | Health y seguridad DB | P1 | Postgres no publica puerto, app/scheduler esperan healthchecks y readiness no expone detalle de BD. | Verificar Caddy/HTTPS y alertado externo en VPS. | resuelto en Compose ✅ |
| F4-06 | Upgrade/rollback | P1 | Update crea backup previo, fija digest, ejecuta migraciones y espera health; una migración no se revierte automáticamente y se documenta restore como recuperación. RC VPS 2026-07-19 validó beta.1 → beta.2 y confirmó el digest objetivo con `doctor` verde. | Mantener RC por cada migración incompatible y documentar compatibilidad. | resuelto para la línea beta actual ✅ |
| F4-07 | Backup/restore | P1 | Backup exige age o consentimiento explícito plaintext, incluye checksums recursivos y usa credenciales configuradas. Restore crea safety backup, excluye migrator durante restore y valida health. El drill limpio 2026-07-18 destruyó y recuperó 500 filas, checksum, usuario y upload byte a byte. Falta estrategia S3/retención. | Drill periódico cifrado + backup/versionado S3. | parcial — SELFHOST-DATA-01 local completado ✅ |
| F4-08 | CI operativo | P1 | Hay typecheck, tests del CLI e init E2E; falta smoke Compose por modo, escaneo y RC de artefacto distribuido. | CI Compose + escaneo + RC. | parcial |
| F4-09 | Configuración producción | P1 | CLI valida Docker, Compose, puertos, disco, DNS, URL, storage e imagen fija antes de generar `.env`; el runtime aún no posee schema único exhaustivo de variables. | Schema runtime y matriz por proveedor. | parcial |
| F4-10 | Observabilidad/runbooks | P1 | Hay health/readiness, `doctor`, logs rotados y guía operacional. Faltan alertas, métricas y runbooks de fallos de integraciones. | Alertado externo y runbooks por dependencia. | parcial |
| F4-11 | Documentación obsoleta | P2 | `self-hosting`, cloud deployments y launch checklist fueron reconciliados con el CLI/Compose actual. La suite del CLI valida enlaces cloud locales, roles/healthcheck de DigitalOcean y que el wizard capture `DATABASE_URL` como secreto app-level. | Mantener smoke autenticado por proveedor y validar enlaces externos en releases. | parcial — validación estática añadida |
| F5-01 | Escenario E2E ATS | P0 | No existe runner E2E/Playwright/Cypress, fixtures ni smoke; F1 contiene bloqueos en el flujo candidato → oferta. | Implementar escenario automatizado de publicar → aplicar → pipeline → entrevista → evaluación → oferta → cierre. | bloqueado por F1/F4 |
| F5-02 | Escenario de fallos | P0 | No hay harness para caída de storage/email/integración/cron ni mecanismos recuperables en varios flujos. | Tests de fallo y recuperación/idempotencia por proveedor antes de RC. | bloqueado por F1/F4 |
| F5-03 | Suite de pruebas | P1 | `pnpm test` (12 jul 2026): 162 pasan, 1 falla y 1 se omite; `ssrf.test.ts` intenta DNS real a `example.com`. | Convertir la prueba en un unit test con fetch/DNS mockeado; exigir suite verde sin red. | Completado ✅ |
| F5-04 | Build reproducible | P1 | `pnpm build` (12 jul 2026) intenta descargar `fonts.googleapis.com` y falla sin DNS externo. | Autoalojar/empacar fuentes o documentar/validar dependencia de red; build offline en CI. | Completado ✅ |
| F5-05 | Release candidate | P0 | Sin Compose de aplicación, wizard, scheduler, backup/restore ni CI de artefacto no existe instalación limpia representativa. | Resolver F4-01…10 y ejecutar RC en infraestructura limpia antes de publicar. | bloqueado por F4 |

## Auditoría de diseño — lectura ejecutiva

Alcance: consola del reclutador, Inbox, pipeline, dashboard, componentes base, portal/career page y formularios. Se recorrió el código indexado con **CodeGraph** (653 archivos, 9.6k símbolos y 21.4k relaciones tras sincronizar los cambios locales) y fuentes concretas de UI. Es una auditoría estática: todavía no sustituye capturas ni pruebas en navegador con datos reales.

### Qué sí cumple la expectativa

- La dirección de marca del producto administrativo es reconocible: canvas cálido, superficies claras, oliva/lima reservado para acción y jerarquía tipográfica sobria. Los tokens globales hacen que sea posible corregir a escala.
- El dashboard entiende bien el trabajo de un recruiter: saludo contextual, elementos vencidos, entrevistas, pipeline, revisión y tareas en una sola vista.
- La base de interacción es saludable: primitives de Radix/shadcn, foco visible en controles base, barra lateral colapsable, búsqueda global y buenas piezas reutilizables (`PageHeader`, `EmptyState`, `Tile`).
- Las career pages sí ofrecen una propuesta diferenciada y útil para branding: templates Minimal, Playful, Ashby y Folio, y el formulario adapta la presentación al template.

### Qué todavía no cumple

- No se percibe una sola familia de componentes en todo el producto: el admin, settings, Inbox, builder y superficies públicas aplican radios, tamaños, colores y controles diferentes sin una frontera de producto siempre clara.
- La experiencia se sostiene en escritorio; en móvil se rompen flujos esenciales del pipeline y el nuevo Inbox no tiene aún una lectura/acción cómoda para pantallas pequeñas.
- Hay controles que parecen producto terminado pero son placeholders o no producen resultado. Eso daña la confianza más que simplemente ocultar la función.
- El contraste, zoom, dark mode y breakpoints no tienen verificación renderizada. Por tanto, la estética no está todavía demostrada como accesible ni robusta.

### Criterio práctico de cierre de diseño

Antes de declarar el diseño listo para launch: resolver F3-13, F3-14, F3-15 y F3-20; ejecutar una matriz visual y axe en 320/375/768/1024/1440 px, light/dark y 200 % zoom; y hacer un recorrido humano de cinco minutos de recruiter y de candidato con datos realistas. F3-16–19 se pueden ejecutar como una pasada de coherencia inmediatamente posterior, salvo cualquier hallazgo de contraste AA que se vuelva bloqueante.

### Resultados por subfase

#### 3A · Sistema visual y componentes

La base es buena: tokens semánticos, primitives con foco, una tipografía deliberada y dark mode estructurado. El problema es de gobernanza: la app combina el sistema administrativo con estilos locales `zinc/stone/white`, radios incompatibles y más de seiscientos usos de texto `xs` o de 10–11 px. Debe consolidarse el contrato de tokens antes de seguir añadiendo pantallas. Prioridad: F3-13, F3-14, F3-19, F3-22 y F3-23.

#### 3B · Consola del recruiter

El shell y el dashboard tienen una lectura diaria útil, y el perfil de candidato integra bien mucha información. La operación se degrada al buscar una acción: Inbox y Replies compiten, Quick Create y Activity prometen más de lo que hacen, la paleta no replica la navegación y el calendario/pipeline no mantienen la tarea principal en móvil. Prioridad: F3-15, F3-16, F3-17, F3-20, F3-21, F3-24 y F3-25.

#### 3C · Candidate-facing y portal

Las career pages son una fortaleza real: hay variantes visuales y el formulario se adapta a ellas. En cambio, el portal no es publicable todavía: además de problemas de formulario/feedback, expone notas internas de entrevistas (F1-20). Esta subfase añadió también F1-21–23 y F3-27; son fallos de confianza y privacidad, no sólo de diseño.

#### 3D · Accesibilidad, responsive y estados

Los primitives Radix resuelven parte de la infraestructura de diálogo y teclado, pero las integraciones locales no siempre la preservan. El P0 F3-21 impide abrir la navegación móvil; los diálogos altos, Cookie consent, editor enriquecido, upload y feedback asíncrono necesitan una pasada específica de foco, nombres accesibles, tamaño táctil y anuncios. La validación no puede quedarse en revisión de código: requiere teclado, lector de pantalla, zoom y contraste renderizado.

#### 3E · Evidencia pendiente antes del cierre

No se ejecutaron screenshots ni E2E visuales porque aún falta el runtime self-hosted reproducible y un runner de browser (F4/F5). La matriz mínima es Chrome/Firefox/Safari; 320/375/768/1024/1440 px; light/dark; zoom 200 % y 400 %; Tab/Shift+Tab/Escape/Enter/Espacio; NVDA+Firefox y VoiceOver+Safari; axe en dashboard, candidates, pipeline, calendar, Inbox, portal, job público y apply.

## Dictamen actual

**NO-GO para promover `latest`.** La reconciliación del 14 de julio cerró navegación móvil (F3-21) y entregó una base local Docker/CLI/scheduler, pero F4-01…03 siguen en progreso hasta publicar la imagen y ejecutar sus pruebas de distribución. Los hitos E2E/RC (F5-01, F5-02 y F5-05) siguen condicionando la promoción del mismo digest a `latest`.

El orden mínimo para cambiar este dictamen es ejecutar los escenarios E2E completos en una instalación limpia, validar upgrade desde la beta anterior y promover exactamente el digest aprobado por el RC.

## Evidencia de verificación — Fase 1

- `pnpm --filter web test -- src/features/applications src/features/jobs src/features/email-templates`: 52/52 tests verdes (11 de julio de 2026). No cubren los flujos transaccionales indicados arriba.
- `pnpm --filter web typecheck`: correcto (11 de julio de 2026).
- Mapa estructural: 251 archivos de código en `apps/web/src/features`; la extracción AST no pudo ejecutarse por restricción de permisos del entorno. La revisión se completó con recorridos directos de rutas, acciones y datos relevantes.

## Evidencia de verificación — Cierre de hallazgos (12 de julio de 2026)

- `npx tsc --noEmit`: correcto, 0 errores.
- `npx eslint . --max-warnings=0`: 0 warnings.
- `npx vitest run`: 171 passed / 1 skipped (20 archivos).
- **F1-01:** `src/features/pipeline/data-isolation.test.ts` — move cross-job falla, mismo-job pasa.
- **F1-20:** `src/server/portal-applications.test.ts` — select no incluye `interviews.notes`.
- **F1-04 / F2-01 / F2-02:** `src/server/oauth-state.test.ts` — nonce reutilizado falla, expirado falla, mismo-usuario distinta sesión pasa, actor distinto falla. Tabla `oauthStateNonces` añadida al schema (requiere `pnpm db:generate`).
- **F5-04:** `next/font/local` reemplaza `next/font/google`; woff2 en `src/app/fonts/`; `pnpm build` compila sin referencias a `fonts.googleapis.com`/`fonts.gstatic.com` en `.next/server`+`.next/static`.

### Reconciliación local posterior

- `pnpm --filter web typecheck`: correcto, 0 errores.
- Pruebas dirigidas: `pnpm --filter web test src/features/pipeline/data-isolation.test.ts src/server/portal-applications.test.ts src/server/oauth-state.test.ts src/features/workspaces/permissions.test.ts src/lib/ssrf.test.ts src/lib/two-factor.test.ts src/lib/email/inbound-processor.test.ts`: **39/39 verdes**.
- Se confirmó que F1-20 ya consulta entrevistas del portal mediante una selección explícita que excluye `interviews.notes`; F1-01 une la etapa destino al mismo `jobId` de la candidatura; y F1-04/F2-01/F2-02 usan nonce OAuth persistido, de uso único y ligado a actor/workspace.
- Los cambios de `api/storage/upload` y `applications/resume/presign` añaden autenticación, pero **no cierran F2-03**: falta un namespace inmutable por workspace y validación de propiedad/intent antes de escribir o adjuntar objetos.
- **F1-05 / F3-04:** Inbox normaliza los replies webhook de `candidateMessages` como hilos `legacy-reply`, mantiene el timeline del candidato como historial asociado y ofrece el filtro `Replies`. La ruta histórica `/dashboard/replies` redirige a ese filtro; el sidebar deja de duplicar la bandeja. `actions.test.ts` y `legacy-replies.test.ts` cubren la autorización y adaptación básica.
- **F2-03:** cada presign emite keys `workspaces/<workspace>/…`; Local storage exige un intent HMAC de 10 minutos ligado a key/MIME/tamaño y los flujos de postulación, adjunto de candidato y análisis de CV verifican el namespace antes de usar el objeto. `storage-upload-intent.test.ts` cubre integridad y expiración; `storage-key.test.ts` conserva la compatibilidad de lectura legacy.

### Validación de correcciones parciales (12 de julio de 2026, sesión backend)

Se añadieron pruebas dirigidas que validan el código ya corregido de los hallazgos parciales de backend. Corrida completa: `pnpm --filter web test` → **192 passed / 1 skipped** (live-smoke, gated por `LIVE_AI_SMOKE`).

- **F1-09:** `src/features/pool/assign.test.ts` — rechaza asignar a puesto `closed`/`draft` (la cláusula WHERE `status = 'open'` no devuelve fila), rechaza aplicación duplicada y crea candidatura + historial de etapa dentro de una transacción con `onConflictDoNothing` idempotente.
- **F1-10 / F1-11 / F1-12:** `src/features/interviews/schedule.test.ts` — un video interview usa exactamente un proveedor (Zoom gana, sin crear Meet/Teams); reprogramar cancela y recrea la reunión de Teams sin tocar Zoom; el servidor rechaza un interview que solapa una `scheduled` del mismo entrevistador.
- **F1-13:** `src/features/offers/send.test.ts` — `email_outbox` durable se inserta antes del envío; la oferta sólo pasa a `sent` al aceptar el proveedor y los fallos quedan pendientes con ventana de retry.
- **F1-21:** `src/features/portal/application-validation.test.ts` — rechaza CV requerido ausente, valores `select` inválidos y descarta claves no configuradas; acepta sólo respuestas configuradas con CV aislado por workspace.

- **F1-07:** `src/features/applications/create-public-application.test.ts` — detecta la candidatura duplicada y rechaza la postulación **antes** de mutar el candidato (no invoca `update`/`insert`).
- **F1-08:** `src/features/pipeline/move-concurrency.test.ts` — el move se rechaza cuando el `updatedAt` leído ya no coincide (conflicto concurrente) y se completa cuando no hubo modificación paralela.
- **F2-10:** `src/app/api/mailbox/attachments/mailbox-attachment-download.test.ts` — 403 sin permiso, 404 para adjunto de otro workspace (sin leer el objeto), 200 con bytes y `Content-Disposition`/`X-Content-Type-Options: nosniff`; `src/lib/storage/local-adapter.test.ts` — `LocalAdapter` resuelve bajo `UPLOADS_DIR` y bloquea path traversal. El contrato `LocalAdapter`/`UPLOADS_DIR` (antes pendiente en F4-04) quedó corregido.

Con estas validaciones, los hallazgos de **Fase 1** marcados como corregidos/parciales de backend (F1-07, F1-08, F1-09, F1-10, F1-11, F1-12, F1-13, F1-17, F1-21) quedaron validados con pruebas dirigidas. Restan por validar en otras fases: roles cross-workspace con integración (F2-10), escenarios de concurrencia a nivel BD (F1-19/F5) y la batería E2E (F5, bloqueada por F4).

### Cierre de Fase 2 (12 de julio de 2026)

La Fase 2 quedó completa. El único hallazgo pendiente era **F2-07** (Rate limit), cerrado con:

- `src/server/api/ratelimit.ts` — `enforceRateLimit` delega en un `RateLimitStore` enchufable. `MemoryStore` (por defecto, correcto para self-host de instancia única) y `DatabaseStore` (compartido vía Postgres con `SELECT … FOR UPDATE`, para multi-instancia; activar con `RATE_LIMIT_STORE=database`).
- `packages/db/src/schema.ts` + `migrations/0062_rare_yellow_claw.sql` — nueva tabla `rate_limit_buckets`.
- `src/server/api/auth.ts` — presupuesto por API key (`apikey:<id>`, 1000 req / 10 min) aplicado en `authenticateApiKey`, cubriendo el control de intentos que antes faltaba.
- Pruebas: `src/server/api/ratelimit.test.ts` y `src/server/api/auth.test.ts` (6 tests, verdes).

Con esto, **F2-01 … F2-11** están en `Completado ✅` / `N/A ✅`.

## Readiness pass — backend y flujos (12 de julio de 2026)

Recorrido de cada flujo de negocio para confirmar: (1) existencia de la acción/servicio, (2) guarda de `requirePermission`, (3) mutaciones en `db.transaction`, (4) hallazgos abiertos. Resumen por flujo:

| Flujo | Veredicto | Notas clave |
|---|---|---|
| **Workspace creation** | Parcial | Auth-session + candado advisory `pg_advisory_xact_lock` cierra la carrera single-tenant; slug único por índice. Falta seed de `workspace_settings` (lazy upsert lo cubre) y rate-limit en `check-slug`/create. |
| **Onboarding** | Listo | Escrituras owner protegidas. **Cerrado:** `setRequire2faAction` usa `requirePermission("security:manage")` + `logAuditEvent`; `saveAcquisitionAction`/`saveUserRoleAction` validados con zod; `finish()` de `OwnerOnboarding.tsx` ahora chequea el resultado de cada invitación y no completa el onboarding si alguna falla (no traga errores). |
| **Permisos / RBAC** | Parcial | 44/44 server actions y todas las rutas/api protegidas. Aislamiento por workspace sólido. Comentarios de `permissions.ts` reconciliados: solo `owner` es incondicionalmente all-powerful; `admin` recibe el set explícito completo. REST API scopes son gruesos vs RBAC interno (ver pendiente Baja). |
| **Pipeline** | Listo | `moveApplicationInPipeline`/`bulkMoveApplications`/`updateApplicationStatus` con `requirePermission` + `db.transaction` + lock optimista `updatedAt`. Reordenamiento de hermanos no está bajo lock (menor). |
| **Candidates** | Listo | CRUD protegido y transaccional. **Cerrado:** `updateCandidateProfile` en `db.transaction`; las rutas REST (`candidates/service.ts`) ahora registran `logAuditEvent` en create/update/delete. **Merge de candidatos NO existe** (solo detección de duplicados de lectura, sin UI de merge expuesta) — aceptado. |
| **Interviews** | Listo | Núcleo en tx. **Cerrado:** `rescheduleInterview`/`updateInterview` recrean Teams/Zoom **antes** de mutar la fila (fallo de proveedor deja estado original consistente y reintentable); la reunión recreada usa el nuevo horario. `setInterviewStatus` ok. Side-effects de calendario/email siguen sin roll-back (aceptable). |
| **Offers** | Listo | `decideOffer` excelente (todo en tx). **Cerrado:** `sendOffer` delega al worker idempotente de `email_outbox` + cron; `createOffer`/`withdrawOffer` ahora envuelven update + activity en `db.transaction`. |
| **AI (chat/score/autofill/embeddings)** | Parcial | Gates por `getWorkspaceAiConfig` (BYOK) e inyección de prompt mitigada. **Cerrado:** chat IA con rate-limit por workspace (`ai-chat:{workspaceId}`, 40/min). Resta: Chat/score escriben en doble statement no transaccional. Autofill y embeddings listos. |
| **Mailbox / Inbound** | Listo | IMAP: validación de adjuntos y descarga scoped correctos. **Cerrado:** `storeAttachments` valida vía `validateMailboxAttachment`; `replyMailboxThreadAction` ya no filtra `error.message` al cliente (error genérico). |

### Correcciones aplicadas en este pass
- **Inbound attachments (seguridad):** `src/lib/email/inbound-processor.ts` ahora valida tamaño (≤25MB), MIME allowlist y sanitiza el filename vía `validateMailboxAttachment` antes de subir; adjunto inválido se descarta. Prueba en `inbound-processor.test.ts`.
- **Tasks RBAC:** `src/features/tasks/actions.ts` (`createTask`/`updateTask`/`deleteTask`) ahora exigen `requirePermission("collab:write")`. Prueba en `src/features/tasks/actions.test.ts`.
- **Candidates transaccional:** `updateCandidateProfile` envuelve update + `activityEvents` en `db.transaction` (`src/features/candidates/actions.ts`).
- **Onboarding robusto:** `setRequire2faAction` usa `requirePermission("security:manage")` + `logAuditEvent`; `saveAcquisitionAction`/`saveUserRoleAction` validados con zod (`src/features/onboarding/actions.ts`).
- **Mailbox reply:** `replyMailboxThreadAction` devuelve error genérico en vez de `error.message` (`src/features/mailbox/actions.ts`).
- **Worker de email_outbox (idempotente):** nuevo `src/lib/email/outbox-processor.ts` con `processEmailOutbox` (reintenta con backoff, jamás reenvía una oferta ya `sent`) + cron `src/app/api/cron/email-outbox/route.ts`. `sendOffer` inserta el outbox y delega; la oferta queda `sent` solo tras envío confirmado. Pruebas en `outbox-processor.test.ts` y `offers/send.test.ts`.
- **Interviews consistentes:** `rescheduleInterview`/`updateInterview` recrean Teams/Zoom antes de mutar la fila (`src/features/interviews/actions.ts`); fallo de proveedor deja estado original.
- **Rate-limit chat IA por workspace:** `src/app/api/ai/chat/route.ts` consume `ai-chat:{workspaceId}` (40/min) vía `enforceRateLimit`.
- **Onboarding `finish()` robusto:** `OwnerOnboarding.tsx` verifica el resultado de cada `inviteWorkspaceMemberAction` y no completa el onboarding si alguna invitación falla.
- **Offers transaccionales:** `createOffer`/`withdrawOffer` envuelven el write + `logOfferActivity` en `db.transaction` (`src/features/offers/actions.ts`).
- **Auditoría en API de candidatos:** `candidates/service.ts` (`createCandidateForApi`/`updateCandidateForApi`/`deleteCandidateForApi`) ahora registran `logAuditEvent`.
- **Comentarios de permisos reconciliados:** `permissions.ts` aclara que solo `owner` es incondicionalmente all-powerful; `admin` obtiene el set explícito completo (coherente con `roleIsAllPowerful` y `permissions.test.ts`).

### Pendientes para self-hosting (no bloqueantes)
- **Baja (arquitectónico):** mapear los scopes gruesos de la REST API (`candidates:write`, etc.) al RBAC interno por acción. Hoy la REST API autentica por API-key + scope propio; alinearla con `requirePermission` interno es un cambio de superficie mayor y queda fuera del alcance de robustez transaccional.

Suite tras este pass: **215 passed / 1 skipped** (web), typecheck limpio.

## Tracking de lanzamiento self-hosted — 14 de julio de 2026

Estado de los siete pasos acordados. La UI guiada se adelantó por decisión
explícita del owner; esto no convierte la beta en lanzamiento ni desbloquea RC.

- [x] **SELFHOST-CLI-01 — Corregir y verificar los ejecutables npm.**
  `tooling/harly/package.json` usa `dist/index.js` para el único binario
  `harly`. `npm publish --dry-run --json` finalizó sin
  autocorrecciones, empaquetó 3 archivos (7.7 kB) e incluyó `dist/index.js`
  ejecutable con modo decimal `493`.
- [ ] **SELFHOST-IMAGE-01 — Publicar la imagen canónica y hacerla pullable.**
  `ghcr.io/vytral/harly:0.1.0-beta.1` ya existe como índice OCI para
  `linux/amd64` y `linux/arm64`, con digest
  `sha256:3d6e43465b2ec073e23cb1d54a74797f3bc998ffe3b9e53344d9459506a05476`.
  La inspección autenticada pasa, pero el token/pull anónimo aún devuelve
  401/403: el paquete GHCR sigue privado. No se promueve `latest`.
- [x] **SELFHOST-CLI-02 — E2E mínimo de `init` en un directorio vacío.**
  `tooling/harly/test/init.e2e.test.mjs` ejecuta el bin compilado
  y valida siete artefactos, `.env` `0600`, secretos independientes, config y
  Compose. `tooling/harly/package.json` lo expone como `test` y
  `.github/workflows/ci.yml:225-234` lo ejecuta antes del smoke del tarball.
  Resultado local: 2/2 verdes, incluyendo el contrato no interactivo.
- [ ] **SELFHOST-DATA-01 — Endurecer backup, restore y upgrade.**
  Implementación en `tooling/harly/src/index.ts`; no se promociona
  hasta cerrar el tracking destructivo independiente descrito abajo.
- [ ] **SELFHOST-RC-01 — Instalación limpia y upgrade en una VPS.**
  Requiere SELFHOST-IMAGE-01 y SELFHOST-DATA-01. Debe validar los tres modos de
  proxy, persistencia, reinicio, HTTPS, doctor y upgrade N-1 → actual.
- [x] **SELFHOST-CLI-03 — Wizard guiado con `@clack/prompts`.**
  Implementado en inglés con logo ASCII estático, selección de proxy/storage,
  secreto S3 enmascarado, preflight con Docker/puertos/DNS/disco, detección de
  CPU/RAM, perfiles `compact`/`standard`/`performance`, plan previo, confirmación
  explícita y generación con progreso. `@clack/prompts` y `picocolors` son
  dependencias runtime conscientes; la prueba TTY real generó configuración
  válida sin lanzar contenedores.
- [ ] **SELFHOST-RELEASE-01 — RC completo y publicación npm/GHCR.**
  Publicar semver y digest inmutable, ejecutar instalación limpia y upgrade,
  y promover exactamente el mismo digest sólo después de pasar el RC. El
  workflow actual se dispara con tags `v*` en
  `.github/workflows/release-image.yml:3-5`.

### Contrato vinculante del CLI

- [ ] **SELFHOST-CLI-CONTRACT-01 — Modo no interactivo seguro.**
  Cerrado parcialmente: `launch` sin `--yes` y sin TTY termina con exit code
  `2`, cubierto por E2E; ningún secreto se acepta por argumentos y el secreto S3
  interactivo queda enmascarado. Pendiente: implementar `--config`, exigir
  permisos restrictivos antes de leerlo y comprobar que sus valores nunca se
  imprimen.

### Tracking destructivo independiente

- [ ] **SELFHOST-DATA-01 / escenario obligatorio: backup → destrucción → restore.**
  En una instalación aislada con PostgreSQL 16 y uploads locales: crear datos y
  adjuntos con conteos/hashes conocidos; generar backup cifrado; destruir DB y
  objetos; restaurar en destino vacío; ejecutar migraciones y doctor; comprobar
  conteos, hashes, owner, configuración y readiness. Repetir con fallo inyectado
  para verificar que servicios se reinician. Antes de ejecutar el escenario se
  deben eliminar los valores DB hardcodeados (`src/index.ts:656,703`), verificar
  checksum de todos los artefactos (`src/index.ts:662,698-700`), limpiar tmpdirs
  y definir el contrato S3. Este item no se mezcla con UI ni publicación.
