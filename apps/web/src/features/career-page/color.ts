/**
 * Pure colour helpers for deriving a small, WCAG-checked palette from a single
 * accent hex. Used by templates that tint surfaces (tab underlines, badges,
 * tinted tiles) from the workspace accent instead of a flat white card. No
 * dependencies , sRGB channel maths only.
 */

/**
 * Expand `#abc` to `#aabbcc` and lowercase. Anything that is not a valid 3 or 6
 * digit hex falls back to `fallback`, so string-concatenated alpha bytes
 * (`${hex}E6`) can never produce invalid CSS from a 3-digit accent.
 */
export function normalizeHex(hex: string | null | undefined, fallback = "#18181b"): string {
  const s = (hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return "#" + s.split("").map((c) => c + c).join("").toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return "#" + s.toLowerCase();
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const full = normalizeHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** `rgba()` string for any 3/6 digit hex, alpha 0 to 1. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

function toHex(rgb: number[]): string {
  return (
    "#" +
    rgb
      .map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Linear interpolation between a hex colour and an RGB target, factor 0–1. */
function mix(hex: string, target: [number, number, number], t: number): string {
  const rgb = hexToRgb(hex);
  return toHex(rgb.map((c, i) => c * (1 - t) + target[i] * t));
}

/** Lighten toward white. t=0 → unchanged, t=1 → white. */
export function tint(hex: string, t: number): string {
  return mix(hex, [255, 255, 255], t);
}

/** Darken toward black. t=0 → unchanged, t=1 → black. */
export function shade(hex: string, t: number): string {
  return mix(hex, [0, 0, 0], t);
}

/** WCAG relative luminance of a hex colour (0–1). */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const INK_DARK = "#171717";

/**
 * Best foreground ink for text sitting on `bg`. Picks near-black or white,
 * whichever has the higher WCAG contrast, and falls back to pure black when
 * neither clears 4.5:1 (mid-tones such as #7a7a7a), so the result always passes
 * AA for normal text. Use this for anything printed on the accent fill.
 */
export function readableInk(bg: string): string {
  const base = normalizeHex(bg);
  const dark = contrastRatio(INK_DARK, base);
  const light = contrastRatio("#ffffff", base);
  const best = dark >= light ? INK_DARK : "#ffffff";
  if (Math.max(dark, light) >= 4.5) return best;
  return contrastRatio("#000000", base) >= light ? "#000000" : "#ffffff";
}

/**
 * Nudge `color` toward black (light surface) or white (dark surface) until it
 * reaches `min` contrast on `surface`. Returns the colour unchanged when it
 * already passes. This is the "accent used as text/icon/underline" colour: the
 * brand hue, only as dark (or light) as legibility requires.
 */
export function accentOnSurface(color: string, surface: string, min = 4.5): string {
  const c = normalizeHex(color);
  const bg = normalizeHex(surface, "#ffffff");
  if (contrastRatio(c, bg) >= min) return c;
  const towardBlack = luminance(bg) > 0.18;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const next = towardBlack ? shade(c, t) : tint(c, t);
    if (contrastRatio(next, bg) >= min) return next;
  }
  return towardBlack ? "#000000" : "#ffffff";
}

/**
 * The colour-blocking palette derived from one accent. `tintBg` is a soft wash
 * for a highlighted neutral tile; `ink` is a dark tone of the accent that clears
 * AA on `tintBg`; `onAccent` is the readable ink for text sitting directly on
 * the solid accent fill. Pass `dark: true` for dark canvases: the tile becomes a
 * deep wash of the accent and `ink` a light tone, both still AA.
 */
export function accentPalette(accent: string, opts: { dark?: boolean } = {}) {
  const a = normalizeHex(accent);
  const dark = opts.dark === true;
  const tintBg = dark ? shade(a, 0.72) : tint(a, 0.8);
  const ink = accentOnSurface(dark ? tint(a, 0.55) : shade(a, 0.55), tintBg);
  return {
    accent: a,
    tintBg,
    ink,
    onAccent: readableInk(a),
  };
}
