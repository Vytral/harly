# Harly ATS Marketplace - Informe de Integraciones

**Fecha:** 4 de Julio, 2026
**Objetivo:** Crear un marketplace completo de integraciones para Harly ATS

---

## Resumen Ejecutivo

Harly ya tiene infraestructura sólida para integraciones (OAuth flows, server actions, encrypted credentials, permission system). Este informe cubre **50+ integraciones potenciales** organizadas por categoría, con análisis de viabilidad, esfuerzo de implementación, y recomendaciones de priorización.

**Hallazgo clave:** No necesitas construir cada integración desde cero. Existen **plataformas unificadas** (Merge, Apideck, Finch, Kombo) que normalizan múltiples proveedores detrás de una sola API. Para un ATS open-source, esto reduce el esfuerzo de 6-10 semanas por integración a ~1-2 semanas.

---

## 1. Estado Actual de Harly

### Integraciones Activas
| Integración | Estado | Auth | UI Card |
|-------------|--------|------|---------|
| Cal.com | ✅ Activa | API Key | CalSettingsCard |
| Google Calendar | ✅ Activa | OAuth 2.0 | GCalSettingsCard |
| Slack (Bot) | ✅ Activa | OAuth 2.0 | SlackSettingsCard |
| Chat (Webhooks) | ✅ Activa | Webhook URL | ChatSettingsCard |

### Infraestructura Existente (No en UI)
| Componente | Estado | Archivo |
|------------|--------|---------|
| Email (Resend/SMTP) | ✅ Server actions listos | `email-settings-actions.ts` |
| Turnstile (Cloudflare) | ✅ Server actions listos | `turnstile-settings-actions.ts` |
| Webhooks outbound | ✅ Sistema completo | `developers/actions.ts` |
| API Keys | ✅ Sistema completo | `developers/actions.ts` |

### Logos Disponibles en `brands.tsx`
- Cloudflare, Resend, Discord
- OpenAI, Claude, Gemini, xAI, OpenRouter (AI providers)

---

## 2. Integraciones por Categoría

### 2.1 Job Boards (Publicación de Empleos)

| Plataforma | API Disponible | Auth | Esfuerzo | Notas |
|------------|---------------|------|----------|-------|
| **Indeed** | Job Sync API (partner-only) | OAuth 2.0 | 🔴 Alto | Requiere acuerdo de partner, mínimos de 6 cifras |
| **LinkedIn** | Job Posting API (restringida) | OAuth 2.0 | 🔴 Alto | No acepta nuevos partnerships; redirect a Apply Connect |
| **ZipRecruiter** | Publisher API | API Key | 🟡 Medio | Feed de distribución; más para agregadores |
| **Glassdoor** | Partner API (enterprise) | API Key | 🔴 Alto | API pública retirada en 2022 |
| **SimplyHired** | Via Indeed | - | 🔴 Alto | Propietario de Indeed |
| **CareerBuilder** | Enterprise partnership | - | 🔴 Alto | No documentado públicamente |
| **Dice** | Partner API | API Key | 🟡 Medio | Focus tech/developer jobs |
| **Wellfound (AngelList)** | API pública | OAuth 2.0 | 🟢 Bajo | Startups, good for tech roles |
| **Y Combinator Work at a Startup** | API | OAuth 2.0 | 🟢 Bajo | Startup ecosystem |
| **Remote OK** | RSS/JSON feed | API Key | 🟢 Bajo | Simple posting |
| **We Work Remotely** | API | API Key | 🟢 Bajo | Remote jobs |
| **Hired** | Partner API | OAuth 2.0 | 🟡 Medio | Tech-focused marketplace |

**Recomendación:** Los job boards grandes (Indeed, LinkedIn) requieren partnerships costosos. Enfócate en:
1. **Wellfound** - API abierta, startup ecosystem
2. **Y Combinator** - Comunidad tech
3. **Remote OK / We Work Remotely** - Trabajos remotos
4. **Dice** - Tech roles
5. **RSS feeds** - Publicación genérica a múltiples boards via XML

---

### 2.2 ATS Cross-Platform (Importar/Exportar Candidatos)

