# Auditoría UI/UX/Producto de Harly — Grok (2026-07-25)

> Conversación completa con Grok (grok-4.5) auditando Harly: opinión general, crítica brutal de UI/UX, lectura del mock de referencia, y diagnóstico del proceso founder-no-técnico + IA. Guardado verbatim para uso como referencia en el rediseño.
>
> Fuente: `~/.grok/sessions/.../019f97f5-a527-7483-a2e5-98127e2b3c19/chat_history.jsonl`

---

## Ronda 1 — Opinión general del proyecto

¡Hola Max! Todo bien por acá 😄

Miré Harly de verdad (README, monorepo, features, roadmap, idea de producto) y te doy opinión sincera, no de "qué lindo repo".

### Sí, me gusta. Bastante.

Harly no se siente como un side project con aspiraciones. Se siente como un **producto real** con tesis clara:

> El ATS de mercado está roto para equipos chicos: o pagás enterprise, o sufrís herramientas feas/abandonadas. No hay un "Cal.com del hiring".

Esa tesis se nota en el código y en las decisiones.

### Lo que más me convence

**1. Producto completo, no un CRUD de candidatos**
Pipeline kanban/lista, career pages, portal del candidato, ofertas, entrevistas, tasks, automations, mailbox, e-sign, reports, GDPR/DSAR, SSO, passkeys, API + webhooks… Eso es un ATS de verdad, no un MVP de "job board + tabla".

**2. Self-host first, bien pensado**
`npx @harly/cli`, Docker, Render, DO, Fly, Railway, doctor, backups, scheduler… La historia de "en un comando lo tenés corriendo" es el diferenciador correcto. Muchos open-source ATS se mueren en "cloná y reza".

**3. Stack serio y moderno**
Monorepo Turborepo, Next.js, Drizzle/Postgres, Better Auth, packages (`@harly/db`, `auth`, `emails`, `storage`, `api`), AI opcional con keys cifradas. No es "todo en un `app/` caótico".

**4. Madurez operativa rara en v0.1**
Compliance ops, launch checklist, SECURITY, CI, isolation tests, seed demo con datos realistas, criticismo interno del frontend… Se ve que no solo construís features: **operás un producto**.

**5. Ética de producto**
AI como guía, no como juez automático. GDPR-ready de diseño. "Compliance tooling, no legal advice". Eso da confianza.

### Lo que me genera fricción (con cariño)

**Amplitud vs. profundidad.** Hay muchísimo surface area (integraciones Zoom/Teams/Slack/Telegram/Discord/Outlook/Cal.com/e-sign…). Para un public beta, el riesgo clásico es: *muchas puertas semi-abiertas* vs. *pocas puertas impecables*. El roadmap lo reconoce bien: reliability y core journey antes que más features.

**Complejidad del monorepo.** ~30+ features, 100+ migraciones, apps + packages + tooling… Es potencia, pero también costo de mantenimiento. Si un solo core (vos) carga todo, la disciplina de "Now / Next / Later" es tu mejor amigo.

**Career page builder y polish UI.** Tu propia crítica interna es honesta (componentes monolíticos, prop drilling, etc.). El producto ya es ambicioso; el "Linear feel" se gana en el último 20% de craft, no en más endpoints.

**Posicionamiento.** "Open-source Greenhouse para startups" es fuerte. El gancho que más vende no es "tenemos 40 features", es: **control de datos + deploy en 5 minutos + hiring workflow completo sin $200/mes**.

### Veredicto

| Dimensión | Opinión |
|---|---|
| Idea de mercado | Muy buena. Hay hueco real. |
| Ejecución técnica | Alta para un open-source ATS en beta. |
| Amplitud de producto | Impresionante, casi "demasiado completa" para 0.1. |
| Riesgo principal | Diluir foco antes de que 10 equipos lo usen en serio. |
| ¿Me gusta? | **Sí.** Me gusta la ambición *y* la seriedad. |

Si lo comparo con lo que suele haber en GitHub de ATS open-source (UIs de 2012, PHP abandonado, zero deploy story), Harly está en otra liga.

