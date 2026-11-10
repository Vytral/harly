# Harly design reference

A light reference, not a rulebook. We are experimenting toward a calmer, more
professional HR/ATS product, using Deel's product language as the benchmark
(screens in `design/inspiration/deel/`, local only). When this file and
`apps/web/src/app/globals.css` disagree, the CSS wins. The previous, stricter
doctrine lives in git history (`docs/DESIGN.legacy.md`, removed).

## Feel

Organised, quiet, confident — an HR operations desk, not a dev tool. Lots of
air, white cards floating on a warm gray canvas, one lime accent that marks
"where you are" and "what is live". Ink black is the action color.

## Color

| Token | Light | Role |
| --- | --- | --- |
| `--warm-paper` | `#f5f5f4` | App canvas |
| `--pure-snow` | `#ffffff` | Cards, popovers, modals |
| `--card-inset` | `#f6f6f4` | Rows, fields, stat tiles inside a card |
| `--row-wash` | `#f0f0ee` | Hover / selected rows |
| `--near-ink` | `#171717` | Text and primary buttons |
| `--soft-ink` | `#6a6a67` | Secondary text, labels |
| `--quiet-mist` | `#9a9a96` | Placeholder, empty values |
| `--hairline` | `#ececea` | Borders that almost disappear |
| `--chartreuse-signal` | `#b8f04a` | Lime accent: active nav, progress, live/AI signals |
| `--lime-wash` | `#f1fbdd` | Header glow, selected tint, progress track |

Semantics: success olive, warning clay, danger rust, info slate. One accent
only; status color always carries a dot so it never relies on hue alone.

## Type

Instrument Sans (self-hosted variable, 400–700). Display = 600 with tight
tracking (`.font-display`). Body 14px, labels 12.5–13px, card titles 15px
semibold, page titles 26–28px display. Numbers are `tabular-nums`.

## Shape and depth

- Cards `--radius-card` 16px, no border, `--shadow-card` (1px whisper ring).
- Inner rows / tiles `--radius-inner` 12px on `--card-inset`.
- Buttons `--radius-btn` 10px. Pills (`rounded-full`) are for nav tabs,
  filters and status chips only.
- Popovers and modals may use `--shadow-float`. Nothing else gets a shadow.

## Layout language (from Deel)

- **Header:** a lime-washed band. Workspace switcher left, pill tabs center
  (icon + label, active pill is white), round icon buttons right (search ⌘K,
  settings, help, notifications, avatar). Secondary sub-nav row of icon +
  label links under the active section. "More" opens a grid menu.
- **Page:** big display title left, actions right (ink primary + outline).
  Filters as pill chips on a white bar above tables.
- **Card:** icon in a 32px bordered square + semibold title, soft gray
  "View all" button on the right, content as inset rows.
- **Detail pages:** two columns — inset info rows on the left, navigable
  rows (icon, title, hint, chevron) on the right.
- **Modals:** centered white, 16px radius, centered title with ✕, optional
  back arrow and spot illustration; tinted callouts; ink primary, gray
  secondary; destructive is rust. Success = illustration + one ink button.
- **Toasts:** dark pill, bottom center.

## Motion

Durations 100/150/220/350ms, ease-out `cubic-bezier(0.16,1,0.3,1)`.
Motion explains change (open/close, reorder, appear); nothing loops for
decoration; `prefers-reduced-motion` collapses it.