| Plataforma | API | Auth | Esfuerzo | Integraciones |
|------------|-----|------|----------|---------------|
| **Greenhouse** | Harvest API v3 | OAuth 2.0 | 🟡 Medio | 400+ integraciones |
| **Lever** | Data API | OAuth 2.0 | 🟡 Medio | 71+ integraciones |
| **Workable** | Main API | OAuth 2.0 | 🟡 Medio | 135+ integraciones |
| **Ashby** | API | OAuth 2.0 | 🟢 Bajo | Modern, developer-friendly |
| **BambooHR** | REST API | API Key | 🟢 Bajo | 150+ integraciones |
| **JazzHR** | API | API Key | 🟢 Bajo | SMB-focused |
| **Breezy HR** | API | API Key | 🟢 Bajo | Simple, affordable |
| **Recruitee** | API | OAuth 2.0 | 🟢 Bajo | European market |
| **Teamtailor** | API | OAuth 2.0 | 🟢 Bajo | Employer branding |

**Recomendación:** Prioriza **BambooHR** (API Key, simple) y **Ashby** (modern, developer-friendly). Para cobertura completa, considera **Merge** o **Apideck** como capa unificada.

---

### 2.3 HRIS/Payroll (Onboarding de Empleados)

| Plataforma | API | Auth | Esfuerzo | Mercado |
|------------|-----|------|----------|---------|
| **BambooHR** | REST API | API Key | 🟢 Bajo | SMB |
| **Gusto** | App Integration API | OAuth 2.0 | 🟡 Medio | SMB |
| **ADP** | Workforce Now API | OAuth 2.0 + mTLS | 🔴 Alto | Enterprise |
| **Workday** | REST API | OAuth 2.0 | 🔴 Alto | Enterprise |
| **Rippling** | Modern REST API | OAuth 2.0 | 🟡 Medio | All-in-one HR |
| **Deel** | API | API Key | 🟡 Medio | Global/International |
| **Remote.com** | API | API Key | 🟡 Medio | Global payroll |
| **Paychex** | API | OAuth 2.0 | 🔴 Alto | Enterprise |
| **Paycom** | Partner API | - | 🔴 Alto | Enterprise |
| **Namely** | API | OAuth 2.0 | 🟡 Medio | Mid-market |
| **Freshteam** | API | API Key | 🟢 Bajo | SMB (Freshworks) |

**Recomendación:** Para Harly como ATS open-source, enfócate en:
1. **BambooHR** - API Key simple, documentation excelente
2. **Gusto** - OAuth 2.0, popular en startups
3. **Deel** - Global hiring, API Key
4. **Remote.com** - International compliance

---

### 2.4 Video Entrevistas

| Plataforma | API | Auth | Esfuerzo | Cuota |
|------------|-----|------|----------|-------|
| **Zoom** | Meetings API + Scheduler | OAuth 2.0 | 🟡 Medio | Free tier disponible |
| **Google Meet** | Calendar API | OAuth 2.0 | 🟢 Bajo | Free (ya tienes Google Calendar) |
| **Microsoft Teams** | Graph API | OAuth 2.0 | 🟡 Medio | Incluido con M365 |
| **Whereby** | Embedded API | API Key | 🟢 Bajo | Simple, embeddable |
| **Daily.co** | REST API | API Key | 🟢 Bajo | Developer-friendly |
| **HireVue** | Partner API | Enterprise | 🔴 Alto | Enterprise only |
| **Spark Hire** | Partner API | API Key | 🟡 Medio | $149/mes |
| **BrightHire** | API | OAuth 2.0 | 🟡 Medio | Interview intelligence |

**Recomendación:**
1. **Google Meet** - Ya tienes Google Calendar, extiende el mismo OAuth
2. **Zoom** - Más integrado en el mercado, free tier
3. **Daily.co** - API simple, embeddable, good for custom UI

---

### 2.5 Firma Electrónica (Offer Letters)

