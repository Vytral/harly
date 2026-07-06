# Auditoría de la Lista de Deseos (Harly)

_Última actualización: 2026-07-05_

Esta auditoría compara el estado actual de la base de código de **Harly** contra los requerimientos y sugerencias listados en [listadedeseos.md](file:///Users/maximiliano/downloads/curious-monkey/listadedeseos.md), utilizando el registro de [PROGRESO.md](file:///Users/maximiliano/downloads/curious-monkey/PROGRESO.md) y la verificación directa de la base de código.

---

## 🟢 1. Completados (Totalmente Implementados)

Estas características ya se encuentran completamente programadas y funcionales en el sistema:

*   **Wizard de Onboarding de Administradores**: Configurado en [OnboardingWizard.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/app/(onboarding)/onboarding/_components/OnboardingWizard.tsx), permitiendo configurar el nombre de la organización, rol del usuario, revisar integraciones e invitar miembros de forma fluida.
*   **Conexión API con Cal.com**: Implementado con soporte para API v2, registro automático de webhooks y generación de enlaces de entrevista autocompletados en [CalSettingsCard.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/features/workspaces/CalSettingsCard.tsx) y [cal-settings-actions.ts](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/features/workspaces/cal-settings-actions.ts).
*   **Reconocimiento de múltiples formatos de CV**: Lógica de extracción de texto para PDF, DOCX, DOC, RTF y TXT implementada en [extract-text.ts](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/lib/resume/extract-text.ts) con soporte para parseo estructurado vía IA en [parse-resume.ts](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/lib/ai/surfaces/parse-resume.ts).
*   **Creación de Puestos por Pasos (Wizard)**: El formulario de puestos en [JobForm.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/features/jobs/JobForm.tsx) está organizado en pasos: detalles del puesto, descripción (con generación de borradores con IA "Draft for me"), formulario de solicitud y pantalla de publicación.
*   **Campos de puesto avanzados**: Incluye departamento, ubicación, experiencia, educación, tipo de empleo, tipo de espacio (remoto/presencial/híbrido), fotos de oficina, mapas interactivos (sin necesidad de API keys) e información de compensación (mínimo, máximo, moneda y periodo mensual/anual).
*   **Búsqueda global inteligente (`Cmd + K`)**: Menú interactivo implementado en [CommandMenu.tsx](file:///Users/maximiliano/downloads/curious-monkey/components/dashboard/CommandMenu.tsx) para buscar puestos y candidatos rápidamente desde cualquier sección con atajos de teclado.
*   **Consejos para ofertas de trabajo**: Incluidos en el panel derecho de consejos de redacción de vacantes (`Consejos rail`) durante la creación de puestos en [JobForm.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/features/jobs/JobForm.tsx#L791).
*   **Skeletons de carga**: Estructurados a nivel de dashboard en [loading.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/app/(dashboard)/dashboard/loading.tsx) para mejorar la percepción de rendimiento.
*   **Notificaciones**: Campana funcional en la barra superior con recuento de no leídos, estados de lectura y desvío al buzón en [NotificationsBell.tsx](file:///Users/maximiliano/downloads/curious-monkey/components/dashboard/NotificationsBell.tsx).
*   **Gestión del perfil personal**: Edición de perfil, teléfono, biografía, links personales y avatar en [AccountSettingsPanel.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/features/account/AccountSettingsPanel.tsx).
*   **Importador masivo**: Importador CSV dinámico con auto-mapeo y asignación de columnas en [ImportCandidatesDrawer.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/features/candidates/import/ImportCandidatesDrawer.tsx).
*   **Seguimiento y Pipeline**: Tablero drag-and-drop con histórico detallado, notas internas y timeline en la ficha del candidato.

---

## 🟡 2. Parcialmente Completados (Requieren Pulirse)

Características presentes técnicamente o de forma inicial, pero que requieren afinación o interfaz visual:

*   **Conexión con Resend**: La integración de emails con Resend ya existe en el backend (`@harly/emails`), pero **falta la UI en Settings** para que el usuario pueda configurar/actualizar sus credenciales (API keys) directamente desde la plataforma sin recurrir a variables de entorno.
*   **Gravatar para usuarios**: Se usa dinámicamente en los avatares de los candidatos mediante el hash de su email, pero el menú del usuario administrador ([UserMenu.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/components/dashboard/UserMenu.tsx)) depende de la imagen proveída por OAuth (Google/GitHub). Falta permitir subidas de avatar locales con límites y configurar Gravatar como fallback para el perfil del equipo.
*   **Botón de repositorio y etiqueta `[BETA]`/`[OSS]`**: El menú de usuario enlaza al repositorio en GitHub y muestra la versión actual, pero **falta agregar la etiqueta explícita de BETA/OSS al lado de la versión y obtener/mostrar la cantidad de estrellas de GitHub dinámicamente** en el botón.
*   **Preguntas del onboarding de administrador**: Falta implementar la pregunta de la encuesta inicial: *"¿Cómo te enteraste de OpenHire?"* (How did you hear about OpenHire?).
*   **Redirección automática a la app (`/`)**: Actualmente la raíz `/` muestra la página de empleo pública configurada en [page.tsx](file:///Users/maximiliano/downloads/curious-monkey/apps/web/src/app/(public)/page.tsx). Si un usuario ya está autenticado con sesión activa, debería ser redirigido directamente a `/dashboard` en lugar de ver el portal público.

---

## 🔴 3. No Iniciados o Faltantes

Requerimientos de la lista de deseos que aún no tienen código asociado en la plataforma:

### Integraciones y Correo
*   **SMTP, AWS SES y alternativas**: El sistema de emails solo soporta Resend. Falta agregar opciones para configurar SMTP genérico o AWS SES.
*   **Roadmap de Integraciones**: Google Calendar y Cal.com ya están integrados. Greenhouse, LinkedIn y Gmail se muestran como "Próximamente" en la UI.
*   **Publicación directa en LinkedIn**: Falta programar la funcionalidad para publicar las ofertas de trabajo directamente desde el wizard de publicación.

### Seguridad y Aspectos Legales
*   **Cumplimiento Legal (GDPR, CCPA, ISO 42001, SOC 2)**: GDPR base implementado (consent checkbox, audit logs, legal settings, public legal pages). Falta CCPA, ISO 42001, SOC 2.
*   **Términos, Condiciones y Privacidad Personalizables**: Settings admin con campos para privacy policy y terms of service + public legal pages ya implementados.
*   **Protección anti-bots (Cloudflare Turnstile)**: Server actions listos, falta UI para habilitar.

### Funcionalidades de Producto / Dashboard
*   **Creación y limpieza de Datos de Ejemplo**: No existe el banner del Overview ni el botón para "Completar la cuenta con datos de ejemplo".
*   **Dashboard / Overview Personalizable**: La disposición de widgets en el dashboard es estática. Falta implementar el sistema para añadir, quitar o reordenar widgets.
*   **Restricción a correos corporativos (Work Email)**: No existe una regla de validación de dominios de correo para restringir el registro a correos de empresa en la versión Cloud.
*   **Sección de "Quiénes Somos" y "Testimonios" en Career Page**: El creador visual no cuenta con bloques opcionales para la historia de la empresa ni testimonios.
*   **Formulario directo vs. flotante**: El formulario de solicitud pública siempre es en página directa.
*   **Historial general/Actividad en TopBar**: El botón de actividad abre un popover estático de prueba.
*   **Módulos de HRIS avanzados**: Calendario laboral, bandeja de entrada unificada, chat interno, PTO, registro de horas.
*   **Portal de Candidatos**: ✅ Implementado — OAuth (Google, GitHub, LinkedIn), login, dashboard, jobs, profile.

---

> [!TIP]
> **Recomendaciones de prioridad para el próximo sprint:**
> 1. **Redirección a la App**: Redirigir a usuarios con sesión activa de `/` a `/dashboard` (UX crítica).
> 2. **Configuración de Resend en Settings**: Añadir un campo de API Key en los ajustes de email para desacoplarlo de las variables de entorno.
> 3. **Políticas de Privacidad y Términos**: Agregar un campo Markdown en la configuración del Careers Page y mostrarlo en el pie de los formularios de postulación para cumplir con GDPR.
