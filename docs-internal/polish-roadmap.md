# Harly — Internal Delivery Roadmap

_Última actualización: 2026-07-19_

Este documento traduce el [roadmap público](../ROADMAP.md) a prioridades de
ejecución. No es una promesa de fechas ni una lista para perseguir paridad de
features con Workable, Ashby o Greenhouse. La prioridad es que el flujo central
de Harly sea confiable para equipos pequeños que valoran self-hosting, control
de datos y extensibilidad.

## Capacidades establecidas

- Career pages con builder, cuatro templates, board público, widget embebible,
  sitemap, robots, metadata y `JobPosting` structured data.
- Jobs, aplicaciones, candidatos, talent pool, pipeline Kanban/lista, tareas,
  entrevistas, scorecards y ofertas.
- Calendarios y videollamadas mediante Google, Microsoft/Teams, Cal.com, Zoom y
  Jitsi, según la configuración del operador.
- Email outbound durable, templates, inbox/reply tracking e IMAP/webhooks.
- REST API v1, API keys con scopes, OpenAPI y webhooks outbound firmados.
- Candidate portal, consentimiento, retención, DSAR/export/erasure, audit logs,
  Turnstile y avisos legales configurables.
- Organizaciones, RBAC, passkeys, 2FA y SSO OIDC/SAML.
- IA BYO-key para asistencia dentro de Harly; los flujos centrales no dependen
  de un proveedor de IA.
- CLI, Docker, scheduler, doctor, backups, restores y almacenamiento local/S3.

## P0 — confianza de lanzamiento

- [ ] Ejecutar y documentar pruebas del recorrido completo en un deployment
  limpio: setup → job → apply → review → interview → offer.
- [ ] Probar onboarding sin asistencia con usuarios externos y corregir primero
  bloqueos, pérdida de datos, permisos, errores confusos y accesibilidad.
- [ ] Aumentar cobertura de aislamiento por workspace, RBAC, intake público,
  colas durables y operaciones destructivas de privacidad.
- [ ] Completar documentación pública de instalación, configuración, upgrades,
  integraciones y solución de problemas.
- [ ] Cerrar stubs visibles o retirarlos de navegación hasta que tengan un flujo
  funcional.

## P1 — flujos adaptables

- [ ] Custom fields en candidates y jobs.
- [ ] Approval workflows para requisiciones y ofertas.
- [ ] Templates reutilizables para jobs, entrevistas y scorecards.
- [ ] Reporting más profundo, filtros guardados y exports configurables.
- [ ] SCIM y administración enterprise adicional.
- [ ] Integration SDK documentado para adaptadores mantenidos por la comunidad.

## P2 — ecosistema e AI-assisted sourcing

### Fase 1 — asistencia sin adquisición de datos

- [ ] Generar estrategias de sourcing y consultas Boolean/X-Ray desde los
  criterios de un job.
- [ ] Permitir copiar/abrir consultas para que el recruiter revise resultados en
  la fuente original.
- [ ] Importar manualmente sólo los perfiles elegidos, registrando source y
  consentimiento/base legal cuando corresponda.

### Fase 2 — contrato abierto de proveedores

- [ ] Diseñar `SourcingProvider` con búsqueda paginada, normalización de perfil,
  provenance, límites, errores y capabilities explícitas.
- [ ] Mantener credenciales cifradas y scoped por workspace.
- [ ] Deduplicar contra candidatos existentes antes de importar.
- [ ] Exigir selección humana antes de guardar o contactar perfiles.

### Fase 3 — adaptadores autorizados

- [ ] Evaluar uno o dos proveedores profesionales con API y licencia compatibles
  con self-hosting y almacenamiento de datos de candidatos.
- [ ] Añadir ranking explicable contra criterios del job usando el proveedor de
  IA configurado por el workspace.
- [ ] Documentar costos, términos, retención, eliminación y responsabilidades
  del operador para cada adaptador.

Una API key de OpenAI, Anthropic, Gemini u otro modelo no entrega acceso a
LinkedIn, job boards o bases externas. No implementar scraping no autorizado ni
presentar AI sourcing en la UI antes de que exista un proveedor funcional y un
flujo completo, legalmente sostenible y verificable.

## Secuencia recomendada

1. Confianza de lanzamiento y usuarios reales.
2. Documentación pública y eliminación de stubs.
3. Custom fields, templates y approvals según demanda observada.
4. Integration SDK.
5. AI-assisted sourcing fase 1; fases 2–3 sólo después de validar necesidad y
   proveedores.