| Plataforma | API | Auth | Esfuerzo | Precio |
|------------|-----|------|----------|--------|
| **DocuSign** | eSignature REST API | OAuth 2.0 (JWT) | 🟡 Medio | Desde $10/envelope |
| **HelloSign (Dropbox Sign)** | API | OAuth 2.0 | 🟢 Bajo | Free tier; desde $15/mes |
| **Adobe Sign** | Document Services API | OAuth 2.0 | 🟡 Medio | Desde $30/mes |
| **PandaDoc** | API | OAuth 2.0 | 🟢 Bajo | Free tier; desde $19/mes |
| **Zoho Sign** | API | OAuth 2.0 | 🟢 Bajo | Free tier disponible |
| **SignWell** | API | API Key | 🟢 Bajo | Desde $10/mes |
| **Eversign** | API | API Key | 🟢 Bajo | Desde $9.99/mes |

**Recomendación:**
1. **HelloSign (Dropbox Sign)** - Simple, free tier, good embedded UX
2. **PandaDoc** - Más features, free tier
3. **SignWell** - API Key simple, affordable

---

### 2.6 Assessments/Técnicos

| Plataforma | API | Auth | Esfuerjo | Focus |
|------------|-----|------|----------|-------|
| **HackerRank** | Assessment API | API Key (partner) | 🟡 Medio | Tech/Coding |
| **Codility** | Partner API | API Key | 🟡 Medio | Tech/Coding |
| **TestGorilla** | Partner API | API Key | 🟢 Bajo | Multi-skill |
| **Criteria Corp** | Partner API | API Key | 🟡 Medio | Cognitive/Personality |
| **Plum.io** | Partner API | API Key | 🟡 Medio | IO Psychology |
| **Vervoe** | API | API Key | 🟢 Bajo | AI-powered assessments |
| **HireVue Assessments** | Partner API | Enterprise | 🔴 Alto | Enterprise |
| **Leetcode** | Partner API | API Key | 🟢 Bajo | Coding challenges |
| **CodeSignal** | API | API Key | 🟢 Bajo | Technical assessments |

**Recomendación:**
1. **TestGorilla** - Multi-skill, API Key, free tier
2. **HackerRank** - Para tech roles, partner key required
3. **Vervoe** - AI-powered, API Key

---

### 2.7 Background Checks

| Plataforma | API | Auth | Esfuerzo | Alcance |
|------------|-----|------|----------|---------|
| **Checkr** | REST API | Basic Auth | 🟢 Bajo | 100+ ATS integrations |
| **GoodHire** | Partner API | API Key | 🟡 Medio | US-focused |
| **Sterling** | Enterprise API | OAuth 2.0 | 🔴 Alto | Global, Enterprise |
| **HireRight** | Enterprise API | Enterprise | 🔴 Alto | Global, Enterprise |
| **Verifiable** | API | API Key | 🟢 Bajo | Credentials verification |
| **Sterling Now** | API | API Key | 🟡 Medio | SMB-friendly |
| **First Advantage** | API | Enterprise | 🔴 Alto | Enterprise |

**Recomendación:**
1. **Checkr** - API-first, 100+ ATS integrations, OAuth flow documented
2. **GoodHire** - Simpler, API Key

---

### 2.8 Comunicación (SMS/Voice/WhatsApp)

| Plataforma | API | Auth | Esfuerzo | Precio |
|------------|-----|------|----------|--------|
| **Twilio** | REST API | Account SID + Token | 🟡 Medio | Pay-per-message |
| **Vonage (Nexmo)** | REST API | API Key | 🟡 Medio | Pay-per-message |
| **WhatsApp Business** | Cloud API | API Key | 🟡 Medio | Pay-per-message |
| **MessageBird** | REST API | API Key | 🟢 Bajo | Pay-per-message |
| **Plivo** | REST API | Auth ID + Token | 🟡 Medio | Pay-per-message |
| **Sinch** | REST API | API Key | 🟡 Medio | Enterprise |

**Recomendación:**
1. **Twilio** - Más completo, SMS + Voice + WhatsApp
2. **WhatsApp Business API** - Para candidate communication

---

### 2.9 Document Storage