Lo que más me gustaría ver a continuación no es "otra integración", sino:
1. 3–5 equipos reales usándolo un mes
2. el core journey impecable (job → apply → pipeline → interview → offer)
3. upgrade/backup/restore a prueba de balas

Eso convierte "proyecto ambicioso" en "herramienta en la que confío mi hiring".

En corto: **sí me gusta Harly**. Tiene alma de producto, no de demo. El stack y el self-host story están bien. El superpoder ahora es **no intentar ser Greenhouse completo antes de ser el mejor ATS self-hosteable para un equipo de 5**.

---

## Ronda 2 — Crítica brutal de UI/UX/producto

Tu intuición es correcta. **No estás inconforme por snobismo.** El producto es ambicioso y el backend/ops se sienten serios… pero la superficie se siente como **un ATS armado por un ingeniero muy bueno con prisa**, no como un producto de hiring con punto de vista.

**Reading this as:** product UI de ATS B2B self-host, audiencia recruiter/founder técnico, con aspiración "Remote/Linear soft" que en la práctica cae en **shadcn default + feature sprawl**.

### Veredicto en una frase

> Harly **parece un catálogo de features** disfrazado de producto.
> No se siente todavía como **una herramienta con un workflow obvio**.

### Scores (brutal y honestos)

| Área | Nota | Comentario |
|---|---|---|
| Identidad visual | **4.5/10** | Hay tokens, no hay *taste* consistente |
| Information architecture | **3.5/10** | El problema #1 |
| Workflow del recruiter (día a día) | **5/10** | Existe, pero se pelea con la UI |
| Superficie del candidato | **4/10** | Kitchen sink de 8 tabs |
| Densidad / craft de dashboard | **5.5/10** | Correcto, no memorable |
| Career page / brand | **5/10** | Ambición alta, ejecución uneven |
| Portal candidato | **5/10** | Producto paralelo, sin mismo nivel de amor |
| Microcopy / empty states | **5/10** | Genéricos, no *product voice* |
| A11y / polish | **4/10** | Focus, contrast, icon-only sin label |
| Coherencia de design system | **3/10** | Lucide + Phosphor + rounded-full + radius 1rem = caos suave |

### 1. El pecado original: no sabés *quién es* Harly visualmente

En `globals.css` está escrito el brief:

> *"off-white + lime (Remote.com-inspired soft UI)"*

Y el mock de Figma (`dashboard-hero.png`) es literalmente **Remote vibes**: soft table, lime accents, greeting, chrome limpio.

**El producto real no es eso.**

Lo real es:
- shadcn sidebar + topbar blur
- botones `rounded-full` en todo
- Inter como display *y* body
- pine/olive como primary (no el lime como acento con eyedropper)
- cards con hairline + shadow suave en algunas partes, flat en otras
- Lucide en 136 archivos, Phosphor en 89

Eso no es un design system. Es **un theme de tokens sobre un esqueleto genérico**.

**Por qué duele.** Remote / Linear / Ashby no se sienten bien por el color. Se sienten bien porque:
1. hay **una jerarquía tipográfica obsesiva**
2. hay **una densidad de datos decidida**
3. hay **pocos patrones, repetidos con disciplina**
4. el chrome (nav, topbar, panels) **desaparece**

Harly hace lo contrario: el chrome grita, el contenido compite, y el acento no tiene regla de uso ("eyedropper" en el comment, spray en la UI).

**Diagnóstico:** retheme cosmético, no redesign de producto.

### 2. Information architecture: el producto se disuelve en el sidebar

Nav real:

**Primary:** Home, Inbox
**Workspace:** Jobs, Candidates, Pipeline, Reports, Tasks, Calendars, Templates, Talent Pool, People, Career Page, Documents, Settings

Eso son **~14 destinos de primer nivel** para un equipo de 5 personas que contrata 2 roles.

**Problema de producto, no de CSS.** Un recruiter no piensa en "Talent Pool / Documents / Templates / People / Calendars" como *lugares*. Piensa en:
1. **¿Quién entró hoy?**
2. **¿A quién tengo que mover / responder / entrevistar?**
3. **¿Qué rol está trabado?**

