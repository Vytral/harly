import {
  careerTemplates,
  type CareerPageConfig,
  type CareerTemplate,
} from "@/features/career-page/config";

/**
 * Career-page looks a demo visitor can preview on the public landing page and
 * carry into their sandbox. Each is one of the four real career-page templates,
 * so what the visitor previews is exactly what the sandbox starts with. Client-
 * and server-safe: the landing picker and the sandbox seeder share this module.
 */
export type DemoStyle = CareerTemplate;

export const DEMO_DEFAULT_STYLE: DemoStyle = "playful";

export const DEMO_STYLES: ReadonlyArray<{
  key: DemoStyle;
  label: string;
  blurb: string;
  /** Theme tweaks layered over the demo brand so each look reads as itself. */
  theme: Partial<CareerPageConfig["theme"]>;
}> = [
  {
    key: "playful",
    label: "Playful",
    blurb: "Warm, rounded and full of personality.",
    theme: {},
  },
  {
    key: "minimal",
    label: "Minimal",
    blurb: "Quiet, typographic and fast to scan.",
    theme: { rounded: "sharp" },
  },
  {
    key: "ashby",
    label: "Editorial",
    blurb: "A confident, content-first company story.",
    theme: {},
  },
  {
    key: "join",
    label: "Profile",
    blurb: "A company profile with tabs and a jobs list.",
    theme: {},
  },
];

export function parseDemoStyle(value: unknown): DemoStyle {
  return typeof value === "string" &&
    (careerTemplates as readonly string[]).includes(value)
    ? (value as DemoStyle)
    : DEMO_DEFAULT_STYLE;
}

/** Re-skin a career-page config with one of the demo styles. Pure. */
export function applyDemoStyle(
  config: CareerPageConfig,
  style: DemoStyle,
): CareerPageConfig {
  const preset = DEMO_STYLES.find((entry) => entry.key === style);
  return {
    ...config,
    template: style,
    theme: { ...config.theme, ...(preset?.theme ?? {}) },
  };
}