| Plataforma | API | Auth | Esfuerzo | Notas |
|------------|-----|------|----------|-------|
| **Google Drive** | Drive API | OAuth 2.0 | 🟢 Bajo | Ya tienes Google Calendar OAuth |
| **Dropbox** | API | OAuth 2.0 | 🟢 Bajo | Good for documents |
| **OneDrive/SharePoint** | Graph API | OAuth 2.0 | 🟡 Medio | Microsoft ecosystem |
| **Box** | API | OAuth 2.0 | 🟡 Medio | Enterprise-focused |
| **AWS S3** | SDK | API Key | 🟢 Bajo | Self-hosted option |

**Recomendación:**
1. **Google Drive** - Reutiliza el OAuth existente de Google Calendar
2. **Dropbox** - Simple, good for document management

---

### 2.10 CRM/Marketing

| Plataforma | API | Auth | Esfuerzo | Precio |
|------------|-----|------|----------|--------|
| **HubSpot** | CRM API | OAuth 2.0 | 🟡 Medio | Free tier disponible |
| **Salesforce** | REST API | OAuth 2.0 | 🔴 Alto | Enterprise |
| **Pipedrive** | REST API | API Key | 🟢 Bajo | Affordable |
| **Zoho CRM** | REST API | OAuth 2.0 | 🟡 Medio | Free tier |
| **Airtable** | REST API | API Key | 🟢 Bajo | Flexible, no-code |
| **Notion** | API | Internal Token | 🟢 Bajo | Documentation/knowledge base |

**Recomendación:**
1. **HubSpot** - Free tier, good for recruiting CRM
2. **Airtable** - Flexible, API Key simple
3. **Notion** - Para knowledge base del hiring process

---

### 2.11 Automatización/Workflows

| Plataforma | API | Auth | Esfuerzo | Notas |
|------------|-----|------|----------|-------|
| **Zapier** | Webhooks + API | OAuth 2.0 | 🟢 Bajo | 7,000+ apps |
| **Make.com** | API | API Key | 🟢 Bajo | Visual builder, better pricing |
| **n8n** | Self-hosted | API Key | 🟢 Bajo | Open-source option |
| **Workato** | Enterprise | OAuth 2.0 | 🔴 Alto | Enterprise |

**Recomendación:**
1. **n8n** - Open-source, self-hosted, aligns con Harly's open-source nature
2. **Zapier** - Para users que ya lo usan
3. **Make.com** - Better pricing para high volume

---

### 2.12 AI/ML Providers

| Plataforma | API | Auth | Esfuerjo | Notas |
|------------|-----|------|----------|-------|
| **OpenAI** | API | API Key | 🟢 Bajo | Resume screening, JD generation |
| **Anthropic (Claude)** | API | API Key | 🟢 Bajo | Advanced analysis |
| **Google (Gemini)** | API | API Key | 🟢 Bajo | Multi-modal |
| **Cohere** | API | API Key | 🟢 Bajo | Enterprise NLP |
| **Assembly AI** | API | API Key | 🟢 Bajo | Audio transcription (interviews) |

**Recomendación:** Ya tienes logos de AI providers. Implementa:
1. **OpenAI** - Most popular, good for resume parsing
2. **Claude** - Better for analysis
3. **Assembly AI** - Para transcribir entrevistas de video

---

### 2.13 Compliance/Legal

| Plataforma | API | Auth | Esfuerzo | Notas |
|------------|-----|------|----------|-------|
| **Ironclad** | API | OAuth 2.0 | 🟡 Medio | CLM for offers |
| **DocuSign CLM** | API | OAuth 2.0 | 🔴 Alto | Enterprise |
| **Compliance.ai** | API | API Key | 🟡 Medio | Regulatory compliance |
| **OneTrust** | API | API Key | 🟡 Medio | Privacy/GDPR |

---

## 3. Arquitectura Recomendada para Harly Marketplace

### 3.1 Estructura de Módulos

