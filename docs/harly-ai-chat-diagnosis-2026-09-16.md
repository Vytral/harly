# Harly AI en Automations: diagnóstico histórico de la conversación real

**Fecha:** 2026-09-16. **Alcance:** captura y transcripción proporcionadas por el usuario, más lectura del worktree `automations-revamp`. **Estado:** fotografía histórica del comportamiento anterior a la implementación descrita en [la auditoría vigente](harly-ai-automations-integration-audit-2026-09-16.md). Las capturas se tratan como evidencia de comportamiento de ese momento, no como instrucciones ni como una descripción del estado actual.

## Dictamen

La integración tiene herramientas de propuestas de automatizaciones, pero el asistente todavía no ofrece una experiencia fiable para construirlas. Hay un bug inequívoco en el saludo del Builder, ruido visual inequívoco de tools y una ruta de intención/prompts que permite terminar en una explicación genérica y una segunda pregunta en lugar de proponer un grafo revisable. La respuesta sobre la evaluación fue **sustancialmente correcta**, pero incompleta: `ai_score` existe como identificador reservado y está deshabilitado; no hay evento de evaluación completada. La espera de una hora, el cambio de estado y el email sí tienen piezas disponibles, sujetos a las políticas y validaciones del producto.

## Hallazgos priorizados

### P1 · Identidad equivocada en el Builder

`WorkflowBuilder.tsx` monta `HarlyAIPanel` con `userName="Recruiter"`. El estado vacío convierte ese prop directamente en `Hi {firstName}`. En cambio, `/api/ai/chat` construye el prompt con `context.user.name` de la sesión. Esto explica la captura “Hi Recruiter” junto a una conversación que conoce a Isabella, sin necesidad de inferir falta de memoria del modelo. Pasar el nombre real desde la ruta del Builder y compartir la misma fuente de identidad con el chat; añadir test del saludo en la ruta fullscreen y tras cambiar el perfil. Evitar mantener traducción fija en inglés cuando la interfaz/conversación sea española.

**Evidencia:** `apps/web/src/features/automations/builder/WorkflowBuilder.tsx` (montaje del panel), `apps/web/src/components/dashboard/HarlyAIPanel.tsx` (`firstName`, `EmptyState`), `apps/web/src/app/api/ai/chat/route.ts` (prompt).

### P1 · Respuesta de capacidad en lugar de propuesta concreta

El mensaje “me gustaría que cuando un candidato postule…” expresa una receta. `classifyHarlyIntent` detecta imperativos como `crea` y `rechaza`, pero no “me gustaría”, “quiero”, “necesito” o “haz una automatización”; puede clasificarlo como `workspace_fact` por `candidato`. El prompt indica revisar `listAutomationTools` y usar `prepareAutomationPatch`, `simulateAutomationProposal` y `applyAutomationProposal`, pero no garantiza la progresión ni tiene una prueba end-to-end de esta frase. El resultado observado fue explicación + pregunta de confirmación textual, sin propuesta ni tarjeta. Añadir una intención `automation_build` y ejemplos de paráfrasis españolas; medir, mediante trazas, si se llamaron tools antes de atribuir todo al modelo. Para tareas realizables, preparar y simular la propuesta en la misma respuesta y mostrar el diff. Si una parte no se puede implementar, explicar el bloqueo exacto y ofrecer un grafo alternativo revisable.

**Evidencia:** `apps/web/src/lib/ai/agent/intent.ts`, `apps/web/src/lib/ai/agent/system-prompt.ts`, `apps/web/src/lib/ai/agent/tools.ts`, conversación proporcionada. **Por confirmar con traza:** tools concretas llamadas en ese turno.

### P1 · Capacidad de evaluación descrita de forma insuficiente

El evento `application.created` existe. El catálogo marca `ai_score` como `available: false` hasta completar su contrato de revisión humana y ejecución durable; el registry ejecutable no registra `ai_score`. `WORKFLOW_EVENTS` tampoco contiene `evaluation.completed` o equivalente. Las condiciones sí pueden leer la última evaluación de una candidatura, pero el evento de postulación no garantiza que ya exista. El grafo V2 permite `delay` de duración (1 h = 3 600 000 ms), `set_status` y `send_email`. Por tanto, el flujo **exacto** solicitado no es construible hoy sin trabajo de backend/producto; la explicación de Harly acertó en la limitación principal, pero debió separar cada capacidad y precisar que el auto-rechazo por puntuación choca con la política actual de decisión humana.

**Evidencia:** `apps/web/src/features/automations/schema.ts`, `builder/catalog.ts`, `registry.ts`, `conditions.ts`, `definition/schema-v2.ts`, `apps/web/src/lib/ai/knowledge/harly-product-knowledge.ts`.

### P2 · “Working” repetido y sin significado

