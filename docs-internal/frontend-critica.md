CRÍTICA BRUTAL: Frontend, Career Page & Career Page Builder
[Última revisión: 2026-06-13 — items marcados ✅ RESUELTO ya están en código]

1. ARQUITECTURA DE COMPONENTES - 7/10
✅ RESUELTO 1.1 — <WorkspaceLogo /> extraído
WorkspaceLogo({ workspace, size }) vive en board/components.tsx con prop size: "sm"|"md"|"lg".
BoardHero (md), BoardMinimalHeader (lg), BoardTopBar (sm), BoardJobHeader (md) — todos usan el componente. Cero duplicación.

❌ PENDIENTE 1.2 Props drilling
WorkspaceBoardBranding sigue pasándose por todos lados.
Cada componente recibe workspace con 7+ propiedades pero usa 2-3.
Sin context, sin composition correcta.

❌ PENDIENTE 1.3 Mixing concerns
board/components.tsx mezcla layout, navegación, presentación y tipos de datos inline.
Ideal: separar en components/board/layout/, header/, jobs/, lib/routing/board.ts.

2. CAREER PAGE BUILDER - 5/10
❌ PENDIENTE 2.1 Estado local gigante sin validación
~910 líneas de componente monolítico.
update() usa structuredClone() en CADA CAMBIO.
Sin debouncing, sin validación en tiempo real.
SOLUCIÓN: react-hook-form + zod, validación progresiva.

❌ PENDIENTE 2.2 Preview iframe overcomplicated
65 líneas clonando stylesheets manualmente, ResizeObserver, scale calculations.
Sin fallback ni loading state.
ALTERNATIVA: transform: scale() + CSS container queries.
(Nota: el iframe está justificado para aislar media queries — la crítica original era válida pero la solución de transform tiene sus propios tradeoffs. Evaluar con calma.)

✅ RESUELTO 2.3 Templates "Coming soon"
AshbyTemplate y GreenhouseTemplate están completos y funcionando. ready: true en todos los presets.

❌ PENDIENTE 2.4 Icon select horrible
ICON_OPTIONS = 9 strings hardcodeados, sin preview visual.
SOLUCIÓN: Combobox con search + icon preview (shadcn style).

✅ RESUELTO 2.5 Reset defaults sin confirmación
Ahora usa confirm() antes de limpiar config.

3. TEMPLATES - 6/10
❌ PENDIENTE 3.1 MinimalTemplate ignora secciones del config
No renderiza gallery, overview, values.
El config permite habilitarlas pero el template las ignora silenciosamente.
BUG: usuario configura gallery → no aparece → confusión.

❌ PENDIENTE 3.2 PlayfulTemplate sigue siendo el único completo
297 líneas vs 110 de Minimal. Minimal necesita paridad de features.

❌ PENDIENTE 3.3 Hero image overlay inconsistente
PlayfulTemplate soporta overlay gradient/none. MinimalTemplate no tiene overlay support.

✅ RESUELTO 3.4 EMPLOYMENT_LABEL / WORKPLACE_LABEL duplicados
AshbyTemplate y GreenhouseTemplate ya usan formatEmploymentType() y formatWorkplaceType() de lib/format.ts.
Un solo lugar para actualizar cuando se agregan nuevos tipos.
NOTA: output cambia levemente — "Full Time" (espacio) en vez de "Full-time" (guión). Verificar si hay tests que dependan del formato viejo.

❌ PENDIENTE 3.5 Apply link incorrecto en templates de carrera
AshbyTemplate y GreenhouseTemplate usan /apply/${job.slug}.
DEBERÍA SER /jobs/${job.slug} para ir al detalle del job con tab "Application".
(board/components.tsx JobTable usa boardPath(boardRoot, "jobs", job.slug) — correcto.)

4. CONFIG & DATA LAYER - 7/10
✅ LO BUENO: config.ts bien diseñado, Zod correcto, normalizeCareerPageConfig() defensivo, JSONB apropiado.

❌ PENDIENTE 4.1 structuredClone() innecesario en CAREER_PRESETS
EMPTY es read-only; spread operator suficiente, no necesita clonar.

❌ PENDIENTE 4.2 asArray() no valida contenido
Si metes [null, undefined, "string"] pasa sin error. Zod solo en form, no en runtime.

❌ PENDIENTE 4.3 Config migration silenciosa
// Old configs stored "tint"; treat anything but "none" as the gradient.
¿Hay configs viejos en producción? Necesita migration explícita documentada.

5. BOARD PREVIEW COMPONENT - 3/10
❌ PENDIENTE 5.1 Datos fake hardcodeados
SAMPLE_JOBS son mock. El preview no muestra jobs reales.

❌ PENDIENTE 5.2 URL hardcodeada
Muestra "harly.app/board/{slug}" en lugar de usar el host real del environment.

❌ PENDIENTE 5.3 Traffic lights decorativos sin función
Tres círculos de colores que no hacen nada. Skeuomorfismo innecesario.

❌ PENDIENTE 5.4 Preview no es "faithful"
Usa estilos simplificados, no renderiza BoardShell real.
Cuando el board real cambia, el preview no coincide.

