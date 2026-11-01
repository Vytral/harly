"use client";

import {
  isLightColor,
  MODE_BG,
  type ColorMode,
  type FontFamily,
} from "@/features/career-page/config";

import type { SectionProps } from "../types";
import { ContrastNotice } from "../ContrastNotice";
import { ColorField } from "../primitives";
import { Group, PanelHeader, Segmented } from "./PanelKit";

export function DesignPanel({ config, update, workspace }: SectionProps) {
  const accent = config.theme.accent ?? workspace.primaryColor;
  const fonts: { value: FontFamily; label: string }[] = [
    { value: "sans", label: "Sans" },
    { value: "serif", label: "Serif" },
    { value: "mono", label: "Mono" },
  ];
  // "Display" currently resolves to the same face as Sans; only offer it to
  // pages that already use it so the choice stays visible.
  if (config.theme.font === "display") fonts.splice(1, 0, { value: "display", label: "Display" });

  return (
    <div className="space-y-4">
      <PanelHeader title="Style" subtitle="Colours and type for the whole page." />

      <Group title="Colour" description="Mode, canvas and brand accent" defaultOpen errorPrefix="theme.">
        <Segmented
          label="Mode"
          value={config.theme.mode}
          onChange={(mode: ColorMode) =>
            update((d) => {
              d.theme.mode = mode;
              // Keep canvas and mode coherent: no light text on a light canvas.
              if (mode === "light" && !isLightColor(d.theme.background)) d.theme.background = MODE_BG.light;
              if (mode === "dark" && isLightColor(d.theme.background)) d.theme.background = MODE_BG.dark;
            })
          }
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <ColorField
          label="Background"
          path="theme.background"
          value={config.theme.background}
          fallback={MODE_BG[config.theme.mode]}
          nullable={false}
          hint={
            config.theme.mode === "dark"
              ? "Dark mode keeps a dark canvas; light colours are replaced."
              : "Light mode keeps a light canvas; dark colours are replaced."
          }
          onChange={(c) => c && update((d) => void (d.theme.background = c))}
        />
        <ColorField
          label="Accent"
          path="theme.accent"
          value={config.theme.accent}
          fallback={workspace.primaryColor}
          hint={config.theme.accent ? "Buttons, links and highlights." : "Empty uses your brand colour from Settings."}
          onChange={(c) => update((d) => void (d.theme.accent = c))}
        >
          <ContrastNotice
            config={config}
            color={accent}
            onFix={(c) => update((d) => void (d.theme.accent = c))}
          />
        </ColorField>
      </Group>

      <Group title="Typography" defaultOpen>
        <Segmented
          label="Font"
          value={config.theme.font}
          onChange={(font) => update((d) => void (d.theme.font = font))}
          options={fonts}
        />
      </Group>
    </div>
  );
}