Hoy Harly le contesta con un **inventario de módulos**.

**Duplicaciones conceptuales**
- **Candidates** vs **Pipeline** vs **Talent Pool** → tres vistas del mismo humano
- **Inbox** (mailbox) vs **Notifications** vs **replies** legacy → tres "bandejas"
- **People** (equipo interno) al lado de **Candidates** → naming confuso
- **Career Page** en nav principal con permission de settings → es config, no daily work
- **Documents** como app-level cuando muchas veces es *context del candidato/oferta*

Esto no se arregla con un color más bonito. Se arregla con una decisión cruel:

> **Harly es un pipeline-first ATS.** Todo lo demás es secondary o contextual.

Si no tomás esa decisión, la UI siempre va a sentirse "mucho y nada".

### 3. La home es un saludo, no un cockpit

El dashboard hace lo correcto a nivel checklist: greeting, insight condicional, setup checklist, inbox / interviews / pipeline / review / tasks / performance.

Pero UX-wise es **dashboard de SaaS 2021**: "Good morning, Max 👋", insight narrativo, grilla de cards iguales, animate-in fade slide (deco, no craft).

**Lo que un recruiter quiere al abrir Harly a las 9:12.** No un saludo. Quiere:
1. **3 acciones urgentes** (overdue, unanswered, interview in 40m)
2. **1 pipeline en riesgo**
3. **1 CTA fuerte** ("Review 4 new applications")

Hoy la home **informa** más de lo que **empuja**. Es un mural de widgets, no un triage.

Y el emoji 👋 + "Let's go!" del insight… es *friendly startup*, no *hiring tool de confianza*. En un ATS GDPR-ready, ese tono choca.

### 4. El candidato: monstruo de 8 pestañas

`CandidateProfileTabs.tsx` ≈ **1929 líneas**. Tabs: Profile, Interviews, Communication, Evaluation, Offers, Activity, Documents, Privacy.

Eso es una confesión de diseño:

> "No resolvimos el modelo mental del candidato, así que metimos todo en tabs."

**Por qué es malo**
- El recruiter **no trabaja por pestañas**, trabaja por **intención**: ¿Sirve? ¿Agenda? ¿Feedback? ¿Oferta? ¿Archivo / compliance?
- 8 tabs = **0 jerarquía**. Todo es equally important → nada es importante.
- Action bar + drawers + dialogs + move stage + reject + email + schedule + pool… **toolbar de avión comercial**.

**Síntoma clásico de product debt.** Tenés: `ScheduleDrawer` **y** `ScheduleDialog`, `EmailDrawer`, `BulkEmailDrawer`, `EvaluationDrawer`, `EditCandidateDrawer`, `EditInterviewDialog`, `CandidateActionBar` con reject + menus + trash + restore…

No es "potente". Es **superficie de acción sin coreografía**.

Ashby/Greenhouse ganan porque el panel del candidato tiene **un primary action contextual** según stage:
- Applied → Score / Advance / Reject
- Interview → Schedule / Collect feedback
- Offer → Send offer / Negotiate

Harly muestra **todas las armas siempre**. Eso genera parálisis y UI densa.

### 5. Design system: half-system, full entropy

**Inconsistencias concretas**

1. **Iconografía mixta** (Lucide + Phosphor + custom settings icons). En settings: custom stroke icons *y* Phosphor duotone. En candidates: Lucide. En pipeline cards: Phosphor. El ojo lo nota aunque no sepa por qué "se ve raro".

2. **Radius sin doctrina.** `--radius: 1rem` + botones always `rounded-full` + cards `rounded-xl/2xl` + inputs no siempre alineados. Soft UI sin disciplina de shape = "bonito en screenshot, barato en uso".

3. **Primary color confuso.** Comment dice lime con eyedropper. Primary real es olive/pine. Lime existe como token pero no gobierna la UI. Resultado: no es Remote, no es Linear, no es Harly.

4. **Tipografía cobarde.** Inter para todo, "display = Inter bold". Sin contraste tipográfico no hay marca. Solo hay SaaS.

