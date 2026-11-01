import type { CSSProperties } from "react";

import { accentOnSurface, accentPalette, normalizeHex, readableInk, withAlpha } from "./color";
import { isLightColor, MODE_BG, type CareerPageConfig } from "./config";

/** App-aligned dark canvas (DESIGN.md `--warm-paper` in dark). The stored
 *  default dark background is the legacy near-black, which we map to this. */
const DARK_CANVAS = "#161614";
const LEGACY_DARK_CANVAS = MODE_BG.dark.toLowerCase();

/**
 * The colour the page actually paints behind the content. Keeps mode and canvas
 * coherent (dark mode never paints a light canvas and vice versa) and maps the
 * legacy near-black default onto the app's dark canvas.
 */
export function resolveCanvas(config: CareerPageConfig): string {
  const { mode, background } = config.theme;
  const bg = normalizeHex(background || MODE_BG[mode], MODE_BG[mode]);
  if (mode === "dark") {
    if (isLightColor(bg)) return DARK_CANVAS;
    return bg === LEGACY_DARK_CANVAS ? DARK_CANVAS : bg;
  }
  return isLightColor(bg) ? bg : MODE_BG.light;
}

export type CareerTheme = {
  /** Raw brand accent, for fills (buttons, tiles). Never for small text. */
  accent: string;
  /** Readable ink for text sitting on the accent fill (always >= 4.5:1). */
  onAccent: string;
  /** The accent as text/icon/underline colour on the canvas (always >= 4.5:1). */
  accentText: string;
  /** Soft accent wash for highlighted tiles, and the ink that reads on it. */
  tintBg: string;
  tintInk: string;
  canvas: string;
  isDark: boolean;
  sharp: boolean;
  /** CSS custom properties to spread on the template root. */
  vars: CSSProperties;
};

/**
 * Single place where a career page turns "brand colour + theme settings" into
 * the handful of values every template and block needs, with contrast checked.
 */
export function careerTheme(config: CareerPageConfig, brandColor: string): CareerTheme {
  const accent = normalizeHex(config.theme.accent ?? brandColor, "#18181b");
  const canvas = resolveCanvas(config);
  const isDark = config.theme.mode === "dark";
  const sharp = config.theme.rounded === "sharp";
  const onAccent = readableInk(accent);
  const accentText = accentOnSurface(accent, canvas);
  const pal = accentPalette(accent, { dark: isDark });

  const vars = {
    "--career-accent": accentText,
    "--career-accent-solid": accent,
    "--career-on-accent": onAccent,
    "--career-tint": pal.tintBg,
    "--career-tint-ink": pal.ink,
    "--career-accent-wash": withAlpha(accent, isDark ? 0.18 : 0.1),
    "--career-canvas": canvas,
    "--career-r-card": sharp ? "0px" : "16px",
    "--career-r-inner": sharp ? "0px" : "12px",
    "--career-r-btn": sharp ? "0px" : "10px",
  } as CSSProperties;

  return {
    accent,
    onAccent,
    accentText,
    tintBg: pal.tintBg,
    tintInk: pal.ink,
    canvas,
    isDark,
    sharp,
    vars,
  };
}

/** Subhead-style plain text excerpt of rich HTML (no DOM, SSR-safe). */
export function htmlToExcerpt(html: string, max = 220): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|br)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 120 ? cut.lastIndexOf(" ") : max).trimEnd() + "…";
}

/** Stats worth rendering: has a value, and is not the builder's "Not set" seed. */
export function visibleStats<T extends { value: string }>(stats: T[]): T[] {
  return stats.filter((st) => {
    const v = (st.value ?? "").trim();
    return v !== "" && v.toLowerCase() !== "not set";
  });
}
