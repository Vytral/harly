# Inbox ATS Refactor — Plan de Implementacion

_Fecha: 2026-07-21 · Alcance: convertir el Inbox en una herramienta de recruiting operativa_

## Diagnostico

El modelo de datos canonico (`mail_threads`/`mail_messages`) ya existe y es solido:
- `insertCanonicalMessage` en `lib/mail/canonical.ts` maneja deduplicacion, threading y persistencia.
- `sendCandidateMessage` y el bulk send ya escriben en el modelo canonico.
- El inbox ya lee de `mail_threads`/`mail_messages`.

**El problema central**: `replyMailboxThreadAction` depende exclusivamente de `getMailboxConfig()` (IMAP/SMTP). Cuando el inbound es por webhook (Resend/Postmark), `getMailboxConfig()` retorna null y la accion de reply falla. El inbox webhook queda en modo solo-lectura.

## Recomendacion

Usar Resend/Postmark como camino principal de inbound + outbound. IMAP/SMTP queda como integracion avanzada para empresas que lo requieran. El usuario debe pensar en "respuestas de candidatos", no en servidores IMAP, dominios MX o webhooks.

## Fases de implementacion

### Fase 1 — Reply unificado (P0, ~1h)

Hacer que `replyMailboxThreadAction` use `getWorkspaceEmailSender()` cuando no hay IMAP configurado. Si hay IMAP, usarlo (comportamiento actual). Si no, usar el sender del workspace (Resend o SMTP outbound).

**Archivos**:
- `apps/web/src/features/mailbox/actions.ts` — refactorizar `replyMailboxThreadAction`

**Criterio**: un recruiter puede responder desde el Inbox independientemente de como esta configurado el inbound.

### Fase 2 — canReply en el status del inbox (P1, ~30min)

Agregar `canReply: boolean` al `InboxMailboxStatus` para que la UI sepa si puede mostrar el composer de respuesta.

**Archivos**:
- `apps/web/src/features/mailbox/data.ts` — agregar `canReply` al status
- `apps/web/src/features/mailbox/InboxThreadReader.tsx` — condicionar el composer

**Criterio**: la UI no muestra el composer cuando no hay forma de responder, y muestra un mensaje claro de "Configura email para responder".

### Fase 3 — Migracion legacy candidate_messages (P1, ~2h)

Asegurar que todos los paths de envio de email pasen por el modelo canonico. Verificar que `sendCandidateMessage`, bulk send, pipeline emails, offer emails, interview emails y notification emails escriban en `mail_threads`/`mail_messages`.

**Archivos**:
- `apps/web/src/features/candidates/actions.ts` — ya usa `insertCanonicalMessage` en sendCandidateMessage y bulk send
- `apps/web/src/lib/email/outbox-processor.ts` — verificar que los delivers escriban al canonico
- `apps/web/src/features/pipeline/actions.ts` — verificar que las notificaciones de pipeline usen canonico
- `apps/web/src/features/offers/actions.ts` — verificar que los emails de oferta usen canonico

**Criterio**: todo email enviado por Harly aparece en `mail_threads`/`mail_messages` y es visible en el Inbox y en el timeline del candidato.

### Fase 4 — Filtros de recruiting (P2, ~1.5h)

Los filtros actuales ya incluyen `replies`, `unassigned`, `unread`, `assigned-to-me`, `archived`. Verificar que funcionan correctamente y ajustar labels/nombres.

Agregar filtro "Needs reply" (threads con ultimo mensaje inbound sin respuesta outbound posterior).

**Archivos**:
- `apps/web/src/features/mailbox/data.ts` — agregar filtro `needs-reply`

**Criterio**: los filtros cubren los casos de uso reales de un recruiter.

### Fase 5 — Timeline unificado (P2, ~1.5h)

El perfil del candidato debe mostrar las conversaciones del Inbox como parte de su timeline, sin duplicar mensajes. Las respuestas enviadas desde el Inbox deben aparecer en el perfil del candidato, y viceversa.

**Archivos**:
- `apps/web/src/features/candidates/` — queries de timeline
- `apps/web/src/features/mailbox/data.ts` — queries de threads por candidato

**Criterio**: el historial de comunicacion de un candidato es coherente en Inbox y Candidate Profile.

## Fuera de alcance (post-GA)

- Clon de Gmail completo
- OAuth Gmail/Outlook como integracion de mailbox (ya existe IMAP/SMTP manual)
- SMS, WhatsApp u otros canales
- Editor HTML avanzado
- Matching fuzzy basado en IA para candidatos desconocidos (el matching por token ya existe)
- Automatizacion completa de triage sin revision humana

## Criterios de aceptacion finales

- [ ] Un recruiter puede responder un email desde el Inbox usando Resend, SMTP o IMAP.
- [ ] Un reply entrante (webhook o IMAP) nunca desaparece silenciosamente.
- [ ] Un email recibido se asocia automaticamente a la aplicacion correcta cuando existe token.
- [ ] Un email no asociado aparece en el filtro "Unassigned".
- [ ] Los mensajes no se duplican durante reintentos webhook/sync.
- [ ] Las notificaciones llevan al thread correcto.
- [ ] El inbox funciona con workspace vacio y con datos.
- [ ] Typecheck, lint y tests pasan despues de cada fase.