5. **Empty states genéricos.** Dashed border + icon in rounded box + title + description + button. Es el empty state default de todos los boilerplates. No enseña el producto.

6. **Coming soon en la cara del usuario.** Activity en topbar, integrations, templates del builder, attach files en AI… Cada "coming soon" es un recordatorio de incompleto. En beta pública, eso **quema confianza**.

### 6. Tres productos, tres personalidades

Harly no es una UI. Son **tres**:

| Superficie | Qué debería ser | Qué es hoy |
|---|---|---|
| **Admin ATS** | Tool densa, rápida, keyboard-first | Soft dashboard genérico |
| **Career page** | Brand canvas del cliente | Builder semi-potente, templates uneven |
| **Candidate portal** | Experiencia calmada, status-clear | Mini-app con su propio sidebar dark evergreen |

El portal sidebar dark evergreen vs admin paper/lime es un **salto de universo**. Puede ser intencional (candidato ≠ recruiter), pero hoy se siente como **otro proyecto pegado**, no como un sistema con modos.

Career page: la propia crítica interna ya lo dijo (5–6/10). Templates con paridad incompleta, preview no fiel, builder monolítico. Eso es UX de **configuración frágil**, no de "tu brand en 10 minutos".

### 7. Producto: features > jobs-to-be-done

Esto es lo más duro y lo más importante.

**Jobs reales de un hiring lead en startup**
1. Publicar un rol lindo y recibir applies
2. Triage rápido de CVs
3. Mover pipeline sin fricción
4. Coordinar entrevistas sin caos de mails
5. Tomar decisión con feedback del equipo
6. Mandar oferta y cerrar

Harly **cubre** esos jobs… pero también mete: automations builder, native e-sign, semantic matching, AI chat widget flotante, marketplace de integraciones semi-vacío, reports, talent pool, documents hub, developers API, SSO/SAML settings surface, DSAR flows en el candidate profile.

Nada de eso es "malo". El problema es el **orden de madurez percibida**:

> Cuando el core no se siente *sharp*, las features avanzadas se sienten *premature*.

Un automation builder al lado de un candidate panel de 8 tabs no grita "maduro". Grita "construí mucho antes de editar".

### 8. UX de velocidad: el ATS se gana en manos, no en pantallas

Un buen ATS es: **keyboard-first**, **bulk-first**, **stage-context-first**, **menos clicks al next decision**.

Hoy hay Command Menu (bien), DnD pipeline (bien), bulk move (bien)… pero la experiencia default sigue siendo **click tourism**: abrir candidato → escanear tabs → buscar el botón correcto en action bar → drawer → confirm.

Falta el feeling de:
- `J/K` entre candidatos
- `A` advance, `R` reject, `E` email, `S` schedule
- preview de resume **siempre visible** al lado del score/decision
- decision rail fijo, no 8 tabs

El pipeline card tiene score AI + stale pill + status + checkbox + drag handle. Está cerca de algo bueno… pero la **página del candidato no cierra el loop** con la misma densidad decisional.

### 9. Lo que SÍ está bien (porque la crítica brutal sin esto es pose)

- **Tokens con nombres de dominio** (`paper`, `pine`, `sage`, `lime`) → hay intención de marca.
- **Dashboard layout no es un desastre** de spacing crudo.
- **Pipeline board** tiene piezas serias (a11y announcements de dnd-kit, stale detection, bulk).
- **Empty/loading skeletons** existen (mejor que spinners sueltos).
- **Permissions en nav** (no mostrar lo que no podés usar) → madurez de producto.
- **Focus mode / fullscreen** para job editor y career builder → entendés surfaces de creación.
- La autocrítica en `frontend-critica.md` demuestra que **ves el problema**. Eso ya te pone por delante del 90%.

No es feo por descuido total. Es **inconformidad justificada por falta de edición brutal**.

### 10. El diagnóstico raíz (sin anestesia)

Harly hoy es: **un monorepo de features con skin de producto.**
No: **un producto con features subordinadas a un workflow.**

Por eso la UI "no te cierra":
- no hay **hero surface** (la pantalla que define la marca del tool)
- no hay **primary object** claro (¿job? ¿candidate application? ¿pipeline stage?)
- no hay **visual author** (quién decide radius, type, icon, density)
- hay **demasiada simetría de importancia** entre módulos

