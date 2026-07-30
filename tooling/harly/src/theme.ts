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