6. PERFORMANCE - 5/10
❌ PENDIENTE 6.1 structuredClone en cada keystroke
update() clona config completo en cada cambio. Immer o granularidad menor.

❌ PENDIENTE 6.2 ResizeObserver sin debounce
Recomputa escala del iframe en cada render del preview. Throttle necesario.

❌ PENDIENTE 6.3 Sin code splitting de templates
Los 4 templates se importan sin lazy(). Bundle innecesariamente pesado.
SOLUCIÓN: const PlayfulTemplate = lazy(() => import('./templates/PlayfulTemplate'))

7. UX & USABILIDAD - 7/10
❌ PENDIENTE 7.1 Dirty state tracking frágil
setDirty(false) al guardar, pero sin feedback si el usuario presiona Save sin cambios.

✅ CONFIRMADO CORRECTO 7.2 "View live" apunta a "/"
href="/" es intencional — el board siempre vive en la raíz del dominio del workspace.
No es un bug.

✅ RESUELTO 7.3 Reset to defaults sin confirmación
confirm() dialog agregado.

❌ PENDIENTE 7.4 Sin undo/redo
Borrado accidental = trabajo perdido. History stack o auto-save drafts.

❌ PENDIENTE 7.5 Filtros de CareerPositions no persisten en URL
Estado local que se pierde al navegar. Debería estar en ?dept=Engineering query params.

8. ACCESSIBILITY - 4/10
❌ PENDIENTE 8.1 Buttons icon-only sin aria-label
<button type="button" onClick={() => setDevice(d)}><Icon /></button> — screen readers ciegos.

❌ PENDIENTE 8.2 Zinc-400 sobre blanco = 3.1:1 contrast
WCAG AA requiere 4.5:1 para texto normal.

❌ PENDIENTE 8.3 Focus states ausentes en componentes custom
Navegación por teclado imposible.

❌ PENDIENTE 8.4 Collapsibles no semánticos
Debería ser <details>/<summary> nativo en lugar de button + state manual.

9. TYPE SAFETY - 7/10
✅ LO BUENO: Zod schemas bien definidos, types compartidos entre builder y templates.

❌ PENDIENTE 9.1 as Route casting deshabilita type checking
boardPath() retorna string → cast a Route → Next.js typed routes no valida.

❌ PENDIENTE 9.2 Icon mapping sin type safety
chip.icon puede ser "invalid-icon" → runtime undefined.
SOLUCIÓN: type IconName = keyof typeof ICONS + as const.

10. BUGS — ESTADO ACTUAL 🐛
✅ RESUELTO 10.1 AshbyTemplate / GreenhouseTemplate con dicts locales duplicados
✅ RESUELTO 10.2 <WorkspaceLogo /> no existía — lógica repetida 4x
✅ RESUELTO 10.3 Reset defaults sin confirmación

✅ CONFIRMADO NO-BUG 10.4 "View live" va a raíz
Intencional por diseño.

❌ PENDIENTE 10.5 Apply link en AshbyTemplate y GreenhouseTemplate
/apply/${job.slug} debería ser /jobs/${job.slug}.

❌ PENDIENTE 10.6 MinimalTemplate ignora gallery/overview/values
Usuario configura → nada aparece → confusión silenciosa.

❌ PENDIENTE 10.7 BoardPreview no refleja cambios reales
Mock data, estilos simplificados, URL hardcodeada.

11. RECOMENDACIONES PRIORIZADAS
🔴 P0 - Crítico:
[ ] Fix apply link en AshbyTemplate y GreenhouseTemplate (/apply → /jobs) — 2 líneas
[ ] Completar MinimalTemplate con gallery/overview/values — 30-60 min

🟠 P1 - Importante:
[ ] Refactor CareerPageBuilder en sub-componentes (< 200 líneas cada uno)
[ ] Agregar debouncing a preview updates
[ ] Fix icon select UX con preview visual
[ ] Code splitting de templates con lazy()
[ ] Fix dirty state feedback

🟡 P2 - Backlog:
[ ] BoardPreview con datos reales y URL dinámica
[ ] Reemplazar iframe preview con container queries (evaluar tradeoffs)
[ ] Undo/redo stack
[ ] Migrar a react-hook-form + zod
[ ] Accessibility audit completo
[ ] asArray() con validación de contenido
[ ] Migration explícita para configs viejos
[ ] i18n support

12. CONCLUSIÓN
Puntaje general: 6/10 (subió de 5.5)

Resuelto en esta sesión:
- <WorkspaceLogo /> extraído, 0 duplicación en board/components.tsx
- formatEmploymentType/formatWorkplaceType centralizados en AshbyTemplate y GreenhouseTemplate
- Reset confirm dialog agregado
- AshbyTemplate y GreenhouseTemplate completos (ya no son stubs)

Lo que sigue siendo deuda:
- MinimalTemplate incompleto (feature gap vs Playful/Ashby/Greenhouse)
- Apply link incorrecto en los templates de carrera nuevos
- Builder monolítico, performance issues, accesibilidad
- BoardPreview desconectado de la realidad

Próxima prioridad: fix apply link (trivial) + completar MinimalTemplate.
