import process from "node:process";
import pc from "picocolors";

/** Harly's brand palette, from DESIGN.md: warm paper, near-black ink, and a
 * single chartreuse pulse reserved for what is live, selected, or decisive. */
const chartreuse = [200, 245, 96] as const;
const kraft = [168, 162, 158] as const;

const esc = "";
const truecolor =
  pc.isColorSupported &&
  ["truecolor", "24bit"].includes(process.env.COLORTERM ?? "");

function rgb([r, g, b]: readonly [number, number, number], text: string) {
  return `${esc}[38;2;${r};${g};${b}m${text}${esc}[39m`;
}

/** The chartreuse pulse. Degrades to ANSI green where 24-bit colour is absent,
 * and to plain text under NO_COLOR, which picocolors already honours. */
export function accent(text: string): string {
  if (!pc.isColorSupported) return text;
  return truecolor ? rgb(chartreuse, text) : pc.green(text);
}

export function soft(text: string): string {
  if (!pc.isColorSupported) return text;
  return truecolor ? rgb(kraft, text) : pc.gray(text);
}

export const ink = (text: string) => pc.bold(text);

export function accentBadge(text: string): string {
  if (!pc.isColorSupported) return text;
  if (!truecolor) return pc.bgGreen(pc.black(text));
  const [r, g, b] = chartreuse;
  return `${esc}[48;2;${r};${g};${b}m${esc}[38;2;23;23;23m${text}${esc}[0m`;
}

let brandShown = false;

/** Keep the CLI identity compact. The installer is often run in narrow SSH
 * sessions, where a large ASCII mark competes with the task instead of
 * supporting it. Later surfaces become quiet section labels. */
export function showBrand(context?: string, version = "") {
  const suffix = version ? ` ${soft(`· v${version}`)}` : "";
  if (brandShown) {
    if (context) process.stdout.write(`\n  ${ink(context)}${suffix}\n\n`);
    return;
  }
  brandShown = true;
  process.stdout.write(
    `\n  ${accent(ink("harly"))}  ${soft("Self-hosted ATS")}${suffix}\n\n`,
  );
}

/** Spinner frames tinted with the brand pulse. */
export const spinnerStyle = { styleFrame: accent };

/**
 * Glyphs are chosen for *width*, not for expressiveness. Every symbol here is
 * single-column in a terminal; emoji and most East Asian Wide characters are
 * two columns wide and would shear the aligned detail column on the operator's
 * machine while looking fine on ours. A CLI that runs over SSH on an unknown
 * font budget is not the place to gamble on glyph coverage.
 */
// Glyph coverage and colour support are independent questions. A terminal run
// under NO_COLOR, or a pipe into a log file, renders box-drawing characters
// perfectly well; only a font that lacks them cannot, and that is what
// HARLY_ASCII exists to declare.
const wide = process.env.HARLY_ASCII !== "1";

/** Status marks. These carry meaning, so they are never colour-only. */
export const mark = {
  ok: () => (wide ? accent("✓") : accent("OK")),
  warn: () => (wide ? pc.yellow("⚠") : pc.yellow("!!")),
  fail: () => (wide ? pc.red("✗") : pc.red("XX")),
};

/**
 * Domain glyphs. Purely decorative: they speed up scanning a list of checks,
 * and every row still reads correctly with them stripped. Kept deliberately
 * plain so the chartreuse accent stays the only thing that draws the eye —
 * DESIGN.md rations the pulse, and a row of coloured icons would compete.
 */
export const icon = {
  config: () => (wide ? "≡" : "-"),
  database: () => (wide ? "▤" : "-"),
  app: () => (wide ? "▣" : "-"),
  scheduler: () => (wide ? "↻" : "-"),
  proxy: () => (wide ? "⇄" : "-"),
  network: () => (wide ? "◍" : "-"),
  archive: () => (wide ? "▽" : "-"),
  image: () => (wide ? "▦" : "-"),
};

export type Row = {
  icon?: string;
  label: string;
  detail?: string;
  status?: "ok" | "warn" | "fail";
};

/**
 * Renders labelled rows with the detail column aligned.
 *
 * Alignment is computed on the *visible* width: `label` arrives already
 * coloured in some callers, and padding a string that contains ANSI escapes
 * pads the escape bytes too, which is what silently bends a column out of
 * true.
 */
export function rows(items: Row[]): string[] {
  const visible = (value: string) =>
    // eslint-disable-next-line no-control-regex
    value.replace(/\[[0-9;]*m/g, "").length;
  const width = Math.max(0, ...items.map((item) => visible(item.label)));
  return items.map((item) => {
    const status = item.status ? `${mark[item.status]()} ` : "";
    const glyph = item.icon ? `${soft(item.icon)} ` : "";
    const pad = " ".repeat(width - visible(item.label));
    const detail = item.detail ? `  ${pad}${soft(item.detail)}` : "";
    return `${status}${glyph}${item.label}${detail}`;
  });
}

/** A quiet section heading, for grouping rows inside one block. */
export function section(title: string): string {
  return soft(title.toUpperCase());
}

/**
 * Byte sizes for humans. A small-but-real file must never round to `0 MB`:
 * a fresh install's first backup is a few hundred kilobytes, and reporting it
 * as zero reads as a failed step.
 */
export function humanBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