La UI acumula una línea `ToolStatus` por cada llamada de lectura y usa el fallback `Working` para toda tool ausente de `TOOL_LABELS`; las nuevas tools de Automations no aparecen en ese mapa. Incluso al terminar, conserva cada línea como check verde. Por eso tres llamadas pueden dejar tres “Working”. Mostrar una sola actividad consolidada mientras corre, con etiqueta localizada (“Revisando herramientas de automatización…”), y ocultar el rastro interno al terminar salvo que el usuario expanda detalles. Añadir labels a las tools de Automations y una prueba con tres tool parts desconocidas.

**Evidencia:** `apps/web/src/components/dashboard/HarlyAIPanel.tsx` (`TOOL_LABELS`, `ToolStatus`, bucle de `statusEls`).

### P2 · Ritmo visual y formato de respuesta

Cada `text part` se renderiza como un componente Markdown independiente, con márgenes `prose` y espaciado del contenedor; los estados de tools ocupan espacio adicional. La captura muestra texto denso con saltos frecuentes en un panel estrecho. La lectura de código confirma el potencial de fragmentación, pero **no demuestra** si esos saltos particulares los emitió el modelo o los introdujo el render: hace falta comparar el texto bruto del stream con el DOM. Unificar partes de texto contiguas, reducir márgenes entre párrafos/listas y probar una respuesta larga a anchuras de 360, 480 y 720 px. Añadir al prompt una pauta de dos párrafos cortos para respuestas de capacidad, sin listas salvo que ayuden a elegir.

**Evidencia:** `apps/web/src/components/dashboard/HarlyAIPanel.tsx` (Markdown por `part`, `prose-p:my-1`, `gap-2`), captura aportada.

### P2 · Contexto de editor insuficiente para cambios sin guardar

El Builder sí envía `automationContext` al panel cuando existe `draft.id`, pero usa `semanticGraphHash(canvas.graph)` como `contentHash` sin enviar el grafo local. El servidor usa ese contexto para propuestas; si hay cambios locales sin guardar, el hash local y la revisión del servidor pueden divergir y la IA no conoce el contenido no persistido. Para una automatización nueva no se envía contexto. Se necesita snapshot local estructurado o guardado explícito previo a la propuesta, con resolución de conflictos antes de aplicar. Cubrir los casos: nuevo sin guardar, existente limpio, existente editado localmente, otra pestaña editó el borrador.

**Evidencia:** `WorkflowBuilder.tsx` (montaje de HarlyAIPanel), `HarlyAIPanel.tsx` (transport), `apps/web/src/lib/ai/agent/tools.ts` (prepare).

## Comportamiento esperado para la frase del usuario

Respuesta objetivo: “Puedo diseñar la parte de recepción, revisión, espera y correo, pero hoy el Builder no genera la evaluación ni tiene un disparador cuando termina. Tampoco convertiré una puntuación de IA, por sí sola, en un rechazo automático. Te preparo una versión con revisión humana para puntuaciones menores de 70 y el correo una hora después de que alguien confirme el rechazo.” Si existe un grafo alternativo válido, Harly debe preparar, validar y simularlo, mostrar el diff y ofrecer la tarjeta de aplicación de borrador. No debe prometer que el flujo exacto corre hoy ni hacer una segunda pregunta genérica.

## Orden de trabajo para otro agente

1. **Corregir identidad:** sustituir el literal `Recruiter` por el nombre autenticado en la ruta fullscreen. Test de nombre y localización del estado vacío.
2. **Limpiar progreso:** mapear tools de Automations y consolidar estados; test de tres tools con fallback. El resultado no debe mostrar “Working” duplicado.
3. **Orquestación:** definir intención `automation_build`, fixtures con la petición española y variantes, y test que compruebe llamadas `listAutomationTools` y, para una receta compatible, `prepareAutomationPatch` + simulación + tarjeta de confirmación. Registrar motivo de bloqueo cuando una acción/evento no existe.
4. **Capacidades:** mantener el catálogo de acciones/eventos ejecutables como fuente única para respuestas. No inferir que `ai_score` funciona porque aparece en el enum. Cubrir evaluación no disponible, evento ausente, condiciones existentes y decisión humana con pruebas de respuesta.
5. **Formato:** capturar texto bruto y DOM para el mismo turno; fusionar partes contiguas, ajustar espacios y verificar móvil/escritorio. Objetivo: una respuesta de capacidad cabe en la vista sin tres estados históricos ni saltos artificiales.
6. **Contexto de borrador:** resolver discrepancia entre grafo local y server revision/hash antes de ofrecer aplicar. Prueba de conflicto multi-pestaña.

## Verificación pendiente

No se ejecutó el chat autenticado contra el modelo configurado ni se obtuvo la traza del turno de Isabella. Antes de declarar resuelto el punto de orquestación, reproducir la frase exacta con un workspace de prueba, inspeccionar tool calls, respuesta bruta y DOM, y repetir con una receta implementable. Evitar enviar candidaturas reales, correos o rechazos durante el ensayo.