Ashby se siente de un autor. Linear se siente de un autor. Harly se siente de un equipo de features.

### Qué haría yo (orden cruel, no wishlist)

**Fase 0 — Decisiones de producto (1 día, en un doc, sin code)**
1. **Primary object:** `Application` (candidato-en-un-job), no "Candidate abstracto".
2. **Primary surface:** Pipeline (kanban/list) + Candidate focus panel.
3. **Secondary:** Jobs, Inbox, Calendar.
4. **Tertiary (Settings-ish):** Career page, Templates, Documents, Integrations, Reports, Pool, People, Developers.

Si no firmás esto, cualquier redesign es maquillaje.

**Fase 1 — IA purge (1 semana)**
- Sidebar a **6 items max** visibles por default.
- Career Page, Documents, Templates, Talent Pool, People → Settings o "More".
- Unificar Candidates list como *directory*, no como daily home.
- Matar o esconder "Coming soon" de top-level chrome.

**Fase 2 — Candidate focus redesign (la win más grande)**
- Layout 2 columnas: **Resume/profile sticky** | **Decision rail**
- Tabs máximas: **3** (Overview / Process / Files) o **0 tabs** + sections scrolleables
- Primary action contextual por stage
- Action bar de 3 botones + overflow menu (no feria)
- Romper el archivo de 1929 líneas en composition real

**Fase 3 — Design system lock (3–5 días)**
- **Una** icon family (Phosphor *o* Lucide, no ambos)
- Radius scale documentada: `sm 6 / md 10 / lg 14 / pill only for chips+primary CTA`
- Type: Inter ok si querés "tool", pero display weight/tracking + mono para IDs/metrics
- Accent rule: lime **solo** para estado activo / highlight / AI / unread — nunca como decoración
- Empty states con **job-to-be-done** ("Publicá tu primer rol", no "No items yet")

**Fase 4 — Home como triage**
- Quitar saludo como hero
- "Needs you" list ranked
- Un solo pipeline widget deep-linkeado
- Setup checklist colapsable, no card permanente de culpa

**Fase 5 — Career + Portal (después)**
No antes. Son brand surfaces. Si el tool diario es flojo, la career page bonita es un escaparate de un local desordenado.

### Frase final, sin filtro

Harly **no es feo**. Es peor: es **indistinto con demasiadas cosas**.

Lo genérico se perdona en un MVP de 3 pantallas. En un monorepo con e-sign, automations, AI, SSO y GDPR, lo genérico se siente como:

> "Construyeron el aeropuerto antes de decidir cómo se aborda el avión."

Y vos lo sentís porque **ya pasaste la fase de "wow, corre"** y entraste a la fase de "¿por qué no me enamora usarlo?".

Esa fase se gana con **edición**, no con más features.

---

## Ronda 3 — Lectura del mock de referencia (imagen compartida por el usuario)

Te entiendo. Y no es drama de founder: **esa imagen y el producto actual no son "versiones distintas del mismo diseño"**. Son dos filosofías de UI.

La buena noticia: **la visión no murió**. Se diluyó bajo feature pressure. Se puede recuperar. La mala: no se recupera "poniendo lime y rounded corners". Hay que re-editar el producto hacia *esto*.

### Qué dice realmente tu visión (leyendo la imagen, no el mood)

No es "Remote bonito". Es un sistema con reglas duras:

**1. Chrome mínimo, contenido máximo**
- Sidebar **icon-rail** (4–5 iconos), no almacén de labels
- Top bar **casi vacía**: workspace switcher al centro, acciones a la derecha
- Cero breadcrumb ruidoso, cero título de sección compitiendo

El producto actual: sidebar de módulos + topbar con search + notif + theme + activity coming soon + user. El chrome **habla más que el trabajo**.

**2. Una superficie hero, no un dashboard de widgets**
La pantalla es **una tabla de personas**. Greeting arriba, filtros chicos, filas generosas, avatares reales, badges mínimos.

