# ADR-001: Career Page Theming System

**Status:** Accepted  
**Date:** 2026-06-13  
**Deciders:** Maximiliano (product), Claude (implementation)

## Context

Career page builder today hardcodes "editorial" template with basic theme controls (accent, rounded). User wants:
1. **4 distinct templates** (minimal default, playful=current editorial renamed, ashby, greenhouse) — same config, different layouts
2. **Theme controls**: light/dark mode, background color, font family (sans/serif/display/mono)
3. **Dark mode** scoped to public career page only (not dashboard)
4. **Rename** EditorialTemplate → PlayfulTemplate (physical files + all references)

Forces:
- Config already stored as jsonb `workspaceSettings.careerPageConfig`
- Templates share sections (hero/intro/values/positions/cta) — config-driven, only layout/styling differs
- Builder needs live preview with smooth transitions
- Must work SSR (public page) + CSR (builder preview)
- AnimationDesign skill loaded — transitions should feel premium (ease-out, <250ms, reduced-motion support)

## Decision

**Architecture: CSS variables + wrapper component + template switch**

```
ThemeWrapper (new)
  ├─ applies theme.{mode, background, font} via CSS vars + classes
  ├─ wraps entire career page render
  └─ enables dark: pseudo-class when mode=dark

CareerPageRender
  ├─ switch (config.template)
  │   ├─ "minimal" → MinimalTemplate (new, default)
  │   ├─ "playful" → PlayfulTemplate (renamed from Editorial)
  │   ├─ "ashby" → AshbyTemplate (new, stub Phase 2)
  │   └─ "greenhouse" → GreenhouseTemplate (new, stub Phase 2)
  └─ all wrapped by ThemeWrapper

config.ts
  ├─ theme.mode: "light" | "dark" (default "light")
  ├─ theme.background: string (hex/hsl, default "#ffffff")
  ├─ theme.font: "sans" | "serif" | "display" | "mono" (default "sans")
  └─ careerTemplates: ["minimal", "playful", "ashby", "greenhouse"] (minimal first)
```

## Options Considered

### Option A: data-theme attribute + CSS cascade (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — standard pattern |
| Perf | High — CSS-only, no JS |
| SSR compat | Perfect — hydration-safe |
| Builder UX | Instant toggle, no flicker |

**Pros:**
- Dark mode via `dark:` pseudo-class (Tailwind standard)
- Font via `font-sans/serif/display/mono` utility classes
- Background via inline style (dynamic color)
- Zero hydration mismatch
- AnimationDesign transitions work naturally (200ms ease-out on theme changes)

**Cons:**
- Requires wrapper component

### Option B: Context + CSS-in-JS

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — more runtime |
| Perf | Lower — JS overhead |
| SSR compat | Risk — hydration timing |
| Builder UX | Can flash on mount |

**Pros:**
- TypeScript theme object
- Dynamic computed values

**Cons:**
- Heavier, hydration risk, breaks Tailwind dark: patterns

### Option C: Separate stylesheets per theme

**Rejected** — doesn't support user-customizable colors/fonts dynamically.

## Trade-off Analysis

**Chosen A** balances low complexity, zero-flicker builder UX, SSR safety, and compatibility with existing Tailwind patterns. Templates can use `dark:bg-zinc-900` naturally. Font/background applied at wrapper level keep templates clean.

**Rejected B** — runtime weight + hydration risk not worth TS theme object when CSS vars + Tailwind already solve it.

## Consequences

**Easier:**
- Add new templates (just new component, config switch handles rest)
- Dark mode in templates (standard `dark:` prefix)
- Preview theme changes instantly (wrapper re-renders, templates stay mounted)

**Harder:**
- Must wrap every template render in ThemeWrapper (enforced by CareerPageRender)
- Template authors must remember font classes inherit from wrapper

**Revisit:**
- Phase 2: Ashby/Greenhouse templates (stubs now, full impl later)
- If we add theme presets (light/dark variants per template), extend config.theme

## Implementation Plan (Fase 1)

### 1. Extend config.ts
```ts
theme: {
  mode: "light" | "dark";        // new
  background: string;             // new (hex/hsl)
  font: "sans"|"serif"|"display"|"mono"; // new
  accent: string | null;          // existing
  rounded: "soft" | "sharp";      // existing
}

careerTemplates = ["minimal", "playful", "ashby", "greenhouse"]; // reorder
```