```
apps/web/src/
├── features/integrations/
│   ├── registry/
│   │   ├── IntegrationRegistry.tsx      # Marketplace UI
│   │   ├── integration-registry.ts      # Server-side registry
│   │   └── types.ts                     # Shared types
│   ├── providers/
│   │   ├── job-boards/
│   │   │   ├── indeed/
│   │   │   ├── linkedin/
│   │   │   └── wellfound/
│   │   ├── ats/
│   │   │   ├── greenhouse/
│   │   │   ├── lever/
│   │   │   └── workable/
│   │   ├── hris/
│   │   │   ├── bamboohr/
│   │   │   └── gusto/
│   │   ├── video/
│   │   │   ├── zoom/
│   │   │   └── google-meet/
│   │   ├── e-sign/
│   │   │   ├── docusign/
│   │   │   └── hellosign/
│   │   ├── assessments/
│   │   │   ├── hackerrank/
│   │   │   └── testgorilla/
│   │   ├── background/
│   │   │   └── checkr/
│   │   ├── communication/
│   │   │   ├── twilio/
│   │   │   └── whatsapp/
│   │   ├── storage/
│   │   │   ├── google-drive/
│   │   │   └── dropbox/
│   │   └── automation/
│   │       ├── zapier/
│   │       └── n8n/
│   └── shared/
│       ├── OAuthManager.tsx             # OAuth flow handler
│       ├── WebhookHandler.ts            # Webhook verification
│       ├── IntegrationCard.tsx          # Base card component
│       └── credential-storage.ts        # Encrypted credentials
```

### 3.2 Patrón de Integración (Template)

Cada integración debería seguir este patrón:

```typescript
// 1. Config Layer (lib/integrations/[provider]/config.ts)
export type [Provider]Status = {
  connected: boolean;
  lastSync?: Date;
  // provider-specific status
};

export async function getWorkspace[Provider]Status(orgId: string): Promise<[Provider]Status> {
  // Read from workspace_settings, decrypt, return
}

// 2. Server Actions (features/integrations/providers/[provider]/actions.ts)
"use server";
export async function connect[Provider](input: {...}): Promise<Result> {
  const context = await requirePermission("integrations:manage");
  // OAuth flow or API key validation
  // Encrypt and store credentials
  revalidatePath("/settings/integrations");
}

export async function disconnect[Provider](): Promise<Result> {
  // Clear credentials, revoke tokens if needed
}

// 3. OAuth Flow (app/api/integrations/[provider]/install/route.ts)
// 4. OAuth Callback (app/api/integrations/[provider]/callback/route.ts)
// 5. UI Card (features/integrations/providers/[provider]/[Provider]Card.tsx)
// 6. Brand Logo (components/ui/icons/brands.tsx)
```

### 3.3 Unified API Approach (Alternativa)

Considera usar **Merge**, **Apideck**, o **Finch** como capa unificada:

```typescript
// Con Merge API (un solo endpoint para múltiples ATS)
const response = await merge.get("/ats/candidates", {
  headers: { "Authorization": `Bearer ${mergeApiKey}` },
  params: { integration_id: "greenhouse-123" }
});

// Con Apideck (un solo endpoint para múltiples HRIS)
const response = await apideck.get("/hris/employees", {
  params: { service_id: "bamboohr", unified_api: "hris" }
});
```

**Ventajas:**
- Una integración cubre múltiples proveedores
- Auth management centralizado
- Data normalization automática
- Webhook handling unificado

**Desventajas:**
- Dependency externa
- Costo adicional
- Menos control sobre errores

---

## 4. Priorización Recomendada

### Fase 1: Quick Wins (1-2 semanas cada una)
1. **Email (Resend/SMTP)** - Ya tienes la infra, solo falta UI card
2. **Google Drive** - Reutiliza Google Calendar OAuth
3. **Zoom** - OAuth 2.0, free tier, high demand
4. **Checkr** - API Key, documentación excelente
5. **TestGorilla** - API Key, free tier

### Fase 2: Core ATS Integrations (2-3 semanas cada una)
6. **BambooHR** - API Key simple, high demand
7. **Gusto** - OAuth 2.0, SMB market
8. **HelloSign (Dropbox Sign)** - OAuth 2.0, simpler than DocuSign
9. **HubSpot** - Free tier, recruiting CRM
10. **Twilio** - SMS/Voice/WhatsApp

