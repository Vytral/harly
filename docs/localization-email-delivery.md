# Preferencias de idioma para correos

## Estado

Las plantillas admiten seis locales. Restablecimiento de contraseña y magic link consultan `candidates.preferred_email_locale`. Confirmaciones de postulación, pipeline, entrevistas y ofertas guardan un snapshot de la preferencia del candidato en outbox. Los avisos de postulación a reclutadores guardan el locale de cada destinatario desde `user.preferred_email_locale`. La preferencia de interfaz se guarda en la cookie `harly_locale`; no actualiza la preferencia de correo de la cuenta. El campo `user.languages` representa idiomas que la persona conoce y no debe tratarse como preferencia de correo.

Por eso, los correos siguen en inglés mientras no exista una preferencia asociada al destinatario. No se debe copiar el locale del remitente, del workspace, de la sesión de quien ejecuta una acción ni de `Accept-Language`.

## Preferencias persistidas

El diseño agrega `preferred_email_locale` nullable a `user` y `candidates`. Ambos campos aceptan únicamente `en`, `es`, `pt-BR`, `de`, `fr` y `nl-NL`. Los registros existentes conservan `NULL`; no se infiere su idioma a partir de perfil, zona horaria, país o contenido.

La normalización compartida está en `packages/config/src/email-locale.ts`. Acepta diferencias de mayúsculas y espacios, como `PT-br`, y devuelve una etiqueta canónica. Para un valor inválido devuelve `null`; al resolver un correo legado o una preferencia no reconocida se usa inglés.

Account y el perfil del portal permiten guardar preferencias de correo separadas del idioma de interfaz. El selector de interfaz conserva su cookie en `apps/web/src/i18n/actions.ts` y no aporta el valor inicial de ninguna preferencia. Una postulación pública no captura un idioma de correo: los candidatos nuevos usan inglés, y los existentes reciben su preferencia guardada si la tienen.

## Precedencia

La selección al encolar o enviar debe seguir estas reglas:

1. Usar la preferencia persistida de la persona destinataria: `user.preferredEmailLocale` para miembros y `candidates.preferredEmailLocale` para candidatos.
2. Para una invitación a alguien sin cuenta, usar una preferencia de destinatario capturada explícitamente en la invitación si el flujo la recoge. Si no existe, usar inglés.
3. Para registros viejos, `NULL` o un locale inválido, usar inglés.

El locale de la persona que inicia el envío nunca participa en esta resolución. Los textos escritos por el workspace y por el usuario se mantienen sin traducir.

## Cola y reintentos

Al crear filas para confirmaciones de postulación, pipeline, entrevistas u ofertas, el encolado copia el locale resuelto desde `candidates.preferredEmailLocale` a `payload.recipientLocale`. Cada aviso de reclutador incluye el locale del usuario destinatario. El trabajador valida el valor y lo pasa al asunto y a la plantilla. Un reintento usa el snapshot, aunque la preferencia cambie después. Las filas antiguas sin `recipientLocale` se procesan en inglés.

`email_outbox.payload` ya es JSON y conserva los datos durante los reintentos. No hace falta una columna adicional para el locale del envío. Para evitar colisiones en el contrato existente, se debe añadir `recipientLocale` sin cambiar el `dedupeKey`; la idempotencia sigue perteneciendo al evento de negocio.

## Rutas de integración

### Datos y validación

- `packages/config/src/email-locale.ts`: lista, tipo, normalización y fallback compartidos.
- `packages/db/src/schema.ts`: campos nullable y checks en `user` y `candidates`.
- `packages/db/migrations/`: migración generada para las dos columnas y checks. No hay backfill de idioma.
- `apps/web/src/i18n/config.ts` y `packages/emails/src/i18n.ts`: reutilizar la lista y normalizador comunes para mantener los mismos tags.

### Cuenta y autenticación