Defaults: mode=light, background="#ffffff", font="sans"

### 2. Create ThemeWrapper.tsx
```tsx
// features/career-page/ThemeWrapper.tsx
export function ThemeWrapper({ 
  config, 
  children 
}: { 
  config: CareerPageConfig; 
  children: React.ReactNode;
}) {
  const { mode, background, font } = config.theme;
  const fontClass = {
    sans: "font-sans",
    serif: "font-serif", 
    display: "font-display",
    mono: "font-mono"
  }[font ?? "sans"];

  return (
    <div 
      className={cn(fontClass, mode === "dark" && "dark")}
      style={{ backgroundColor: background ?? "#ffffff" }}
    >
      {children}
    </div>
  );
}
```

### 3. Rename EditorialTemplate → PlayfulTemplate
- File: `templates/EditorialTemplate.tsx` → `templates/PlayfulTemplate.tsx`
- Export name: `EditorialTemplate` → `PlayfulTemplate`
- All imports updated

### 4. Refactor CareerPageRender.tsx
Real switch instead of hardcoded Editorial:
```tsx
export function CareerPageRender({ config, workspace, jobs, boardRoot }) {
  const TemplateComponent = {
    minimal: MinimalTemplate,
    playful: PlayfulTemplate,
    ashby: AshbyTemplate,
    greenhouse: GreenhouseTemplate,
  }[config.template] ?? MinimalTemplate;

  return (
    <ThemeWrapper config={config}>
      <TemplateComponent 
        config={config} 
        workspace={workspace} 
        jobs={jobs} 
        boardRoot={boardRoot} 
      />
    </ThemeWrapper>
  );
}
```

### 5. Create MinimalTemplate.tsx (default, clean)
Phase 1: working implementation
- Clean typography-first layout
- No decorative elements
- Just hero + positions + optional CTA
- Respects theme.{mode, font, background}

### 6. Stub Ashby/Greenhouse templates
Phase 1: basic skeleton (returns placeholder)
Phase 2: full implementation with /better-icons + inspiration from 21st

### 7. Update builder UI
CareerPageBuilder.tsx changes:
- Template picker: 4 cards (minimal/playful/ashby/greenhouse), minimal=default, ashby/greenhouse show "Coming soon" badge
- New Theme section:
  - Mode toggle (light/dark) — animated switch, 150ms ease-out transition
  - Background color picker (HexColorPicker from react-colorful)
  - Font select dropdown (sans/serif/display/mono)
  - Preview updates live (no save needed)

Animations (web-animation-design):
- Template switch: 200ms ease-out fade
- Theme toggle: 150ms ease (color transitions)
- No animation on `prefers-reduced-motion`

### 8. Update presets
CAREER_PRESETS in config.ts:
- minimal: light, white bg, sans
- playful: light, custom bg (#FFF9E6?), sans
- ashby/greenhouse: TBD Phase 2

## Verification Steps

1. **Config**: inspect normalized config, new fields present with defaults
2. **Rename**: grep "Editorial" → zero matches except git history
3. **Switch**: change template in builder → different layout renders
4. **Dark mode**: toggle mode → `dark` class applied, `dark:` styles active
5. **Font**: change font → class updates, typography shifts
6. **Background**: pick color → inline style updates
7. **Animations**: toggle theme → smooth 150ms transition, no jank
8. **Reduced motion**: enable OS setting → no animations
9. **Build**: `pnpm build` green
10. **Preview**: all 4 templates render (ashby/greenhouse minimal stubs OK)

## Action Items

- [x] Write ADR
- [ ] Extend config.ts schema + defaults
- [ ] Create ThemeWrapper component
- [ ] Rename EditorialTemplate → PlayfulTemplate (file + all refs)
- [ ] Refactor CareerPageRender with real switch
- [ ] Create MinimalTemplate (full impl)
- [ ] Stub AshbyTemplate + GreenhouseTemplate
- [ ] Update builder: 4-template picker + Theme section (mode/bg/font)
- [ ] Add animations with reduced-motion support
- [ ] Verify all 10 steps
- [ ] Update presets with new theme fields
