# Harly — Style Reference

> A quiet, human hiring workbench on warm paper — soft off-white surfaces, real people in every row, and a single chartreuse pulse that marks only what is live, selected, or decisive.

**Theme:** light

**North-star mock:** [`public/images/figma-preview/dashboard-hero.png`](public/images/figma-preview/dashboard-hero.png)
**External reference:** [Remote by Modula](https://remotebymodula.framer.website/) (soft SaaS shell, human tables, lime signal)
**Product one-liner:** Harly is a self-hosted ATS that feels like a calm morning desk — not an enterprise suite, not a feature warehouse.

Harly operates as a **light engineering-adjacent people tool**: warm paper canvas (`#f5f5f4`) with near-black typography (`#171717`) and a single chartreuse accent (`#c8f560`) that activates only live signals — selected rows, category chips, brand marks, unread dots, active nav. Structure comes from **luminance and spacing**, not ornament: soft row washes instead of card farms, hairline borders that disappear until looked for, minimal shadow. The outer app shell is a generous rounded white frame; the sidebar is an **icon rail**, not a module warehouse. Density is comfortable. People are the UI — real avatars, soft initials, team stacks. The product's intelligence is the workbench itself: triage, pipeline, and decision — never decorative chrome.

> **Authority rule for agents and humans:** If implementation conflicts with this file, **this file wins**. Fix the code. Do not “almost” match the mock.

---

## Product posture (identity before pixels)

| Decision                   | Rule                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| Primary object             | **Application** — a person in a job — not abstract “modules”                                     |
| Primary surfaces           | **Shell** → **People / applications list** → **Pipeline** → **Candidate focus**                  |
| Secondary                  | Inbox, Jobs, Calendar                                                                            |
| Tertiary (not primary nav) | Career Page, Templates, Documents, Talent Pool, People (team), Reports, Integrations, Developers |
| Home is                    | A **human work table** (greeting + filters + soft rows) — **not** a 6-card widget bento          |
| Candidate focus is         | Decision rail + resume/context — **not** 8 equal tabs                                            |
| AI is                      | Optional guidance inside flows — **not** a permanent noisy FAB identity                          |
| Coming soon                | Never in primary chrome (topbar / sidebar). Hide or bury until real                              |

### Sacred screens (redesign order)

1. **App shell** (icon rail + quiet top bar + workspace pill)
2. **Home / applications list** (the Jessica table)
3. **Candidate focus panel** (contextual primary action by stage)
4. **Pipeline board** (same density language as the list)
5. Everything else inherits — do not redesign Settings or Career first

---

## Tokens — Colors

| Name              | Value     | Token                       | Role                                                                                                                        |
| ----------------- | --------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Warm Paper        | `#f5f5f4` | `--color-warm-paper`        | Primary app canvas, page background, flat sidebar plane — the soft stage everything sits on                                 |
| Pure Snow         | `#ffffff` | `--color-pure-snow`         | Raised surfaces, outer shell, popovers, selected-row base, input fills when elevated                                        |
| Soft Kraft        | `#efefed` | `--color-soft-kraft`        | Muted fills, filter chips at rest, secondary buttons, zebra-adjacent washes                                                 |
| Row Wash          | `#f0f0ee` | `--color-row-wash`          | Hover and selected table rows — the signature soft highlight from the north-star mock                                       |
| Near Ink          | `#171717` | `--color-near-ink`          | Primary text, primary solid actions, strong icons on light surfaces                                                         |
| Soft Ink          | `#6a6a67` | `--color-soft-ink`          | Secondary body, captions, column headers, quiet meta — ≥4.5:1 on paper                                                      |
| Quiet Mist        | `#9a9a96` | `--color-quiet-mist`        | Placeholder text, disabled labels, tertiary meta                                                                            |
| Hairline          | `#ececea` | `--color-hairline`          | Borders that almost disappear — structural only, never decorative frames                                                    |
| Mist Border       | `#e4e4e1` | `--color-mist-border`       | Slightly stronger dividers on pure white (tables, input rings at rest)                                                      |
| Chartreuse Signal | `#c8f560` | `--color-chartreuse-signal` | **Rationed** accent: brand dots, Tech/category chips, active marks, unread, AI-live indicators, rare primary marketing CTAs |
| Chartreuse Ink    | `#2a330d` | `--color-chartreuse-ink`    | Text/icons on chartreuse fills                                                                                              |
| Sage Wash         | `#eaf6c8` | `--color-sage-wash`         | Soft selected/active tint behind nav items or chips — never a full-page wash                                                |
| Sage Ink          | `#44520f` | `--color-sage-ink`          | Text on sage wash                                                                                                           |
| Ink Action        | `#171717` | `--color-ink-action`        | Default filled button / decisive admin action (not olive, not green mass)                                                   |
| Status Quiet      | `#e8eef2` | `--color-status-quiet`      | Neutral status pill background (e.g. Pending)                                                                               |
| Status Quiet Ink  | `#5b6b76` | `--color-status-quiet-ink`  | Text inside quiet status pills                                                                                              |
| Tag Solid         | `#171717` | `--color-tag-solid`         | High-weight category tags (e.g. Product) — black pill, white text                                                           |
| Warning Clay      | `#b45309` | `--color-warning-clay`      | Warning only                                                                                                                |
| Danger Rust       | `#d6453a` | `--color-danger-rust`       | Destructive only (reject, delete)                                                                                           |
| Success Olive     | `#4d7c0f` | `--color-success-olive`     | Success / hired confirmation — not the brand accent                                                                         |

### Accent rationing (non-negotiable)

Chartreuse is a **live signal**, not a theme color:

- **Yes:** category chip `Tech`, brand mark, selected control, unread badge, sparse marketing CTA
- **No:** page backgrounds, large primary button fields across the admin app, decorative blobs, every active state in the product

Default admin primary action = **Near Ink** fill + white label.
Chartreuse primary = marketing / rare high-delight moments only.

---

## Tokens — Typography

### Inter — Body and UI text — workhorse for paragraphs, buttons, nav labels, table cells, forms. Geometric neo-grotesque; neutral enough for a tool, tight enough to feel modern. · `--font-inter`

- **Substitute:** Geist Sans, system UI sans
- **Weights:** 400, 500, 600
- **Sizes:** 12px, 13px, 14px, 15px, 16px, 18px, 20px
- **Line height:** 1.35–1.50
- **Letter spacing:** -0.01em at 15–16px body; default at small UI
- **Role:** All product UI text. Prefer 510–600 only for titles and emphasis — body stays 400/500.

### Inter Display — Greetings, page titles, empty-state headlines. Same family, tighter tracking, semibold. · `--font-inter-display`

- **Substitute:** Inter with `font-display` utility (tracking-tight + semibold)
- **Weights:** 600, 650
- **Sizes:** 22px, 24px, 28px, 32px
- **Line height:** 1.15–1.25
- **Letter spacing:** -0.02em to -0.03em
- **Role:** “Good morning, Jessica!”-class greetings and rare marketing headings. **Not** every section H2.

### Type Scale (product UI)

| Role     | Size | Weight  | Line Height | Letter Spacing | Token             |
| -------- | ---- | ------- | ----------- | -------------- | ----------------- |
| micro    | 11px | 500     | 1.3         | 0.04em         | `--text-micro`    |
| caption  | 12px | 500     | 1.35        | 0.02em         | `--text-caption`  |
| body-sm  | 13px | 400     | 1.45        | —              | `--text-body-sm`  |
| body     | 14px | 400     | 1.45        | -0.01em        | `--text-body`     |
| body-ui  | 15px | 400–500 | 1.4         | -0.01em        | `--text-body-ui`  |
| label    | 13px | 500     | 1.3         | —              | `--text-label`    |
| title-sm | 16px | 600     | 1.3         | -0.01em        | `--text-title-sm` |
| title    | 20px | 600     | 1.25        | -0.02em        | `--text-title`    |
| greeting | 24px | 600     | 1.2         | -0.03em        | `--text-greeting` |
| display  | 32px | 600     | 1.15        | -0.03em        | `--text-display`  |

**Column headers (tables):** caption/micro, medium weight, soft ink, slight tracking — quiet structure, never shouty uppercase walls.

**Eyebrows:** rare. Max sparingly in marketing. Product UI prefers plain titles without `01 / SECTION` agency labels.

---

## Tokens — Spacing & Shapes

**Base unit:** 8px
**Density:** comfortable (Remote-soft, not Linear-cockpit, not enterprise-cramped)

### Spacing Scale

| Name | Value | Token          |
| ---- | ----- | -------------- |
| 4    | 4px   | `--spacing-4`  |
| 8    | 8px   | `--spacing-8`  |
| 12   | 12px  | `--spacing-12` |
| 16   | 16px  | `--spacing-16` |
| 20   | 20px  | `--spacing-20` |
| 24   | 24px  | `--spacing-24` |
| 32   | 32px  | `--spacing-32` |
| 40   | 40px  | `--spacing-40` |
| 48   | 48px  | `--spacing-48` |
| 64   | 64px  | `--spacing-64` |

### Border Radius

| Element                              | Value     | Token             |
| ------------------------------------ | --------- | ----------------- |
| small controls (checkbox, tiny chip) | 8px       | `--radius-sm`     |
| inputs, small buttons, menus         | 12px      | `--radius-md`     |
| cards, panels, table shell           | 16px–20px | `--radius-lg`     |
| selected rows / soft blocks          | 14px–16px | `--radius-row`    |
| pills (status, filters, primary CTA) | 9999px    | `--radius-pill`   |
| app outer shell / large frame        | 24px–28px | `--radius-shell`  |
| avatars                              | 9999px    | `--radius-avatar` |

**Shape doctrine:** Pills for **chips + primary CTAs + filters**. Rows and panels are **soft rectangles**, not mega-pills. Do not make every container `rounded-full`.

### Shadows

| Name  | Value                               | Token            | Role                                   |
| ----- | ----------------------------------- | ---------------- | -------------------------------------- |
| none  | `none`                              | —                | Default for flat paper UI              |
| soft  | `0 1px 2px rgba(23, 23, 23, 0.04)`  | `--shadow-soft`  | Barely-there lift on pure white panels |
| float | `0 8px 30px rgba(23, 23, 23, 0.06)` | `--shadow-float` | Popovers, command menu, dialogs only   |

Depth = **row wash + paper contrast**, not drop shadows on every card.

### Layout (app)

- **App shell:** full viewport; content in soft white frame on paper (optional outer radius on desktop)
- **Icon rail width:** 56–64px collapsed default
- **Top bar height:** 56px
- **Content horizontal padding:** 24–32px
- **Table row height:** 56–64px (human, tappable, Remote-like)
- **Max reading width for settings copy:** 640px
- **Dashboard content:** fluid; prefer one hero table over multi-column widget soup

---

## Components

### App Outer Shell

**Role:** The product frame from the north-star mock

Large rounded white/ light container on warm paper (or edge-to-edge paper with inner white stage). No heavy browser chrome toys. Feels like a single calm window, not a pile of cards.

### Icon Rail Sidebar

**Role:** Primary navigation

Vertical strip of **≤5 primary icons** (Home/Inbox, Pipeline, Jobs, plus overflow/More). Collapsed by default. Active state: soft kraft/sage wash behind icon — not a loud green brick. Labels on expand only. **No 12-item labeled warehouse.**

Primary set (target):

1. Home
2. Inbox
3. Pipeline
4. Jobs
5. More → (Candidates directory, Tasks, Calendar, Reports, Settings…)

### Top Bar (Quiet Chrome)

**Role:** Global context without noise

- Left: optional mobile trigger only
- Center: **workspace pill** (`Remote / All ▾`) — soft border, tiny brand chartreuse dot
- Right: compact cluster — compose/new (chartreuse icon button), avatar, search, notifications, menu
- **No** “Coming soon” activity stubs
- **No** competing page title + breadcrumb circus; page title lives in content

### Morning Greeting Header

**Role:** Home identity moment

Avatar + `Good morning, {FirstName}!` in greeting scale (24px semibold tight). Subline optional and **short** — operational, not cheerleader (“3 candidates need review”), never “Let’s go! 👋” as brand voice.

### Filter Chip Row

**Role:** Lightweight list controls under greeting

Pill chips: `Team All ▾`, `Status Pending ▾`, job/stage filters. Resting fill soft kraft; open/active may use sage wash or ink text. Height ~32–36px.

### Human Data Table

**Role:** Hero surface of Harly (applications / people work)

- Quiet uppercase-ish or small column headers in soft ink
- Rows 56–64px with avatar, name (near ink, medium), role/title, status pill, meta, team stack, `…` menu
- **Selected rows:** row wash background + rounded row block (as mock) — not thick borders
- Checkboxes soft, circular or rounded-sm consistent with system
- Bulk selection implies a quiet bulk bar (Advance / Email / Reject) — not a floating toolbox of 15 actions

### Status Pill

**Role:** State without drama

Fully pill. Quiet mist/blue-gray fill for neutral (`Pending`). Semantic colors only for hired/rejected when needed. 12px medium text. Never chartreuse for every status.

### Category Chip

**Role:** Sparse taxonomy (department, track)

- **Solid ink** chip for heavy tags (`Product`)
- **Chartreuse** chip for signal tags (`Tech`) — rationed
- 11–12px medium, pill, no icons required

### Team Avatar Stack

**Role:** Hiring team / collaborators

Overlapping circular avatars (24px), soft ring of pure snow, initials fallback on soft kraft or muted pastel. Max 3 + count.

### Primary Button (Ink Pill)

**Role:** Default decisive action in admin

Pill radius. Background near ink. Text pure snow. 14–15px medium. Padding ~10px 18px. Hover slightly lifts to softer black. **This is the workhorse CTA inside the product.**

### Signal Button (Chartreuse Pill)

**Role:** Rare high-signal action (New, Try, marketing, brand moments)

Pill. Background chartreuse signal. Text chartreuse ink. Same padding as primary. Do not use on every form submit.

### Secondary / Ghost Button

**Role:** Cancel, secondary

Pill or soft-rect 12px radius. Transparent or soft kraft. Border hairline/mist. Text near ink.

### Destructive Button

**Role:** Reject / delete

Rust fill or ghost-rust. Never chartreuse. Confirm in dialog for irreversible trash.

### Row Action Menu (`…`)

**Role:** Per-entity overflow

Quiet icon button; menu with 12px radius and soft shadow float. Keep global toolbars thin by pushing rare actions here.

### Candidate Focus (target pattern)

**Role:** Decide on a person

Two-zone layout:

- **Main:** resume / profile / timeline
- **Rail:** stage, primary action (Advance / Schedule / Offer), reject secondary, activity compact

Maximum **3** process sections or tabs (Overview / Process / Files). No 8-tab dump. Primary action **changes with stage**.

### Empty State

**Role:** Teach the next job-to-be-done

Soft dashed or wash panel, one illustration-or-icon in sage/chartreuse wash square (16–20 radius), title, one sentence, one ink or signal CTA. Copy is operational (“Publish your first job”), not generic (“No items yet”).

### Command Menu

**Role:** Power user fast path

Float shadow, 16–20 radius, pure snow, kraft active row. Keyboard first. Preferred home for AI actions over a permanent FAB.

### Toast / Feedback

**Role:** Transient confirmation

Minimal, soft corners, ink text; success uses success olive sparingly.

---

## Do's and Don'ts

### Do

- Compare every UI PR to `public/images/figma-preview/dashboard-hero.png`
- Keep primary nav ≤5 visible destinations; bury the rest under More/Settings
- Use **row wash** for selection/hover instead of boxing every entity in a card
- Ration `#c8f560` to signals — chips, dots, rare CTAs, brand
- Default product CTAs to **near-ink pills**
- Prefer **one hero table** on Home over multi-widget dashboards
- Use real avatars and human row height (56–64px)
- One icon family project-wide (pick **Phosphor** _or_ **Lucide**, not both)
- Let hairlines be almost invisible; structure with space
- Write quiet operational copy; short greetings; no hype

### Don't

- Don't ship a labeled sidebar of 10–14 modules as the default IA
- Don't make Home a bento of six equal metric cards
- Don't use chartreuse as the global primary button color in admin
- Don't introduce olive/pine as a second “brand primary” competing with ink + lime
- Don't mix three icon libraries in one tree
- Don't put “Coming soon” in the top bar or primary nav
- Don't default Candidate to 8 equal tabs and a 12-button action bar
- Don't use heavy shadows, glassmorphism stacks, or AI-purple gradients
- Don't use pure `#000000` large fields or pure neon decoration
- Don't add agency eyebrows (`01 / INDEX`), scroll cues, or fake version stamps in product UI
- Don't redesign Career/Portal aesthetics before Shell + Home + Candidate focus match this file

---

## Surfaces

| Level | Name              | Value     | Purpose                                       |
| ----- | ----------------- | --------- | --------------------------------------------- |
| 0     | Warm Paper        | `#f5f5f4` | App canvas, sidebar plane                     |
| 1     | Pure Snow         | `#ffffff` | Shell, panels, popovers, elevated table stage |
| 2     | Soft Kraft        | `#efefed` | Chips at rest, secondary fills                |
| 3     | Row Wash          | `#f0f0ee` | Hover/selected human rows                     |
| 4     | Sage Wash         | `#eaf6c8` | Soft active tint (nav, subtle highlight)      |
| 5     | Chartreuse Signal | `#c8f560` | Live signal only                              |

## Elevation

- **Default controls & rows:** none — luminance + wash
- **Popover / dialog / command:** `--shadow-float`
- **Optional white stage on paper:** `--shadow-soft` at most

## Imagery

- **People first:** photographic avatars, soft neutral fallbacks (no hard comic illustrations in core tool)
- **Brand:** Harly wordmark/mark; chartreuse only as a small pulse in logo lockups when needed
- **Product marketing** may use soft 3D or clean UI frames; **admin app** should not rely on isometric hero art
- **No** stock-photo wallpaper backgrounds inside the tool
- Career pages are workspace-branded (customer brand), not Harly chartreuse-forced

## Layout

Full-viewport light app. Icon rail left. Quiet top bar with **centered workspace pill**. Main stage is breathable paper/snow with **one dominant work surface** (table or pipeline). Filters sit under a human greeting. Selection is multi-row soft wash. Right-side detail (candidate) should slide as a calm panel, not a modal storm. Settings use simple stacked sections — still paper/snow, still ink CTAs — never a different visual universe.

Portal may use a calmer candidate-facing variant, but must share: radius scale, type, accent rationing, human density. Do not invent a second brand.

---

## Agent Prompt Guide

**Quick Color Reference**

- canvas: `#f5f5f4`
- surface: `#ffffff`
- text: `#171717`
- muted text: `#6a6a67`
- border: `#ececea`
- row selected: `#f0f0ee`
- signal: `#c8f560` (rare)
- text on signal: `#2a330d`
- default CTA fill: `#171717` / text `#ffffff`
- danger: `#d6453a`

**Hard bans for agents**

1. No new primary nav items without updating this file
2. No Coming soon in chrome
3. No widget-bento Home
4. No second accent color family (purple/blue brand)
5. One surface per task — Shell, then List, then Candidate

**Example Component Prompts**

1. **Icon rail:** 56px wide, paper background, 5 icons max, active item soft kraft/sage rounded-12 wash, no text labels when collapsed.

2. **Workspace pill (top center):** height 32px, pure snow, hairline border, 14px radius or pill, left chartreuse 8px dot, text “{Workspace} / All ▾” in 13–14px soft/near ink.

3. **Greeting block:** 32px circular avatar + “Good morning, Jessica!” at 24px semibold tracking-tight near ink. Optional one-line soft-ink subtitle ≤12 words.

4. **Human table row:** 60px tall, 16px horizontal padding, avatar 36px, name 14–15px medium, role body, status quiet pill, team stack, `…`. Selected: full-row `#f0f0ee` at 14–16 radius.

5. **Filter chips:** pill, soft kraft bg, 13px medium, chevron; no heavy border.

6. **Primary admin button:** pill, `#171717` bg, white label 14px medium, padding 10×18.

7. **Signal chip Tech:** pill, `#c8f560` bg, `#2a330d` text, 11–12px medium.

8. **Candidate focus:** left 1fr profile/resume; right 320–360px decision rail with **one** primary stage action + overflow menu. Max three sections.

---

## Dark / Light Rhythm

Harly admin is **light-first**. Rhythm is paper → snow → row wash, not dark/light marketing bands.

- Optional **marketing site** may use stronger contrast sections later; not required for product identity.
- **Dark mode:** defer until light identity is faithful. If implemented, map paper→deep charcoal, snow→elevated charcoal, keep chartreuse signal, never invert randomly per section.
- **Portal:** may use a deeper sidebar for candidate calm, but content stage stays light and human.

---

## Similar Brands (calibration, not clones)

- **Remote (product + Modula template)** — soft paper, human tables, lime signal chips, quiet chrome, generous rows — **primary north star**
- **Linear** — ruthless IA restraint, keyboard speed, chrome minimalism (steal discipline, not pure dark cockpit)
- **Ashby** — hiring-native density and candidate decisioning (steal workflow clarity, not visual noise)
- **Mercado / modern HR soft UIs** — avatar-first lists, pill filters, friendly but serious

**Not similar:** generic shadcn dashboard demos, purple AI SaaS landings, Greenhouse-heavy enterprise chrome.

---

## Voice & microcopy

| Do                         | Don't                                      |
| -------------------------- | ------------------------------------------ |
| “3 candidates need review” | “Let’s go! 👋 Your hiring journey awaits”  |
| “Publish your first job”   | “No data yet”                              |
| “Advance to Interview”     | “Submit” on stage changes                  |
| “Reject” (clear, grave)    | Soften irreversible actions into cute copy |

Language: clear, calm, adult. English product UI default; same tone in ES if localized.

---

## Accessibility

- Text on paper/snow ≥ **4.5:1** (soft ink already tuned)
- Chartreuse chips: always use **chartreuse ink** text, never white on lime
- Icon-only controls require `aria-label`
- Focus rings: near ink or sage, 2–3px visible — never remove focus
- Don't rely on lime alone for state — pair with text/icon

---

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-warm-paper: #f5f5f4;
  --color-pure-snow: #ffffff;
  --color-soft-kraft: #efefed;
  --color-row-wash: #f0f0ee;
  --color-near-ink: #171717;
  --color-soft-ink: #6a6a67;
  --color-quiet-mist: #9a9a96;
  --color-hairline: #ececea;
  --color-mist-border: #e4e4e1;
  --color-chartreuse-signal: #c8f560;
  --color-chartreuse-ink: #2a330d;
  --color-sage-wash: #eaf6c8;
  --color-sage-ink: #44520f;
  --color-ink-action: #171717;
  --color-status-quiet: #e8eef2;
  --color-status-quiet-ink: #5b6b76;
  --color-tag-solid: #171717;
  --color-warning-clay: #b45309;
  --color-danger-rust: #d6453a;
  --color-success-olive: #4d7c0f;

  /* Typography */
  --font-inter:
    "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    sans-serif;
  --font-inter-display: "Inter", ui-sans-serif, system-ui, sans-serif;

  --text-micro: 11px;
  --text-caption: 12px;
  --text-body-sm: 13px;
  --text-body: 14px;
  --text-body-ui: 15px;
  --text-label: 13px;
  --text-title-sm: 16px;
  --text-title: 20px;
  --text-greeting: 24px;
  --text-display: 32px;

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* Spacing */
  --spacing-unit: 8px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;

  /* Layout */
  --rail-width: 56px;
  --topbar-height: 56px;
  --row-height: 60px;
  --content-padding-x: 28px;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-row: 14px;
  --radius-pill: 9999px;
  --radius-shell: 24px;
  --radius-avatar: 9999px;

  /* Shadows */
  --shadow-soft: 0 1px 2px rgba(23, 23, 23, 0.04);
  --shadow-float: 0 8px 30px rgba(23, 23, 23, 0.06);

  /* Surfaces */
  --surface-paper: var(--color-warm-paper);
  --surface-snow: var(--color-pure-snow);
  --surface-kraft: var(--color-soft-kraft);
  --surface-row-wash: var(--color-row-wash);
  --surface-sage: var(--color-sage-wash);
  --surface-signal: var(--color-chartreuse-signal);
}
```

### Tailwind v4 (`@theme` sketch)

```css
@theme {
  --color-warm-paper: #f5f5f4;
  --color-pure-snow: #ffffff;
  --color-soft-kraft: #efefed;
  --color-row-wash: #f0f0ee;
  --color-near-ink: #171717;
  --color-soft-ink: #6a6a67;
  --color-quiet-mist: #9a9a96;
  --color-hairline: #ececea;
  --color-mist-border: #e4e4e1;
  --color-chartreuse-signal: #c8f560;
  --color-chartreuse-ink: #2a330d;
  --color-sage-wash: #eaf6c8;
  --color-sage-ink: #44520f;
  --color-ink-action: #171717;
  --color-status-quiet: #e8eef2;
  --color-status-quiet-ink: #5b6b76;
  --color-danger-rust: #d6453a;
  --color-success-olive: #4d7c0f;

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-row: 14px;
  --radius-pill: 9999px;
  --radius-shell: 24px;

  --shadow-soft: 0 1px 2px rgba(23, 23, 23, 0.04);
  --shadow-float: 0 8px 30px rgba(23, 23, 23, 0.06);
}
```

### Bridge note (current codebase)

Today’s `globals.css` still maps `--primary` to olive/pine and keeps legacy names (`pine`, `sage`, `lime`).
**Target mapping for the redesign:**

| Legacy              | Becomes                   |
| ------------------- | ------------------------- |
| `--paper`           | Warm Paper                |
| `--paper-raised`    | Pure Snow                 |
| `--kraft`           | Soft Kraft                |
| `--ink`             | Near Ink                  |
| `--ink-soft`        | Soft Ink                  |
| `--lime`            | Chartreuse Signal         |
| `--sage`            | Sage Wash                 |
| `--primary` (admin) | **Ink Action** (not pine) |
| pine-as-brand       | **retired** as primary    |

Implement in a dedicated tokens PR after Shell/Home visually lock — do not half-migrate mid-feature.

---

## Pass / Fail checklist (PR gate)

A UI change **fails** review if any box is true:

- [ ] Adds a top-level nav item without DESIGN.md update
- [ ] Home gains another equal-weight dashboard card instead of strengthening the human list
- [ ] Uses chartreuse on a non-signal decorative block
- [ ] Introduces a second icon library
- [ ] Ships Coming soon in sidebar/topbar
- [ ] Candidate surface adds tabs beyond the three-section cap without explicit exception
- [ ] Visually diverges from `dashboard-hero.png` on shell/list density without written reason

A UI change **passes** when:

- [ ] It could sit inside the north-star mock without looking like another product
- [ ] Accent appears only as signal
- [ ] Chrome is quieter than content
- [ ] People (avatars, names, rows) are the first thing the eye hits

---

## Redesign execution order

| Phase | Scope                                      | Done means                           |
| ----- | ------------------------------------------ | ------------------------------------ |
| 0     | This file + freeze feature UI sprawl       | Agents cited DESIGN.md               |
| 1     | Tokens bridge + button/chip/row primitives | Story-level match to mock chips/rows |
| 2     | App shell (rail + top bar)                 | ≤5 primaries; workspace pill center  |
| 3     | Home = human applications table            | Greeting + filters + soft selection  |
| 4     | Candidate focus                            | Decision rail; ≤3 sections           |
| 5     | Pipeline                                   | Same density language                |
| 6     | Cascade (Inbox, Jobs, Settings skin)       | Inheritance, not reinterpretation    |

---

_Last updated: 2026-07-25 · Source of truth for Harly visual + product UI identity._