Harly actual: home = saludo + 6 cards + charts. Tu visión: home = **la gente con la que estoy decidiendo**.

Eso es product design, no skin.

**3. Soft density, no cockpit**
- Filas altas, mucho aire
- Selección con **row highlight suave** (gris perla), no borders grises
- Status pill quieto (`Pending` muted)
- Accent lime **solo** en chips de categoría y un par de dots de marca
- Negro solo en tags de peso (`Product`)

Harly: hairlines, cards, shadows, pine primary, botones pill everywhere. Misma familia de "soft UI" en el comment del CSS… **otra ejecución**.

**4. Human-first, no system-first**
Fotos, iniciales, team avatars. La UI trata personas como personas, no como rows de CRM.

En un ATS esto es oro: candidatos, hiring team, interviewers. Tu visión ya lo sabía. El producto se fue a "entidades + tabs + drawers".

**5. Quiet confidence**
No hay: 👋 · "Let's go!" · AI floating widget · 12 nav items · coming soon

Hay **calma operativa**. Eso es el feeling que te enamoró. Y es lo opuesto a "feature marketplace con skin shadcn".

### Por qué terminó siendo "todo lo contrario" (sin moralina)

No fue falta de gusto. Fue una trampa clásica de builders ambiciosos:

| Lo que pasó | Efecto en la UI |
|---|---|
| "Hay que soportar todo el journey ATS" | 14 items de nav |
| "Cada feature necesita home" | Cards, hubs, settings clones |
| shadcn + sidebar kit como base | Chrome genérico que pelea con tu mock |
| Tokens renombrados (`pine/sage`) sin rediseñar layouts | Theme cosmético sobre estructura vieja |
| Candidate = compliance + AI + docs + offers… | 8 tabs, action bar de avión |
| Beta / launch confidence | Priorizaste completeness sobre *point of view* |

Tu mock dice: **"menos software, más mesa de trabajo"**. El repo dice: **"más software, por si acaso"**.

Por eso duele. No es que "no te salió bonito". Es que **construiste el anti-mock sin darte cuenta**, feature por feature.

Y el CSS hasta confiesa la aspiración: *Remote.com-inspired soft UI* …pero el layout system nunca se alineó a esa referencia. Solo la paleta a medias.

### El gap en una frase

> **Visión:** una app quieta donde *las personas* son el UI.
> **Hoy:** una suite donde *los módulos* son el UI.

Eso es el "todo lo contrario".

### No está perdido (y no necesitás tirar el monorepo)

La visión es recuperable porque:
1. **Ya tenés el norte visual** (esta imagen + el banner).
2. **El backend aguanta** un rediseño de shell sin reescribir dominio.
3. El dolor que sentís es señal de autor, no de fracaso.

Lo que **no** funciona: "Hagamos un pass de UI polish" · "Cambiemos el primary a lime" · "Metamos más rounded-2xl"

Lo que **sí** funciona: **reconvergir producto → shell → density → accent rules**, en ese orden.

**Traducción ATS de tu mock (sin copiar Remote literal)**

| Principio del mock | En Harly sería |
|---|---|
| Icon rail corto | Home / Inbox / Pipeline / Jobs (+ overflow) |
| Workspace pill centrado | Workspace switcher quieto |
| Greeting + filters | "Good morning" + Job / Stage / Needs review |
| Human table con row selection | **Candidates/Applications list** como hero surface (no 6 widgets) |
| Soft selected rows | Selected candidates / bulk bar |
| Lime solo en tags + brand dots | Stage chips, AI score, unread — nunca botones primary verdes chillones |
| `…` por row | Acciones contextuales, no toolbar global de 12 botones |
| Cero ruido | AI en command/panel, no FAB eterno |

La home de tu visión, en hiring, probablemente no es un bento de métricas. Es algo más cercano a:

**"Quién necesita una decisión mía hoy"** en una lista humana, soft, seleccionable — con pipeline como second surface, no como 4to item del almacén.

### Por qué tu inconformidad es correcta (y útil)

Muchos founders se resignan a "open source se ve así". Vos tenés una referencia de **autoría**. Eso es ventaja competitiva en ATS:

