Stack — decisión final
frontend + SSR
Next.js 15 App Router
SSR para job board (SEO), RSC para dashboard. Un solo repo.
API
tRPC + TypeScript
Type-safe end-to-end. Sin REST manual, sin DTOs extra.
DB
Neon + Drizzle ORM
Free tier generosa. Drizzle es más rápido y liviano que Prisma.
auth
Better Auth
Auth.js v5 es un dolor. Better Auth es más limpio y moderno.
UI
shadcn/ui + Tailwind 4
Componentes que realmente posees. Tailwind 4 sin config.
email
Resend + react.email
3000 emails/mes gratis. Templates en JSX. Consistente.
jobs/queues
Trigger.dev v3
Background jobs con retry, logs, y UI — self-hosteable.
files
Uploadthing / S3
CVs y adjuntos. En self-host apunta a MinIO o R2.


---

Arquitectura del proyecto
Job board público
/jobs — SSR, SEO optimizado
/jobs/[slug] — detalle del cargo
/apply/[slug] — formulario candidato
Custom domain support
Panel reclutador
/dashboard — métricas
/jobs — gestión de cargos
/pipeline — Kanban drag&drop
/candidates — perfiles
/settings — equipo, emails, etc
API pública
REST en /api/v1/*
Webhooks configurables
API keys por workspace
OpenAPI spec incluido


---

undación y job board
Semanas 1–4
Schema DB completoJobs, candidates, pipeline stages, orgs
Auth + multi-tenantWorkspaces por organización
Job board públicoSSR, SEO, formulario de postulación
Upload de CVsPDF, validación, storage
Docker composeUn comando y funciona en VPS
README épicoGIF, screenshots, deploy guide
2
Panel reclutador completo
Semanas 5–9
Pipeline KanbanDrag & drop, etapas custom, bulk actions
Perfil de candidatoTimeline, notas, score, adjuntos
Email templatesVariables dinámicas, preview, historial
AnalyticsTime-to-hire, funnel conversion, sources
Multi-user + rolesAdmin, recruiter, hiring manager
SchedulingLinks de entrevista, integración Cal.com
3
Developer experience y diferenciadores
Semanas 10–14
REST API públicaCon OpenAPI spec y docs autogenerados
WebhooksOn application, on stage change, etc
CV parserExtrae nombre, email, skills, experiencia
Setup wizardAquí entra react-onboard después 👀
Job board themingLogo, colores, dominio custom
GDPR toolsData deletion, export — esencial en EU
4
Lanzamiento y tracción
Post semana 14
Product Hunt launchCon demo live, video, GIFs del pipeline
Cloud hostedapp.tudominio.com — free + Pro plan
r/selfhosted + HNEl canal más directo para stars iniciales
AI features (Pro)Candidate scoring, job description gen


---


Self-hosting — cómo funciona para el dev que lo instala
Docker compose (VPS)
Un docker-compose.yml con Postgres, la app, y Redis. El dev hace git clone + docker compose up y en 3 minutos tiene todo corriendo. Variables de entorno en .env.example documentado.
$5–15/mes en Railway/Hetzner
One-click deploys
Botones de deploy a Vercel (app) + Neon (DB) directamente desde el README. Para el dev que no quiere tocar Docker. Setup en 5 minutos.
Vercel free tier + Neon free
Script de setup
Un setup.sh que pregunta el dominio, configura el .env, corre migraciones, y crea el primer usuario admin. Sin wizard por ahora, pero limpio.
Reemplazable por react-onboard v1
Estructura del repo
Monorepo con Turborepo: apps/web (Next.js), packages/db (Drizzle schema), packages/emails (react.email), packages/ui (shadcn shared). Escalable desde el día 1.
Turborepo gratis
Diferenciadores vs lo que existe
Diseño al nivel de Workable
Job board con theming custom, pipeline visual, dashboard con métricas reales. No parece un proyecto de curso.
Setup en minutos, no horas
Docker one-liner + deploy a Vercel/Railway. Reqcore tarda menos que OpenCATS pero tú lo superas en DX.
API y webhooks desde v1
Ningún ATS open-source tiene API pública decente. Esto atrae a devs que quieren integrar con su stack.


---


No existe un ATS open-source que sea bonito, rápido de instalar, y pensado para developers
El modelo a emular es Twenty.com para CRM o Cal.com para calendarios: open-source con diseño cuidado, self-host en minutos con Docker, REST API limpia, y cloud hosting como monetización. Nadie lo ha hecho para ATS todavía.
Features del MVP — qué entra y qué no
Pipeline KanbanEtapas custom drag & drop. El corazón del ATS.
Job board públicoURL tuya.ats.io/jobs — sin config extra.
Gestión de candidatosPerfil, historial, notas, estados.
Email templatesRechazo, avance, entrevista — con variables.
Docker one-linerdocker compose up y funciona. Killer feature real.
REST API completaWebhooks incluidos. Developers lo van a amar.
CV parser básicoExtrae nombre, email, experiencia. No necesita ser perfecto.
Analytics simplesTime-to-hire, conversion por etapa. Nada existe en OSS.
core MVP   diferenciadores
Roadmap por fases
Semanas 1-6
MVP core
Auth, jobs, candidatos, pipeline Kanban, job board público, Docker compose. Lanzas en GitHub con README épico.
Semanas 7-10
Developer experience
REST API + webhooks, CV parser, email templates, analytics básicos. Acá empiezas a buscar primeros stargazers.
Post-lanzamiento
Cloud hosting + monetización
Versión hosted en tu dominio. Plan free (1 job activo) + Pro ($19/mes, ilimitado). Open-source sigue gratis forever.
Cómo monetizar siendo open-source
Cloud hosting managed Plan Pro con AI features Enterprise self-host support Integraciones premium


---

El insight clave acá es el modelo Cal.com / Twenty: open-source no significa gratis para siempre como negocio. El código es público, el hosting managed es de pago. La comunidad te da distribución orgánica (GitHub stars, Product Hunt, HN), y el cloud te da MRR.
Dado que ya dominas Laravel + React del panel de PloxHost, el stack natural sería exactamente eso — no tiene sentido aprender Next.js desde cero para este proyecto. Tienes ventaja de velocidad real ahí.
Lo más importante para que despegue en GitHub es el README: un GIF del pipeline Kanban funcionando, el docker compose up de un liner, y capturas bonitas. Eso solo puede darte 200-500 stars en las primeras semanas si lo posteas bien en Reddit (r/selfhosted, r/sysadmin) y Hacker News.