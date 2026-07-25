/**
 * Pure colour helpers for deriving a small, WCAG-checked palette from a single
 * accent hex. Used by templates that tint surfaces (tab underlines, badges,
 * tinted tiles) from the workspace accent instead of a flat white card. No
 * dependencies , sRGB channel maths only.
 */

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
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

/**
 * Best foreground ink (near-black or white) for small text on `bg`, whichever
 * yields the higher WCAG contrast. More reliable than a luminance threshold for
 * small text, which needs the real 4.5:1 ratio to hold.
 */
export function readableInk(bg: string): string {
  const dark = "#18181b";
  return contrastRatio(dark, bg) >= contrastRatio("#ffffff", bg) ? dark : "#ffffff";
}

/**
 * The colour-blocking palette derived from one accent. `tintBg` is a soft wash
 * for a highlighted neutral tile; `ink` is a dark tone of the accent that clears
 * AA on both `tintBg` and white; `onAccent` is the readable ink for text sitting
 * directly on the solid accent fill.
 */
export function accentPalette(accent: string) {
  return {
    accent,
    tintBg: tint(accent, 0.8),
    ink: shade(accent, 0.55),
    onAccent: readableInk(accent),
  };
}
