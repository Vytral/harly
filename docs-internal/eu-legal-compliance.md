# EU Legal Compliance — Harly ATS

> Referencia completa de regulaciones europeas aplicables a Harly.
> Fecha de investigación: Junio 2026

---

## Índice

1. [Visión General](#1-visión-general)
2. [GDPR — Reglamento General de Protección de Datos](#2-gdpr)
3. [EU AI Act — Ley de Inteligencia Artificial](#3-eu-ai-act)
4. [ePrivacy Directive — Cookie Law](#4-eprivacy-directive)
5. [Modelo de Separación EU / No-EU](#5-modelo-de-separación)
6. [Gap Actual vs. Requisitos](#6-gap-actual)
7. [Checklist de Cumplimiento](#7-checklist)
8. [Fuentes y Referencias](#8-fuentes)

---

## 1. Visión General

Harly es un ATS (Applicant Tracking System) open-source que procesa datos personales de candidatos. Las regulaciones de la UE aplican cuando:

- El ATS procesa datos de candidatos residentes en la UE
- El output del sistema AI se usa dentro de la UE
- El cliente (empresa que usa Harly) tiene presencia en la UE
- El servicio se ofrece a usuarios dentro de la UE

**Escenario típico:** Una empresa europea usa Harly para contratar. Los candidatos son residentes EU. Todos los datos de esos candidatos están sujetos a GDPR, AI Act, y ePrivacy.

**Multas máximas:**
| Regulación | Multa máxima |
|------------|-------------|
| GDPR | €20M o 4% del facturado global |
| EU AI Act | €35M o 7% del facturado global |
| ePrivacy | Varía por país (ej: Alemania hasta €300K, Italia hasta €1M+) |

---

## 2. GDPR

**Reglamento (UE) 2016/679** — Vigente desde mayo 2018

### 2.1 Principios Fundamentales (Art. 5)

1. **Licitud, lealtad y transparencia** — Datos procesados legalmente, con información clara al interesado
2. **Limitación de finalidad** — Datos recogidos para fines determinados, explícitos y legítimos
3. **Minimización de datos** — Solo los datos necesarios para la finalidad
4. **Exactitud** — Datos exactos y actualizados
5. **Limitación de conservación** — No más tiempo del necesario
6. **Integridad y confidencialidad** — Seguridad adecuada
7. **Responsabilidad demostrable** — Capacidad de demostrar cumplimiento

### 2.2 Bases Legales para Procesamiento (Art. 6)

Para datos de candidatos en un ATS, las bases más comunes son:

| Base legal | Cuándo usar | Ejemplo en Harly |
|------------|-------------|------------------|
| Consentimiento (Art. 6(1)(a)) | Procesamiento voluntario, sin efecto en la relación contractual | Talent pool, newsletter de empleo |
| Interés legítimo (Art. 6(1)(f)) | Necesario para el proceso de selección, con balance de intereses | Evaluar candidatura para un puesto específico |
| Ejecución de contrato (Art. 6(1)(b)) | Procesamiento necesario para un contrato o pre-contrato | Cerrar la relación candidatura |

**Nota:** El interés legítimo requiere un **Legitimate Interest Assessment (LIA)** documentado.

### 2.3 Derechos del Interesado (Candidatos)

| Derecho | Artículo | Descripción | Plazo de respuesta |
|---------|----------|-------------|-------------------|
| **Acceso** (DSAR) | Art. 15 | Copia de todos los datos personales que se tienen | 30 días |
| **Rectificación** | Art. 16 | Corregir datos inexactos | Sin demora indebida |
| **Borrado** (Right to Erasure) | Art. 17 | Eliminar datos cuando ya no son necesarios o se retira consentimiento | 30 días |
| **Restricción** | Art. 18 | Limitar el procesamiento en ciertos casos | Sin demora indebida |
| **Portabilidad** | Art. 20 | Recibir datos en formato estructurado y legible | Sin demora indebida |
| **Oposición** | Art. 21 | Oponerse al procesamiento basado en interés legítimo | Inmediato |
| **Decisión automatizada** | Art. 22 | No ser sujeto a decisión basada únicamente en procesamiento automatizado con efectos significativos | Sin demora indebida |

### 2.4 Obligaciones del Responsable del Tratamiento (Harly como vendor)

1. **Transparencia (Art. 13-14):** Informar a candidatos sobre qué datos se recogen, por qué, cómo se usan, con quién se comparten, y sus derechos
2. **Aviso de Privacidad (Privacy Notice):** Debe estar visible en TODOS los puntos de recolección de datos (formularios de postulación)
3. **Consentimiento válido (Art. 7):**
   - Libremente dado (no condicionar acceso al servicio)
   - Específico (por cada finalidad)
   - Informed (con información clara)
   - Inequívoco (acción afirmativa, checkbox no pre-marcado)
   - Registrado con timestamp
4. **Data Protection Impact Assessment (DPIA):** Obligatorio cuando el procesamiento entraña alto riesgo (Art. 35) — incluye AI de alto riesgo en reclutamiento
5. **Data Protection Officer (DPO):** Puede ser requerido dependiendo del volumen de datos
6. **Registro de actividades (Art. 30):** Documentar todas las categorías de procesamiento

### 2.5 Obligaciones del Procesador (Harly como vendor)

1. **Data Processing Agreement (DPA) (Art. 28):** Acuerdo firmado con cada cliente que define:
   - Tipo de datos procesados
   - Finalidad del procesamiento
   - Duración
   - Obligaciones de seguridad
   - Sub-procesadores autorizados
   - Derechos del responsable
2. **Sub-procesadores:** Lista pública de sub-procesadores (ej: Neon, Resend, Cloudflare). Notificar cambios con antelación
3. **Seguridad técnica (Art. 32):** Encriptación en reposo (AES-256) y en tránsito (TLS 1.2+), control de acceso RBAC, backups encriptados
4. **Notificación de brechas (Art. 33-34):** Informar al responsable en ≤72 horas si hay brecha de seguridad que afecte datos de candidatos
5. **Eliminación al finalizar contrato:** Borrar todos los datos al terminar la relación comercial

### 2.6 Transferencias Internacionales (Art. 44-49)

Si Harly procesa datos de candidatos EU en servidores fuera de la UE:

| Mecanismo | Descripción |
|-----------|-------------|
| **Decisiones de adecuación** | La UE determina que el país tiene protección equivalente (ej: Japón, Corea del Sur) |
| **Standard Contractual Clauses (SCCs)** | Cláusulas tipo de la UE, firmadas entre exportador e importador |
| **Binding Corporate Rules (BCRs)** | Reglas internas aprobadas por autoridad supervisora |
| **Certificación DPF** | Para transferencias a EE.UU. (Data Privacy Framework) |

**Para Harly:** Si ofrece hosting EU, puede evitar SCCs para clientes EU. Si procesa en EE.UU., necesita DPF o SCCs + Transfer Impact Assessment (TIA).

### 2.7 Retención de Datos

| Categoría | Periodo típico | Base legal |
|-----------|---------------|------------|
| Candidatos para puesto específico | 6 meses post-decisión | Interés legítimo |
| Talent pool (consentimiento) | 2 años, con re-consentimiento anual | Consentimiento |
| Empleados contratados | Duración de empleo + obligaciones legales post-contrato | Contrato + obligación legal |
| Logs de auditoría | 3-5 años | Obligación legal / interés legítimo |
| Datos de AI decisions | Mientras el sistema esté en uso + periodo de prescripción applicable | AI Act |

---

## 3. EU AI Act

**Reglamento (UE) 2024/1689** — Vigente desde agosto 2024, alto riesgo **2 agosto 2026**

### 3.1 Clasificación de Riesgo para Harly

Harly usa AI para:
- **Parsing de CVs** — extraer información de documentos no estructurados
- **Borradores de job posts** — generación de contenido

Ambos se clasifican como **AI de ALTO RIESGO** bajo Annex III, punto 4:

> AI systems used for recruitment or selection of natural persons, in particular for placing targeted job advertisements, for analysing and filtering applications, and for evaluating candidates

**Nota:** El parsing de CVs se considera "preparatorio" pero el filtro/evaluación es high-risk. Dado que Harly hace parsing como parte del proceso de evaluación, cae dentro del alcance.

### 3.2 Obligaciones del Provider (Harly como vendor de AI)

| Obligación | Artículo | Descripción |
|------------|----------|-------------|
| Sistema de gestión de riesgos | Art. 9 | Proceso documentado para identificar, evaluar y mitigar riesgos del AI |
| Gobernanza de datos | Art. 10 | Datos de entrenamiento relevantes, representativos y libres de sesgo |
| Documentación técnica | Art. 11, Annex IV | Documentar: propósito, diseño, testing, métricas, limitaciones, instrucciones de uso |
| Registro automático | Art. 12 | Log de todas las decisiones AI con: input data, output, reasoning, timestamp |
| Transparencia | Art. 13 | Usuarios (recruiters) deben entender cómo funciona el AI y sus limitaciones |
| Supervisión humana | Art. 14 | Humanos pueden: entender outputs, anular decisiones, detener el sistema |
| Precisión y robustez | Art. 15 | AI funciona de forma consistente y predecible |
| Ciberseguridad | Art. 15 | Protección contra manipulación de outputs |
| Registro en base de datos EU | Art. 49 | Registrar el sistema en la EU AI database |
| Evaluación de conformidad | Art. 43 | Documentar que cumple los requisitos |

### 3.3 Obligaciones del Deployer (Cliente de Harly)

| Obligación | Artículo | Descripción |
|------------|----------|-------------|
| Uso según instrucciones | Art. 26(1) | Usar el sistema solo para los fines documentados |
| Supervisión humana | Art. 26(1)(b) | Designar personas capacitadas que puedan anular decisiones AI |
| Notificar a trabajadores | Art. 26(4) | Informar que se usa AI de alto riesgo en el proceso |
| Monitoreo de outputs | Art. 26(2)(a) | Verificar que los outputs son correctos |
| Retener logs | Art. 26(5) | Mantener logs de decisiones AI según regulación applicable |
| Notificar al provider | Art. 26(3) | Informar al proveedor de incidentes o usos inadecuados |
| FRIA | Art. 26(8) | Fundamental Rights Impact Assessment para ciertos deployers |

### 3.4 Derechos de los Candidatos (Affected Persons)

| Derecho | Base | Descripción |
|---------|------|-------------|
| Ser informado | Art. 86 | Saber que un sistema AI de alto riesgo se usa en su evaluación |
| Explicación | Art. 86 + GDPR Art. 22 | Recibir explicación de la decisión AI cuando sea significativa |
| Supervisión humana | Art. 14 + Art. 26 | Solicitar revisión humana de decisiones AI |
| Oposición | GDPR Art. 21 | Oponerse a decisiones automatizadas con efectos significativos |

### 3.5 Prácticas Prohibidas (Ya vigentes desde Feb 2025)

Estas prácticas están **PROHIBIDAS** — no se pueden usar ni con consentimiento:

- **Social scoring** — clasificar personas basado en comportamiento social
- **Reconocimiento emocional** en entrevistas (sin consentimiento claro)
- **Clasificación biométrica** para deducir raza, religión, orientación sexual
- **Extracción predictiva** de datos sensibles
- **Empleo scoring** con sesgo discriminatorio

### 3.6 Fechas Clave

| Fecha | Evento |
|-------|--------|
| Feb 2025 | Prácticas prohibidas ya vigentes |
| Ago 2025 | Obligaciones de AI literacy |
| **Ago 2026** | **High-risk obligations vigentes** |
| Ago 2027 | AI Act completamente operativo |

### 3.7 Documentación Requerida para Provider

1. **Technical Documentation** — arquitectura, algoritmos, datos de entrenamiento, métricas
2. **Instructions for Use** — guía para deployers sobre cómo usar el sistema correctamente
3. **EU Declaration of Conformity** — declaración formal de que el sistema cumple
4. **CE Marking** — marcado de conformidad
5. **EU Database Registration** — registro en la base de datos de AI de la UE

---

## 4. ePrivacy Directive

**Directive 2002/58/EC** — amendada por Directive 2009/136/EC

### 4.1 Alcance (Art. 5(3))

Aplica al **almacenamiento o acceso a información en el terminal del usuario**, incluyendo:
- Cookies (todas las categorías)
- LocalStorage
- Fingerprinting
- Pixels de tracking
- URL parameter tracking
- Identificadores persistentes

### 4.2 Categorías de Cookies

| Categoría | Ejemplo | Consentimiento requerido |
|-----------|---------|------------------------|
| **Estrictamente necesarias** | Session ID, CSRF token, sidebar state | NO — exento |
| **Funcionales** | Preferencias de idioma, tema | Depende — si el usuario las activó activamente, puede ser exento |
| **Analytics** | Google Analytics, Mixpanel | SÍ — opt-in requerido |
| **Publicidad** | Facebook Pixel, LinkedIn Insight | SÍ — opt-in requerido |
| **Redes sociales** | Embedded tweets, share buttons | SÍ — opt-in requerido |

### 4.3 Requisitos del Banner de Consentimiento

1. **Aparecer ANTES** de que se seteen cookies no-esenciales
2. **Botón "Rechazar"** igual en prominencia que "Aceptar" (mismo tamaño, color, posición)
3. **Granularidad** — permitir elegir categorías individualmente
4. **Bloqueo real** — scripts de analytics/ads NO se ejecutan hasta consentimiento
5. **Withdrawal fácil** — link permanente "Cookie Settings" en footer
6. **Re-consent** — cada 6-12 meses o en cambio material
7. **Logging** — registrar timestamp + opciones de cada usuario, server-side

### 4.4 Lo que NO se puede hacer

- **Cookie wall** — no se puede condicionar acceso al sitio al consentimiento de cookies
- **Pre-ticked boxes** — checkbox pre-marcado no constituye consentimiento válido
- **Consentimiento implícito** — "al usar este sitio aceptas cookies" NO es válido
- **Scripts antes del consentimiento** — analytics/ads no pueden ejecutarse antes

### 4.5 Exenciones para Harly

Las cookies estrictamente necesarias para Harly (session, CSRF, sidebar state) están exentas. Solo necesitan consentimiento:
- Analytics (si se usa)
- Cualquier tracking de third-party
- Marketing pixels

---

## 5. Modelo de Separación EU / No-EU

El usuario mencionó que EU laws solo aplican a EU, y que necesita separación. Este es el patrón que siguen los servicios compliance-ready:

### 5.1 Infraestructura Separada

| Componente | EU | No-EU |
|------------|-----|-------|
| **Servidores** | Región EU (AWS eu-west, GCP europe-west, Azure West Europe) | Región US/otro |
| **Base de datos** | Instancia separada EU | Instancia separada |
| **Residency** | Datos nunca salen de EU | Flexible |
| **Auth** | Login EU separado | Login global |
| **Billing** | Facturación EU (con IVA) | Facturación estándar |

### 5.2 Implementación en Harly

```
Opción A: Multi-tenant con data residency
├── Tenant config: region = "eu" | "global"
├── DB routing: eu_tenants → EU DB, global_tenants → Global DB
├── Auth: mismo sistema, sesiones regionales
├── Storage: S3 buckets por región
└── DNS: eu.harly.dev / app.harly.dev

Opción B: Instancias separadas
├── harly.dev (global)
├── harly.eu (EU instance completa)
├── Código compartido, deploy separado
└── Más simple pero más operacionalmente pesado
```

### 5.3 Lo que necesitan separación

1. **Base de datos** — datos de candidatos EU nunca en servidores US
2. **Storage** — CVs y documentos en buckets EU
3. **Emails** — Resend con región EU si es posible
4. **Auth** — Sesiones EU podrían requerir tokens regionales
5. **Logs** — Audit logs de EU en almacenamiento EU
6. **Backups** — Backups EU en EU
7. **AI Processing** — Si el AI processa datos EU, idealmente en EU (o con SCCs)

### 5.4 El caso de uso típico

```
Empresa europea se registra en Harly
  → Selecciona "EU Region" durante onboarding
  → Su data y la de sus candidatos vive en EU
  → Harly provee DPA como procesador
  → La empresa es el responsable del tratamiento
  → Harly soporta DSAR, borrado, audit logs
  → AI Act compliance: transparencia + supervisión humana
```

---

## 6. Gap Actual

### 6.1 Páginas Legales

| Página | Estado | Prioridad |
|--------|--------|-----------|
| Privacy Policy | ❌ No existe | Crítica |
| Terms of Service | ❌ No existe | Crítica |
| Cookie Policy | ❌ No existe | Alta |
| Candidate Privacy Notice | ❌ No existe | Crítica |
| DPA Template | ❌ No existe | Alta |
| AI Transparency Notice | ❌ No existe | Alta |

### 6.2 Funcionalidad

| Feature | Estado | Prioridad |
|---------|--------|-----------|
| Cookie consent banner | ❌ No implementado | Alta |
| DSAR export (derecho de acceso) | ❌ No implementado | Crítica |
| Right to erasure (borrado completo) | ❌ No implementado | Crítica |
| Consent management | ❌ No implementado | Alta |
| Audit log de accesos | ❌ No implementado | Alta |
| Configurable retention periods | ❌ No implementado | Alta |
| DPIA document | ❌ No documentado | Alta |
| AI transparency (notice + logs) | ❌ No implementado | Alta |
| EU data residency | ❌ No implementado | Media |
| Turnstile on apply form | ⚠️ Instalado, no activo | Media |
| Human oversight para AI decisions | ❌ No implementado | Alta |
| Breach notification flow | ❌ No implementado | Media |

### 6.3 Documentación

| Documento | Estado | Prioridad |
|-----------|--------|-----------|
| Data Processing Agreement (DPA) | ❌ No existe | Alta |
| Legitimate Interest Assessment (LIA) | ❌ No documentado | Alta |
| DPIA | ❌ No documentado | Alta |
| Record of Processing Activities | ❌ No documentado | Media |
| Sub-processor list | ❌ No publicada | Media |

---

## 7. Checklist de Cumplimiento

### FASE 1 — Páginas Legales (Urgente)

- [ ] Crear Privacy Policy (plantilla base, configurable por admin)
- [ ] Crear Terms of Service (plantilla base, configurable por admin)
- [ ] Crear Cookie Policy (lista de cookies usadas por Harly)
- [ ] Crear Candidate Privacy Notice (notice para formularios de postulación)
- [ ] Crear DPA Template (para clientes EU)
- [ ] Crear AI Transparency Notice (uso de AI en procesos de selección)

### FASE 2 — Consentimiento (Alta prioridad)

- [ ] Implementar cookie consent banner con CMP
- [ ] Agregar checkbox de consentimiento en apply form (no pre-marcado)
- [ ] Logging server-side de consentimientos con timestamp
- [ ] Configurar re-consent cada 6-12 meses
- [ ] Link permanente "Cookie Settings" en footer

### FASE 3 — Derechos del Candidato (Crítica)

- [ ] DSAR export: generar paquete completo de datos de candidato en ≤10 min
- [ ] Right to erasure: borrado real de todos los registros + backups
- [ ] Rectificación: flujo para corregir datos
- [ ] Portabilidad: export en JSON/CSV legible
- [ ] Notification a candidatos cuando se procesan sus datos

### FASE 4 — Auditoría y Logging (Alta prioridad)

- [ ] Audit log de accesos a datos de candidatos
- [ ] Audit log de modificaciones
- [ ] Audit log de borrados
- [ ] Audit log de decisiones AI
- [ ] Retención configurable de logs

### FASE 5 — EU AI Act Compliance (Alta prioridad, deadline Ago 2026)

- [ ] Documentación técnica del AI (arquitectura, métricas, limitaciones)
- [ ] Instructions for Use para deployers
- [ ] Notificación a candidatos sobre uso de AI
- [ ] Flujo de supervisión humana (override de decisiones AI)
- [ ] Logging de decisiones AI con input/output/reasoning
- [ ] Bias testing y monitoreo de fairness
- [ ] DPIA documentado

### FASE 6 — Data Residency EU (Media prioridad)

- [ ] Decidir: multi-tenant con routing o instancias separadas
- [ ] Configurar DB EU (region en tenant config)
- [ ] Configurar storage EU (S3 buckets)
- [ ] DNS EU (eu.harly.dev o similar)
- [ ] Auth regional si es necesario
- [ ] Backups EU

### FASE 7 — Infraestructura Legal (Media prioridad)

- [ ] Legitimate Interest Assessment (LIA) documentado
- [ ] Record of Processing Activities (ROPA)
- [ ] Sub-processor list publicada
- [ ] Breach notification flow documentado y testeado
- [ ] Data Protection Officer (DPO) designado (si aplica)

---

## 8. Fuentes y Referencias

### GDPR
- [Reglamento GDPR texto completo](https://gdpr-info.eu/)
- [EDPB Guidelines](https://edpb.europa.eu/our-work-tools/general-guidance/gdpr-guidelines.en)
- [ICO GDPR Guide](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/)

### EU AI Act
- [Reglamento AI Act texto completo](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [AI Act Timeline](https://ai-act-service-desk.ec.europa.eu/en/ai-act/eu-ai-act-implementation-timeline)
- [Legalithm AI Act HR Guide](https://www.legalithm.com/en/blog/ai-act-hr-recruitment-compliance-guide)
- [Treegarden ATS AI Act Guide](https://treegarden.io/blog/eu-ai-act-recruitment-compliance-guide/)

### ePrivacy
- [EDPB Cookie Banner Task Force Report](https://edpb.europa.eu/)
- [Consenteo Cookie Consent 2026](https://www.consenteo.com/knowledge-hub/GDPR/gdpr_cookie_consent_2026)

### ATS GDPR Compliance
- [Treegarden ATS GDPR 2026](https://treegarden.io/blog/ats-gdpr-compliance-2026/)
- [RecruitBPM GDPR Guide](https://recruitbpm.com/blog/gdpr-are-your-recruiters-in-compliance)
- [Zimyo ATS GDPR](https://www.zimyo.us/blog/applicant-tracking-and-gdpr-compliance)

### EU AI Act para HR/Recruitment
- [Eversheds AI Act Employment](https://www.eversheds-sutherland.com/en/united-states/insights/eu-ai-act-high-risk-ai-systems-in-employment)
- [ActScope HR Tech Guide](https://actscope.eu/guide/eu-ai-act-for-hr-tech)
- [GTLaw AI Recruitment](https://www.gtlaw.com/en/insights/2025/5/use-of-ai-in-recruitment-and-hiring-considerations-for-eu-and-us-companies)

---

## Notas de Implementación

### Para Harly como Provider (vende ATS con AI)

- Proveer DPA firmable a todos los clientes
- Documentación técnica del AI
- Instructions for Use
- Lista de sub-procesadores
- Soporte DSAR y borrado como feature del producto
- EU Declaration of Conformity cuando esté listo

### Para clientes de Harly (empresas que usan Harly)

- Harly debe hacer DPIA si usa AI de alto riesgo
- Harly debe notificar candidatos sobre uso de AI
- Harly debe tener supervisión humana de decisiones AI
- Harly debe retener logs de decisiones AI
- Harly debe tener DPA con Harly como procesador
- Harly debe configurar retention periods según política de datos

### Consideración de "Harly Cloud" vs "Self-Hosted"

- **Self-hosted:** El cliente es responsable de compliance, Harly provee herramientas
- **Cloud:** Harly es procesador, debe cumplir directamente (DPA, DSAR, audit, etc.)
- **Hybrid:** Harly provee infra EU, cliente configura sus políticas