- Greenhouse se siente enterprise-heavy
- Lever se siente dated
- Open-source ATS se siente abandonado
- **Harly podría sentirse como Remote: calm, human, expensive-soft**

Ese hueco sigue vacío. Tu mock no era vanity. Era **posicionamiento**.

El producto actual compite en "features self-host". Tu visión compite en **"quiero vivir en esta herramienta"**.

Solo la segunda construye marca.

### Cómo volver sin deprimirte (plan emocional + práctico)

**1. Renombrá el problema**
No: "Harly es feo". Sí: **"Harly se fue de suite-mode; hay que volver a workbench-mode."**

**2. Congelá features de superficie 2–3 semanas**
Nada de nueva integración visible. Solo shell + 2 pantallas sagradas.

**3. Elegí 2 pantallas "visión-lock"**
Si estas dos no se parecen al mock, nada importa:
1. **Shell** (icon rail + top chrome)
2. **People/Applications list** (la tabla humana)

Después: Candidate focus (panel, no monstruo de tabs). Después: Pipeline con la misma density language.

**4. Design rules extraídas del mock (para clavar en piedra)**

```
Canvas:      near-white warm (#f7f7f5-ish), almost no borders
Surfaces:    pure white only when needed; prefer row wash over cards
Radius:      large outer shell, medium rows, pill only for chips/status
Accent:      lime = signal (tag, brand, active), never primary mass
Primary:     near-black text actions, not olive buttons everywhere
Nav:         ≤5 primary icons
Type:        big greeting, quiet column headers (uppercase tracking small)
Density:     generous row height, soft selection, lots of negative space
People:      real avatars always; initials as fallback in soft circle
Motion:      almost none; selection/hover only
```

Eso *es* tu visión, codificada. El mock es el test: si una PR no pasa estas reglas, no es Harly.

### Cierre de la ronda

No fallaste la visión porque no sabías diseñarla. La fallaste (como casi todos los que construyen solo) porque **cada feature te empujó un milímetro lejos del mock**, y a los 200 PRs ya estabas en otro producto.

Eso se revierte. No con vergüenza. Con una decisión de autor:

> **Harly no es "el ATS completo". Harly es el ATS que se siente como esta pantalla: humano, quieto, soft, decisivo.**

---

## Ronda 4 — Founder no-técnico + IA: por qué se perdió la identidad

*(en respuesta a: "Es que claro, como fundador y sin experiencia en codigo, dejaba que la IA me hiciera todo, pero terminé perdiendo la identidad.")*

Eso que contás es **el patrón #1 de productos hechos con IA en 2024–2026**. No es un fallo personal. Es un fallo de *proceso*.

### Qué pasó, en crudo

La IA es excelente en: completar features, copiar patrones de shadcn / SaaS genérico, "hacer que compile", agregar una pantalla más "por si hace falta".

La IA es pésima (sola) en: **proteger una visión**, decir que no, editar, recordar el mock de hace 40 chats, priorizar *identidad* sobre *completitud*.

Vos traías el norte (esa pantalla Remote-soft, humana, quieta). La IA traía el default del entrenamiento: **ATS suite + sidebar + cards + settings + coming soon**.

Cada "sí, agregá esto" fue un voto por el default. Al final el repo no se parece a Max. Se parece a **el promedio de todos los dashboards que la IA ya vio**.

Eso no significa que no sepas lo que querés. Significa que **el proceso no tenía un guardián de identidad**. Y sin experiencia en código, es casi imposible ser ese guardián a nivel de PR… a menos que cambies *cómo* dirigís.

### La trampa del founder no-técnico + IA

| Lo que sentís | Lo que la IA interpreta |
|---|---|
| "Quiero que se sienta como Remote" | "Uso tokens soft y rounded" (skin) |
| "Que sea completo para lanzar" | 14 módulos en el nav |
| "Agregá GDPR / AI / e-sign" | Otra superficie, otro chrome, más ruido |
| "Arreglá este bug" | Parche local, sin mirar el sistema visual |
| "Mejorá la UI" | Más animaciones / cards / polish cosmético |

Nunca te dijo: **"Esto rompe tu mock. ¿Seguro?"**

