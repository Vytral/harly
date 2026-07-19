import { pixelBasedPreset, type TailwindConfig } from "@react-email/components";

// ---------------------------------------------------------------------------
// Tailwind theme for all Harly email templates.
//
// Mirrors the structure of the Resend "Matte" demo set
// (apps/demo/emails/02-Matte/theme.ts): a small Tailwind config wrapped on
// top of `pixelBasedPreset` (email clients don't support rem), with the
// palette mapped to the web app's "paper + evergreen" design language
// (apps/web/src/app/globals.css). Email clients can't read CSS variables, so
// every colour is an inlined literal hex here.
//
// We deliberately avoid the `plugin()` API (addUtilities / addVariant): it
// relies on Tailwind v3 internals that changed in v4, and react-email v2
// bundles Tailwind v4. Type-scale and the mobile padding override are
// therefore applied as explicit Tailwind values / shared style objects rather
// than generated utilities.
// ---------------------------------------------------------------------------

const colors = {
  // Surfaces
  canvas: "#f5f5f4", // warm off-white canvas (--paper)
  bg: "#ffffff", // pure white card (--paper-raised)
  "bg-2": "#efefed", // muted band surface (--kraft)
  // Ink
  fg: "#171717", // near-black headings (--ink)
  "fg-2": "#56564f", // mid grey body text (warmer, ≥4.5:1 on white)
  "fg-3": "#8a8a83", // footer / meta (≥4.5:1 on paper)
  "fg-inverted": "#fbfff9", // text on pine
  stroke: "#ececea", // hairline border (--hairline)
  // Evergreen accent
  brand: "#3f6212", // pine (--pine)
  "brand-strong": "#365314", // pressed/hover (--pine-strong)
  sage: "#eaf6c8", // lime wash (--sage)
  "sage-ink": "#44520f", // text on lime wash (--sage-ink)
  rust: "#d6453a", // destructive / withdrawal (--rust)
  clay: "#b45309", // warning (--clay)
} as const;

export const harlyTailwindConfig: TailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors,
      // Diffuse "collage-card" style elevation, tinted toward the evergreen
      // accent so the card lifts off the paper canvas with brand warmth
      // rather than a flat grey cloud. Clients without box-shadow support
      // (Outlook Windows) degrade to a flat white card — acceptable.
      boxShadow: {
        "harly-card":
          "0px 76px 21px 0px rgba(63,98,18,0), 0px 49px 19px 0px rgba(63,98,18,0.01), 0px 27px 16px 0px rgba(63,98,18,0.05), 0px 12px 12px 0px rgba(63,98,18,0.09), 0px 3px 7px 0px rgba(17,17,17,0.10)",
      },
      fontFamily: {
        sans: ['Inter', "Arial", "Helvetica Neue", "sans-serif"],
        inter: ['Inter', "Arial", "sans-serif"],
      },
      // Display + body scale, in px (pixelBasedPreset already neutralises rem).
      // Matte uses a 48px display; our cards are narrower (560px) so we cap
      // the hero at 32px to keep it legible without wrapping awkwardly.
      // Applied via arbitrary Tailwind values (text-[32px] leading-[1.2]
      // tracking-[-0.6px]) in templates — Tailwind v4 doesn't expose named
      // font-NN utilities from theme.extend.fontSize keys, so defining them
      // here would produce dead classes.
      maxWidth: {
        card: "560px",
      },
    },
  },
};