### Fase 3: Job Boards (3-4 semanas cada una)
11. **Wellfound** - API abierta, startup ecosystem
12. **Y Combinator** - Startup community
13. **Remote OK** - Remote jobs
14. **Dice** - Tech roles

### Fase 4: Advanced (4-6 semanas cada una)
15. **HackerRank** - Partner key required
16. **DocuSign** - Enterprise standard
17. **Microsoft Teams** - Graph API
18. **Salesforce** - Enterprise CRM

### Fase 5: Automation Layer
19. **n8n** - Open-source automation
20. **Zapier** - For existing users
21. **Make.com** - High volume workflows

---

## 5. Consideraciones Técnicas

### 5.1 OAuth Management
```typescript
// Token refresh pattern
async function refreshToken(provider: string, refreshToken: string) {
  const response = await fetch(`${PROVIDER_TOKEN_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  
  const tokens = await response.json();
  // Encrypt and store new tokens
  await encryptAndStore(provider, tokens);
}
```

### 5.2 Webhook Verification
```typescript
// HMAC signature verification
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### 5.3 Rate Limiting
```typescript
// Exponential backoff with jitter
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '1';
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      const jitter = Math.random() * 1000;
      await sleep(delay + jitter);
      continue;
    }
    
    return response;
  }
  
  throw new Error('Max retries exceeded');
}
```

### 5.4 Credential Encryption
Ya tienes `encryptSecret` y `decryptSecret` en `lib/crypto.ts`. Asegúrate de que todas las integraciones usen el mismo patrón:
```typescript
// Store credentials
const encrypted = encryptSecret(apiKey);
await db.insert(workspaceSettings).values({
  organizationId: orgId,
  [provider]ApiKeyCiphertext: encrypted.ciphertext,
  [provider]ApiKeyIv: encrypted.iv,
  [provider]ApiKeyTag: encrypted.tag,
});

// Retrieve credentials
const config = await getWorkspaceConfig(orgId);
const apiKey = decryptSecret({
  ciphertext: config.[provider]ApiKeyCiphertext,
  iv: config.[provider]ApiKeyIv,
  tag: config.[provider]ApiKeyTag,
});
```

---

## 6. Marketplace UI

### 6.1 Categorías en el Marketplace
```
📅 Scheduling & Calendar
📧 Email & Communication
💼 Job Boards & Distribution
👥 ATS Cross-Platform
🏢 HRIS & Payroll
🎥 Video Interviews
✍️ E-Signatures
📊 Assessments & Testing
🔍 Background Checks
📁 Document Storage
🤖 AI & Automation
🔗 CRM & Marketing
⚙️ Developer Tools (API, Webhooks)
```

### 6.2 Filtros
- **By Category** - Dropdown filter
- **By Status** - Connected / Available / Coming Soon
- **By Effort** - Quick Setup / Configuration Required
- **By Price** - Free / Paid / Enterprise

### 6.3 Card Design (existente)
El `BrandTile` y card pattern existente funciona perfecto. Solo necesitas agregar más logos a `brands.tsx` y crear los SettingsCards correspondientes.

---

## 7. Próximos Pasos

1. **Iniciar con Email card** (infra ya existe)
2. **Agregar logos faltantes** a `brands.tsx`
3. **Crear primeras 3 integraciones** de Fase 1
4. **Establecer patrón de integración** documentado
5. **Evaluar Merge/Apideck** para Fase 2+

---

## Fuentes

- Greenhouse Harvest API v3: https://harvestdocs.greenhouse.io
- Lever Developer Portal: https://hire.lever.co/developer
- Workable API: https://developers.workable.com
- BambooHR API: https://documentation.bamboohr.com
- Zoom API: https://developers.zoom.us/docs/api
- DocuSign API: https://developers.docusign.com
- Checkr API: https://docs.checkr.com
- HackerRank API: https://www.hackerrank.com/work/apidocs
- Twilio API: https://www.twilio.com/docs
- HubSpot API: https://developers.hubspot.com
- Merge API: https://merge.dev
- Apideck: https://www.apideck.com
- Finch: https://www.tryfinch.com
