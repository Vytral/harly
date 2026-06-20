import { Palette } from "lucide-react";

import { cn } from "@/lib/utils";
import { isLightColor, MODE_BG } from "@/features/career-page/config";

import type { SectionProps } from "../types";
import { Section, Field, ColorField } from "../primitives";

export function ThemeSection({ config, update, workspace }: SectionProps) {
  return (
    <Section title="Theme" icon={Palette}>
      <Field label="Mode">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              update((d) => {
                d.theme.mode = "light";
                if (!isLightColor(d.theme.background)) {
                  d.theme.background = MODE_BG.light;
                }
              })
            }
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150 ease-out",
              config.theme.mode === "light"
                ? "border-pine bg-sage/40 text-sage-ink"
                : "text-muted-foreground hover:border-zinc-300",
            )}
          >
            Light
          </button>
          <button
            type="button"
            onClick={() =>
              update((d) => {
                d.theme.mode = "dark";
                if (isLightColor(d.theme.background)) {
                  d.theme.background = MODE_BG.dark;
                }
              })
            }
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150 ease-out",
              config.theme.mode === "dark"
                ? "border-pine bg-sage/40 text-sage-ink"
                : "text-muted-foreground hover:border-zinc-300",
            )}
          >
            Dark
          </button>
        </div>
      </Field>
      <ColorField
        label="Background color"
        value={config.theme.background}
        fallback="#ffffff"
        onChange={(c) => update((d) => (d.theme.background = c ?? "#ffffff"))}
      />
      <Field label="Font">
        <select
          value={config.theme.font}
          onChange={(e) =>
            update(
              (d) => (d.theme.font = e.target.value as "sans" | "serif" | "display" | "mono"),
            )
          }
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm transition-colors duration-150 ease hover:border-zinc-300 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/20"
        >
          <option value="sans">Sans-serif</option>
          <option value="serif">Serif</option>
          <option value="display">Display</option>
          <option value="mono">Monospace</option>
        </select>
      </Field>
      <ColorField
        label="Accent color"
        value={config.theme.accent}
        fallback={workspace.primaryColor}
        onChange={(c) => update((d) => (d.theme.accent = c))}
      />
    </Section>
  );
}