Porque no es su trabajo default. **Tiene que ser el tuyo, o el de un doc que la obligue.**

### No perdiste la identidad. La **no codificaste**.

Eso es la diferencia clave.

La identidad estaba: en tu cabeza, en un JPG, en un comment de CSS ("Remote-inspired").

No estaba en un **contrato** que la IA no pudiera violar:
- max 5 items de nav
- home = lista humana, no bento
- lime solo para signal
- no "coming soon" en chrome
- candidate = 1 decision rail, no 8 tabs

Sin contrato, cada sesión de IA es un restart con amnesia elegante. Con contrato, aunque no sepas code, **podés rechazar outputs** con criterio de autor.

Fundadores no-técnicos que conservan identidad no escriben React. **Escriben constraints.**

### Cómo retomar el control (sin volverte engineer)

**1. Dejá de pedir "features". Empezá a pedir "fidelidad"**

Mal: *"Agregá talent pool y documents y automations"*

Bien: *"No agregues nada nuevo. Rehacé el shell para que se parezca a [imagen]. Max 5 iconos. Cero cards en home. Lista de personas."*

**2. Un Vision Lock de 1 página (tu nueva constitución)**

Antes de cualquier chat de UI:
- **Referencia:** la imagen
- **Feel:** quiet, human, soft, expensive
- **No es:** suite enterprise, purple AI, dense cockpit
- **Shell:** icon rail, top minimal, workspace center
- **Home:** people/work table, not widget grid
- **Accent:** lime = tags/status only
- **Hard bans:** coming soon in chrome, 8 tabs, FAB AI forever, Lucide+Phosphor mix, olive primary buttons everywhere

Eso lo pegás al inicio de **cada** sesión de diseño. Si el output lo viola, no es "casi". Es **rechazado**.

**3. Regla de oro con IA: una superficie por sprint**
- Semana 1: solo shell
- Semana 2: solo home/list
- Semana 3: solo candidate panel

Si pedís "mejorá toda la app", la IA vuelve al promedio.

**4. Juzgá con screenshots, no con "¿quedó lindo?"**

Flujo sano:
1. IA implementa
2. Vos abrís la pantalla
3. Ponés el mock al lado
4. Marcás 5 diferencias
5. "Arreglá solo estas 5. No inventes features."

Eso es dirección de diseño. No es código.

**5. Separá dos modos de chat (mentalmente)**
- **Builder mode:** "hacé que la feature exista" (ahí perdiste identidad)
- **Author mode:** "defendé el mock; borra ruido; no agregues" (ahí la recuperás)

Hasta que la identidad vuelva, **Author mode gana**. Builder mode pausado para UI.

**6. "No" es tu skill más valioso ahora**

Cada feature nueva visible = riesgo de diluir otra vez. El producto ya es amplio de más. Tu trabajo de founder ahora no es inventar: es **editar**.

### Reencuadre

No fuiste "el founder que no sabe y la IA le arruinó el producto".

Fuiste **el founder que llegó más lejos de lo que la mayoría llega sin equipo**, y ahora estás en el momento exacto en que los productos buenos se separan de los genéricos:

> Dejar de construir en ancho y empezar a construir en *carácter*.

Greenhouse no se siente Greenhouse por tener más endpoints. Linear no se siente Linear por tener más settings. Tu mock no es nostalgia: es **la ventaja** que el código todavía no expresa.

La identidad no se "perdió en el repo". Está en esa imagen. El repo solo no la obedece todavía.

### Mantra

> **Harly no se mide por cuántas features tiene. Se mide por si al abrir la app se siente como esa mañana con Jessica: humana, quieta, clara.**

Todo lo que no empuje eso, por ahora, es ruido — aunque sea "impresionante" en un README.

---

## Pendiente (no llegamos a hacerlo en esta sesión)

Grok ofreció como siguiente paso armar un **Vision Lock Doc** de 1 página (shell target + home ATS traducida del mock + anti-patterns del código actual + checklist de PRs) para pegarle a cualquier IA/agente como filtro de rechazo. No se llegó a escribir — queda como próximo entregable.