- `apps/web/src/features/account/EmailLanguagePreference.tsx`, `apps/web/src/features/people/actions.ts` y `apps/web/src/features/people/validators.ts`: Account guarda una preferencia explícita en `user.preferredEmailLocale`; el locale de interfaz solo traduce los controles. Recursos temporales: `/private/tmp/i18n-email-preference/{locale}.json`.
- `apps/web/src/features/portal/PortalEmailLanguagePreference.tsx`, `apps/web/src/features/portal/profile-actions.ts`, `apps/web/src/features/portal/profile-validation.ts` y `apps/web/src/app/(portal)/portal/profile/page.tsx`: el candidato autenticado puede guardar o borrar `candidates.preferredEmailLocale`. La acción vincula el update al candidato y workspace de la sesión; el idioma de interfaz no preselecciona el control. Recursos temporales: `/private/tmp/i18n-candidate-email/{locale}.json`.
- `apps/web/src/features/portal/actions.ts`, `apps/web/src/features/portal/auth-actions.ts` y `apps/web/src/lib/portal-credentials.ts`: magic link y reset de contraseña usan el locale del candidato cuando existe, con fallback inglés. La respuesta del magic link y la del reset conservan su comportamiento genérico.
- `apps/web/src/i18n/actions.ts`: la selección de idioma de interfaz se almacena en cookie y no se copia a `preferredEmailLocale`.
- `packages/auth/src/auth.ts` y `packages/auth/src/auth-logic.ts`: implementado para restablecimiento y magic links. Ambos consultan la preferencia del destinatario y pasan el mismo locale al asunto y a la plantilla; valores ausentes, desconocidos o errores de consulta usan inglés. Magic links normaliza el correo para la consulta y no devuelve el resultado de búsqueda. La verificación de correo no es obligatoria en la configuración actual (`requireEmailVerification: false`).
- `apps/web/src/features/workspaces/actions.ts`: bienvenida e invitaciones se envían directamente. Resolver por cuenta destinataria cuando exista; invitaciones externas necesitan un locale de destinatario explícito o el fallback inglés. No usar el locale del administrador.

### Correos de negocio en la outbox

- `apps/web/src/features/applications/data.ts` y `apps/web/src/features/applications/notifications.ts`: la confirmación de postulación toma el locale persistido del candidato al encolar. Los correos a reclutadores llevan locale por cada destinatario obtenido desde su preferencia guardada.
- `apps/web/src/features/portal/actions.ts`: las postulaciones iniciadas por un candidato autenticado consultan y pasan la preferencia por destinatario para los avisos a owners.
- `apps/web/src/lib/email/outbox-processor.ts`: `enqueueEmailOutbox` resuelve y persiste el snapshot para `pipeline.*`, `interview.*`, `offer.extended` y `offer.withdrawn`. Las plantillas integradas y sus asuntos usan ese mismo locale. Las filas previas que no tienen `recipientLocale` mantienen el fallback inglés.
- `apps/web/src/features/pipeline/emails.ts` y `apps/web/src/features/pipeline/actions.ts`: siguen enviando el correo de etapa o rechazo a través del helper central, sin derivar idioma del actor.
- `apps/web/src/features/interviews/email-queue.ts`, productores en `features/interviews/actions.ts`, `features/interviews/api-side-effects.ts` y `app/api/webhooks/cal/route.ts`: invitación, reprogramación y cancelación usan el snapshot central. `timeZone` es distinto de idioma y no sirve para inferirlo.
- `apps/web/src/features/offers/actions.ts`, `apps/web/src/features/offers/service.ts` y `apps/web/src/lib/email/outbox-processor.ts`: oferta y retiro de oferta guardan el snapshot junto con el payload durable. El snapshot de `offer.extended` se resuelve por la relación oferta-candidato.
- `apps/web/src/lib/esign/native/remote.ts`, `apps/web/src/lib/esign/native/finalize.ts`, `apps/web/src/features/documents/expiry.ts` y `apps/web/src/lib/email/outbox-processor.ts`: los destinatarios de firma pueden no tener cuenta Harly. Usar una preferencia explícita en el destinatario de firma si se recopila; de otro modo inglés. Los avisos generados en `apps/web/src/lib/esign/native/notice-content.ts` aún tienen copy de sistema solo en inglés y necesitan un catálogo antes de internacionalizar ese flujo.
- `apps/web/src/server/reports/scheduled.ts` y otros correos personalizados: conservar el contenido del usuario; solo localizar la envoltura cuando el flujo tenga preferencia fiable del destinatario.

## Contratos para emisores

Para plantillas y asuntos de sistema, usar una misma preferencia en ambos lugares:

```ts
const recipientLocale = resolveEmailLocale(payload.recipientLocale);
const subject = applicationReceivedCandidateSubject({
  ...values,
  locale: recipientLocale,
});
const react = createElement(ApplicationReceivedCandidate, {
  ...values,
  locale: recipientLocale,
});
```

El helper central de enqueue establece `recipientLocale` para los tipos de candidatos cubiertos; cada trabajador debe soportar payloads viejos sin esa propiedad, con fallback inglés. Un cambio de preferencia después del envío inicial no cambia el idioma de reintento de la misma fila.

## Pendientes y límites

El formulario de postulación pública aún no recoge una preferencia de correo; en candidatos nuevos el fallback sigue siendo inglés. Los candidatos existentes pueden ajustar el idioma desde el portal. Las plantillas personalizadas escritas por el workspace conservan asunto y cuerpo originales; no se traducen automáticamente. La prueba DB para snapshots requiere la base desechable y sus migraciones; no se usa ni modifica la instancia local original. La discrepancia de hash de la migración 0160 sigue registrada como bloqueo para esa base original; no se alteró la migración anterior.
